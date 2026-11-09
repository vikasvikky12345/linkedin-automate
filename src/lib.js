// Pure helpers, no Worker APIs, so test.mjs can import them in plain Node.

// LinkedIn "little text" treats these as markup; unescaped ones can truncate the post.
const RESERVED = /[\\|{}@\[\]()<>*_~#]/g;

export function littleText(text) {
  return text
    .split(/(#[A-Za-z][\w]*)/g)
    .map((part, i) => (i % 2 ? `{hashtag|\\#|${part.slice(1)}}` : part.replace(RESERVED, (c) => '\\' + c)))
    .join('');
}

// Oldest approved post first; ids are "YYYY-MM-DD-n" so string order is time order.
export function nextApproved(posts) {
  return posts.filter((p) => p.status === 'approved').sort((a, b) => a.id.localeCompare(b.id))[0];
}

export function validatePosts(data) {
  const posts = data?.posts;
  if (!Array.isArray(posts) || posts.length !== 3) throw new Error('Model must return exactly 3 posts');
  posts.forEach(validatePost);
  return posts;
}

export function validatePost(p) {
  if (!p.text || typeof p.text !== 'string') throw new Error('Post missing text');
  if (p.kind === 'carousel' && !(p.slides?.length >= 3)) throw new Error('Carousel needs 3+ slides');
  if (p.kind === 'video') {
    const v = p.video;
    const ids = new Set(v?.diagram?.nodes?.map((n) => n.id));
    if (!v?.title || ids.size < 2) throw new Error('Video needs a title and 2+ diagram nodes');
    if (!(v.steps?.length >= 2) || !v.steps.every((s) => ids.has(s.from) && ids.has(s.to) && s.caption)) throw new Error('Video steps must link diagram nodes and have captions');
  } else if (p.kind !== 'carousel' && !p.card?.title) throw new Error('Image post needs a card');
  return p;
}

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const SERIES = 'Learn AWS with Vikas';
const BRAND = SERIES;

// The next n topics from aws-topics.md ("1. Name | docs url" lines), starting at index start; wraps to the top at the end.
export function pickTopics(md, start = 0, n = 3) {
  const all = md
    .split('\n')
    .map((l) => l.match(/^\s*\d+\.\s+(.+)/)?.[1])
    .filter(Boolean)
    .map((l) => {
      const [name, url = null] = l.split(' | ').map((x) => x.trim());
      return { name, url };
    });
  if (all.length < n) throw new Error(`aws-topics.md needs at least ${n} numbered topics`);
  return { topics: Array.from({ length: n }, (_, i) => all[(start + i) % all.length]), next: (start + n) % all.length };
}

// Puts "Source: <url>" before the hashtag line at the end, unless the text already links it.
export function withSource(text, url) {
  if (!url || text.includes(url)) return text;
  const lines = text.trimEnd().split('\n');
  const at = /^\s*#\w/.test(lines.at(-1)) ? lines.length - 1 : lines.length;
  lines.splice(at, 0, `📖 Source: ${url}`, '');
  return lines.join('\n');
}

// 7 PM image alternates by day: cheat sheet one day, "what happens here?" puzzle the next.
export const kindsFor = (date) => ['carousel', 'video', Math.floor(Date.parse(date) / 864e5) % 2 ? 'cheatsheet' : 'puzzle'];

export const titleOf = (p) => (p.kind === 'carousel' ? p.slides[0].title : p.kind === 'video' ? p.video.title : p.card.title);
export const fileExt = (kind) => ({ carousel: 'pdf', video: 'mp4' })[kind] || 'png';

// ---------- Images: carousel slides, cards, flow diagrams, video page ----------

// Own coloured service labels (not the official AWS icons): one colour per service family.
const FAMILIES = [
  [/lambda|ec2|fargate|ecs|eks|auto ?scaling|container/i, '#f97316'], // compute
  [/s3|ebs|efs|glacier|storage|bucket/i, '#22c55e'], // storage
  [/dynamo|rds|aurora|elasticache|redshift|database|table/i, '#3b82f6'], // databases
  [/sqs|sns|eventbridge|step functions|scheduler|kinesis|queue|topic/i, '#ec4899'], // integration
  [/iam|kms|cognito|secret|acm|waf|mfa|sts|role|policy|root/i, '#ef4444'], // security
  [/vpc|cloudfront|route ?53|api gateway|load balancer|alb|nat|gateway|subnet|internet|dns/i, '#a855f7'], // networking
  [/cloudwatch|cloudtrail|cloudformation|sam|cdk|budget|cost|cli|console|parameter store|ssm/i, '#eab308'], // management
];
export const serviceColor = (service = '') => FAMILIES.find(([re]) => re.test(service))?.[1] || '#94a3b8';

// Top-to-bottom layout: each node's row is its longest path from a start node. Long chains wrap into side-by-side
// columns (read like a newspaper) so boxes keep a readable size. Edges are clipped to the box edges.
export function layout({ nodes = [], edges = [] }, W, H) {
  const row = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const ok = edges.filter((e) => e.from in row && e.to in row && e.from !== e.to);
  for (let k = 0; k < nodes.length; k++) for (const e of ok) row[e.to] = Math.min(Math.max(row[e.to], row[e.from] + 1), nodes.length - 1); // capped, so a cycle can't loop forever
  const rows = [...new Set(Object.values(row))].sort((a, b) => a - b);
  const cols = Math.ceil(rows.length / Math.max(1, Math.floor(H / 150)));
  const perCol = Math.ceil(rows.length / cols);
  const colW = W / cols;
  const widest = Math.max(1, ...rows.map((r) => nodes.filter((n) => row[n.id] === r).length));
  const w = Math.min(260, colW / widest - 30);
  const h = Math.min(130, H / perCol - 56);
  const pos = {};
  rows.forEach((r, ri) => {
    const inRow = nodes.filter((n) => row[n.id] === r);
    const col = Math.floor(ri / perCol);
    inRow.forEach((n, i) => {
      pos[n.id] = { ...n, x: col * colW + (colW * (i + 0.5)) / inRow.length, y: (H * ((ri % perCol) + 0.5)) / perCol };
    });
  });
  const clip = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity);
    return { x: a.x + dx * t, y: a.y + dy * t };
  };
  const line = (from, to) => {
    const a = clip(pos[from], pos[to]), b = clip(pos[to], pos[from]);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };
  return { W, H, w, h, nodes: Object.values(pos), edges: ok.map((e) => ({ ...e, ...line(e.from, e.to) })), line };
}

export function diagramHtml(lay) {
  const arrows = lay.edges
    .map((e) => `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="#64748b" stroke-width="5" marker-end="url(#arrow)"/>`)
    .join('');
  const labels = lay.edges
    .filter((e) => e.label)
    .map((e) => `<div class="elabel" style="left:${(e.x1 + e.x2) / 2}px;top:${(e.y1 + e.y2) / 2}px">${esc(e.label)}</div>`)
    .join('');
  const boxes = lay.nodes
    .map(
      (n) => `<div class="node" data-id="${esc(n.id)}" style="left:${n.x - lay.w / 2}px;top:${n.y - lay.h / 2}px;width:${lay.w}px;height:${lay.h}px;border-color:${serviceColor(n.service)}">
        <span class="svc" style="background:${serviceColor(n.service)}">${esc(n.service || '')}</span><b>${esc(n.label)}</b></div>`,
    )
    .join('');
  return `<div class="diagram" style="width:${lay.W}px;height:${lay.H}px">
    <svg width="${lay.W}" height="${lay.H}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#64748b"/></marker></defs>${arrows}</svg>
    ${labels}${boxes}</div>`;
}

const STYLE = `
  * { margin: 0; box-sizing: border-box; }
  body { font-family: 'Open Sans', sans-serif; background: #0f172a; color: #e2e8f0; }
  .page { width: 1080px; padding: 80px 90px; display: flex; flex-direction: column; gap: 36px; page-break-after: always; overflow: hidden; position: relative; }
  .top { display: flex; justify-content: space-between; align-items: center; font-size: 26px; font-weight: 700; color: #94a3b8; }
  .badge { background: #fbbf24; color: #0f172a; padding: 12px 28px; border-radius: 999px; letter-spacing: 1px; }
  .bar { height: 8px; background: #1e293b; border-radius: 4px; margin-top: -12px; }
  .bar i { display: block; height: 100%; background: #fbbf24; border-radius: 4px; }
  h1 { font-size: 62px; line-height: 1.15; color: #fbbf24; }
  .cover h1 { font-size: 78px; }
  p { font-size: 36px; line-height: 1.45; }
  pre { font: 32px/1.45 'JetBrains Mono', monospace; background: #1e293b; border-radius: 20px; padding: 32px 36px; white-space: pre-wrap; font-variant-ligatures: none; }
  .ba { display: flex; flex-direction: column; gap: 14px; }
  .ba span { font-size: 28px; font-weight: 700; }
  .before span { color: #f87171; } .before pre { border-left: 10px solid #f87171; }
  .after span { color: #4ade80; } .after pre { border-left: 10px solid #4ade80; }
  table { border-collapse: collapse; font-size: 30px; line-height: 1.35; }
  th { text-align: left; color: #0f172a; background: #fbbf24; padding: 16px 20px; }
  td { padding: 16px 20px; border-bottom: 2px solid #1e293b; vertical-align: top; }
  td:first-child { font-weight: 700; color: #fbbf24; }
  .card table { font-size: 36px; } .card td, .card th { padding: 26px 22px; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; font-size: 30px; color: #94a3b8; }
  .foot b { color: #fbbf24; }
  .diagram { position: relative; align-self: center; }
  .diagram svg { position: absolute; inset: 0; }
  .node { position: absolute; background: #1e293b; border: 5px solid; border-radius: 22px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; text-align: center; padding: 8px; transition: none; }
  .node b { font-size: 30px; line-height: 1.15; }
  .svc { color: #0f172a; font-size: 20px; font-weight: 700; padding: 3px 14px; border-radius: 999px; }
  .elabel { position: absolute; transform: translate(-50%, -50%); background: #0f172a; color: #cbd5e1; font-size: 22px; padding: 2px 10px; border-radius: 8px; white-space: nowrap; }
`;

const table = (t) =>
  `<table>${t.columns ? `<tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>` : ''}${(t.rows || [])
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</table>`;

// Renders whatever a slide or card has: body, code, before/after config, table, flow diagram.
// n/total are set for carousel slides only; slide 1 is the cover, the last slide asks for a follow.
const block = ({ title, body, code, before, after, table: t, diagram, footer }, height, n, total) => {
  const slide = n !== undefined;
  const right = !slide ? '' : n < total ? '<b>Swipe for more &gt;&gt;</b>' : '<b>Follow for more</b>';
  const ba = (cls, label, c) => (c ? `<div class="ba ${cls}"><span>${label}</span><pre>${esc(c)}</pre></div>` : '');
  return `
  <div class="page${!slide ? ' card' : n === 1 ? ' cover' : ''}" style="height:${height}px">
    <div class="top"><span class="badge">${BRAND}</span>${slide ? `<span>${n} / ${total}</span>` : ''}</div>
    ${slide ? `<div class="bar"><i style="width:${(n / total) * 100}%"></i></div>` : ''}
    <h1>${esc(title)}</h1>
    ${body ? `<p>${esc(body)}</p>` : ''}
    ${diagram?.nodes?.length ? diagramHtml(layout(diagram, 900, 600)) : ''}
    ${code ? `<pre>${esc(code)}</pre>` : ''}
    ${ba('before', 'Before', before)}${ba('after', 'After', after)}
    ${t?.rows?.length ? table(t) : ''}
    <div class="foot"><span>${esc(footer || '')}</span>${right}</div>
  </div>`;
};

export const cardHtml = (card) => `<html><head><style>${STYLE}</style></head><body>${block(card, 1350)}</body></html>`;

export const slidesHtml = (slides) =>
  `<html><head><style>${STYLE} @page { size: 1080px 1350px; margin: 0; }</style></head><body>${slides
    .map((s, i) => block(s, 1350, i + 1, slides.length))
    .join('')}</body></html>`;

// Video timing: 2 s title, then one step per edge (dot moves for 60% of it, then rests), 3 s outro. 20 to 30 s in all.
export function videoTimeline(steps) {
  const intro = 2, outro = 3;
  const total = Math.min(30, Math.max(20, intro + outro + steps * 3.5));
  return { intro, outro, total, step: (total - intro - outro) / steps };
}

// 1080x1350 page; window.frame(t) draws the moment t seconds in, so frames can be stepped and screenshotted.
export function videoHtml(v) {
  const lay = layout(v.diagram, 900, 800);
  const steps = v.steps.map((s) => ({ ...s, ...lay.line(s.from, s.to) }));
  const tl = videoTimeline(steps.length);
  const data = JSON.stringify({ steps, tl, outro: v.outro || `Follow for more ${SERIES}` }).replace(/</g, '\\u003c');
  return `<html><head><style>${STYLE}
    .stage { position: relative; }
    .dot { position: absolute; width: 40px; height: 40px; margin: -20px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 30px 10px rgba(251,191,36,.6); }
    .node.on { box-shadow: 0 0 40px 6px rgba(251,191,36,.55); }
    .cap { min-height: 190px; background: #1e293b; border-radius: 24px; padding: 28px 36px; font-size: 40px; line-height: 1.35; font-weight: 600; display: flex; align-items: center; }
    .count { color: #fbbf24; margin-right: 18px; }
  </style></head><body>
  <div class="page" style="height:1350px;gap:28px">
    <div class="top"><span class="badge">${BRAND}</span><span id="n"></span></div>
    <h1 style="font-size:54px">${esc(v.title)}</h1>
    <div class="stage">${diagramHtml(lay)}<div class="dot" id="dot"></div></div>
    <div class="cap" id="cap"></div>
  </div>
  <script>
    const D = ${data};
    const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
    const nodes = [...document.querySelectorAll('.node')];
    const dot = document.getElementById('dot'), cap = document.getElementById('cap'), n = document.getElementById('n');
    const stage = document.querySelector('.diagram');
    dot.style.left = stage.offsetLeft + 'px'; dot.style.top = stage.offsetTop + 'px';
    window.DURATION = D.tl.total;
    window.frame = (t) => {
      const i = Math.floor((t - D.tl.intro) / D.tl.step);
      const s = D.steps[Math.max(0, Math.min(i, D.steps.length - 1))];
      const intro = t < D.tl.intro, outro = i >= D.steps.length;
      const k = intro ? 0 : outro ? 1 : ease((t - D.tl.intro - i * D.tl.step) / (D.tl.step * 0.6));
      dot.style.opacity = intro ? 0 : 1;
      dot.style.transform = 'translate(' + (s.x1 + (s.x2 - s.x1) * k) + 'px,' + (s.y1 + (s.y2 - s.y1) * k) + 'px)';
      nodes.forEach((el) => el.classList.toggle('on', !intro && !outro && (el.dataset.id === s.from || el.dataset.id === s.to)));
      n.textContent = intro || outro ? '' : (i + 1) + ' / ' + D.steps.length;
      cap.innerHTML = '';
      if (intro) cap.textContent = 'Follow the request through the flow';
      else if (outro) cap.textContent = D.outro;
      else { const c = document.createElement('span'); c.className = 'count'; c.textContent = (i + 1) + '.'; cap.append(c, s.caption); }
    };
    frame(0);
  </script></body></html>`;
}

// ---------- Market report ----------

const decode = (s) =>
  s.replace(/&(lt|gt|quot|#39|apos|nbsp|#\d+);/g, (m, e) =>
    ({ lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' })[e] ?? String.fromCharCode(e.slice(1))).replace(/&amp;/g, '&');

// Feeds escape their HTML, so decode before stripping tags.
export const plainText = (s = '') => decode(decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Minimal RSS/Atom reader: these feeds are simple, so a regex beats adding an XML dependency.
export function parseFeed(xml, max = 20) {
  return [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)].slice(0, max).map(([block]) => {
    const tag = (name) => block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1] || '';
    const url = block.match(/<link\b[^>]*href="([^"]+)"/)?.[1] || plainText(tag('link'));
    const text = tag('description') || tag('summary') || tag('content') || tag('ht:news_item_title');
    return { title: plainText(tag('title')), url: decode(url), text: plainText(text).slice(0, 300) };
  });
}

// Links the model made up are dropped: only urls we actually fetched are kept, in every list.
export function validateReport(data, urls, listKey = 'gaps') {
  if (!Array.isArray(data?.[listKey]) || !data[listKey].length) throw new Error(`Model returned no ${listKey}`);
  const known = (x) => ({ ...x, url: urls.has(x?.url) ? x.url : null });
  const out = { headline: String(data.headline || '') };
  for (const [k, v] of Object.entries(data)) if (k !== 'headline') out[k] = Array.isArray(v) ? v.map(known) : v;
  return out;
}

const titled = (x) => (x.url ? `<a href="${esc(x.url)}">${esc(x.title)}</a>` : esc(x.title));
const section = (title, rows = [], row) => (rows.length ? `<h2>${title}</h2>${rows.map(row).join('')}` : '');
const notes = (title, rows) => section(title, rows, (x) => `<p>${titled(x)}: ${esc(x.note)}</p>`);

const footer = (r, { archive = [], other } = {}) => `<hr>
${other ? `<p>Also today: <a href="${esc(other.href)}">${esc(other.title)}</a></p>` : ''}
<p style="color:#64748b">Sources: ${esc(r.sources.join(', '))}${r.failed.length ? `<br>Failed today: ${esc(r.failed.join('; '))}` : ''}</p>
${archive.length ? `<p>Past reports: ${archive.map((a) => `<a href="${esc(a.href)}">${esc(a.date)}</a>`).join(' · ')}</p>` : ''}`;

export const marketHtml = (r, links) => `<h1>Market report ${esc(r.date)}</h1>
<p><b>${esc(r.headline)}</b></p>
${section('Gaps worth filling', r.gaps, (g) => `<h3>${titled(g)}</h3>
  <p>${esc(g.pain)}</p><p><b>Who pays:</b> ${esc(g.who)}<br><b>What to build:</b> ${esc(g.build)}</p>`)}
${r.idea ? `<h2>Idea for you (logistics &amp; e-commerce)</h2><h3>${esc(r.idea.title)}</h3><p>${esc(r.idea.pitch)}</p><p><b>First step this week:</b> ${esc(r.idea.firstStep)}</p>` : ''}
${notes('Trending', r.trends)}
${notes('Funding &amp; startup news', r.funding)}
${footer(r, links)}`;

const tag = (t) => `<span style="background:#e2e8f0;border-radius:4px;padding:1px 6px;font-size:13px">${esc(t)}</span>`;
const deepDive = (x) =>
  x ? `<h2>Deep dive: ${esc(x.title)}</h2>
  <p><b>Customers:</b> ${esc(x.customers)}</p><p><b>Competitors:</b> ${esc(x.competitors)}</p>
  <p><b>Numbers:</b> ${esc(x.numbers)}</p><p><b>Risks:</b> ${esc(x.risks)}</p><p><b>First step:</b> ${esc(x.firstStep)}</p>` : '';

export const ideasHtml = (r, links) => `<h1>Business ideas ${esc(r.date)}</h1>
<p><b>${esc(r.headline)}</b></p>
${section('Top ideas today', r.ideas, (i) => `<h3>${titled(i)}</h3>
  <p>${tag(i.category)} ${tag(i.cost)} ${tag(i.time)}</p>
  <p>${esc(i.what)}</p><p><b>Why now:</b> ${esc(i.why)}<br><b>How it makes money:</b> ${esc(i.money)}<br><b>First step:</b> ${esc(i.firstStep)}</p>`)}
${deepDive(r.deepDive)}
${notes('Startups getting funded', r.funding)}
${notes('Products to sell online', r.products)}
${notes('Local &amp; offline opportunities', r.local)}
${notes('Side hustles &amp; services', r.hustles)}
${footer(r, links)}`;

// ---------- Usage dashboard ----------

// DeepSeek USD per 1M tokens at peak (api-docs.deepseek.com/quick_start/pricing, Nov 2026); off-peak is half.
const PRICES = {
  'deepseek-flash': { hit: 0.006, miss: 0.3, out: 1.2 },
  'deepseek-v4-pro': { hit: 0.044, miss: 1.32, out: 3.96 },
};

// Peak is 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday. shortcut: ignores Chinese public holidays (off-peak), so those days read 2x high.
export function isPeak(at) {
  const h = at.getUTCHours();
  const day = at.getUTCDay();
  return day >= 1 && day <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
}

// usage is the "usage" object of a DeepSeek chat completion. Unknown models cost 0 until added to PRICES.
export function llmCost(model, usage, at) {
  const p = PRICES[model];
  if (!p) return 0;
  const hit = usage.prompt_cache_hit_tokens ?? 0;
  const miss = usage.prompt_cache_miss_tokens ?? usage.prompt_tokens - hit;
  return ((hit * p.hit + miss * p.miss + usage.completion_tokens * p.out) / 1e6) * (isPeak(at) ? 1 : 0.5);
}

// Turns the raw usage-table items into the dashboard numbers. today is "YYYY-MM-DD"; money is USD.
// llm/run rows from other projects carry an "agent" (e.g. linkedin-service) and maybe a "client"; rows without one are this project's.
// awsProjects: daily AWS cost grouped by the "project" cost-allocation tag ("" = untagged, i.e. other projects in the account).
export function summarize({ llm = [], runs = [], aws = [], awsProjects = [], balance }, today) {
  const month = today.slice(0, 7);
  const projects = {};
  const project = (name) => (projects[name] ??= { project: name, aws: 0, llm: 0 });
  for (const a of awsProjects) if (a.sk.startsWith(month)) for (const [p, v] of Object.entries(a.projects || {})) project(p || 'other (untagged)').aws += v;
  const clients = {};
  const days = {};
  const day = (date) => (days[date] ??= { date, aws: 0, llm: 0 });
  const jobs = {};
  const job = (name) => (jobs[name] ??= { job: name, runs: 0, failed: 0, tokens: 0, cost: 0 });
  const services = {};

  for (const a of aws) {
    day(a.sk).aws = a.total;
    if (a.sk.startsWith(today.slice(0, 7))) for (const [s, v] of Object.entries(a.services || {})) services[s] = (services[s] || 0) + v;
  }
  const jobName = (x) => (x.agent ? `${x.agent} / ${x.job}` : x.job);
  for (const u of llm) {
    day(u.date).llm += u.cost;
    if (u.date.startsWith(month)) project(u.agent || 'linkedin-agent').llm += u.cost;
    if (u.client) {
      const c = (clients[u.client] ??= { client: u.client, tokens: 0, cost: 0 });
      c.tokens += u.inTokens + u.outTokens;
      c.cost += u.cost;
    }
    const j = job(jobName(u));
    j.tokens += u.inTokens + u.outTokens;
    j.cost += u.cost;
  }
  for (const r of runs) {
    job(jobName(r)).runs++;
    if (!r.ok) job(jobName(r)).failed++;
  }

  const list = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  const inMonth = list.filter((d) => d.date.startsWith(today.slice(0, 7)));
  return {
    days: list,
    today: days[today] || { date: today, aws: 0, llm: 0 },
    month: { aws: inMonth.reduce((s, d) => s + d.aws, 0), llm: inMonth.reduce((s, d) => s + d.llm, 0) },
    jobs: Object.values(jobs).sort((a, b) => b.cost - a.cost),
    services: Object.entries(services).sort((a, b) => b[1] - a[1]),
    runs: [...runs].sort((a, b) => b.sk.localeCompare(a.sk)).slice(0, 15),
    projects: Object.values(projects).sort((a, b) => b.aws + b.llm - (a.aws + a.llm)),
    clients: Object.values(clients).sort((a, b) => b.cost - a.cost),
    balance,
  };
}

export const usd = (n = 0) => '$' + (n >= 1 || n === 0 ? n.toFixed(2) : n.toFixed(3));

export function dashboardHtml(s) {
  const max = Math.max(0.001, ...s.days.map((d) => d.aws + d.llm));
  const bars = s.days
    .slice(-30)
    .map(
      (d) => `<div class="bar" title="${d.date}: AWS ${usd(d.aws)}, DeepSeek ${usd(d.llm)}">
        <i style="height:${(d.llm / max) * 100}%;background:#6366f1"></i><i style="height:${(d.aws / max) * 100}%;background:#f59e0b"></i></div>`,
    )
    .join('');
  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const bal = s.balance ? `${esc(s.balance.amount.toFixed(2))} ${esc(s.balance.currency)} <small>(${esc(s.balance.sk)})</small>` : 'not collected yet';
  return `<style>
    body{color:#0f172a;background:#fff} small,.muted{color:#64748b} h2{margin:28px 0 8px;font-size:18px}
    .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
    .kpi{border:1px solid #e2e8f0;border-radius:10px;padding:12px} .kpi b{display:block;font-size:24px}
    .chart{display:flex;align-items:flex-end;gap:2px;height:120px;border-bottom:1px solid #e2e8f0}
    .bar{flex:1;height:100%;display:flex;flex-direction:column-reverse} .bar i{display:block}
    table{width:100%;border-collapse:collapse;font-size:14px} td{padding:6px 4px;border-bottom:1px solid #f1f5f9}
    tr:first-child td{font-weight:600;color:#64748b} td:not(:first-child){text-align:right;white-space:nowrap}
    @media (prefers-color-scheme:dark){body{color:#e2e8f0;background:#0f172a}.kpi,.chart{border-color:#334155}td{border-color:#1e293b}}
  </style>
  <h1 style="font-size:22px">Spend and usage</h1>
  <div class="kpis">
    <div class="kpi">This month<b>${usd(s.month.aws + s.month.llm)}</b><small>AWS ${usd(s.month.aws)} · DeepSeek ${usd(s.month.llm)}<br>AWS before credits</small></div>
    <div class="kpi">Today<b>${usd(s.today.aws + s.today.llm)}</b><small>AWS shows up a day late</small></div>
    <div class="kpi">DeepSeek balance<b style="font-size:18px">${bal}</b></div>
  </div>
  <h2>Daily cost, last 30 days</h2>
  <div class="chart">${bars || '<span class="muted">No data yet</span>'}</div>
  <small><span style="color:#f59e0b">■</span> AWS <span style="color:#6366f1">■</span> DeepSeek</small>
  <h2>By project (this month)</h2>
  <table>${row(['Project', 'AWS', 'DeepSeek', 'Total'])}${s.projects
    .map((p) => row([esc(p.project), usd(p.aws), usd(p.llm), `<b>${usd(p.aws + p.llm)}</b>`]))
    .join('')}</table>
  <small>AWS split by the "project" cost-allocation tag; untagged is everything else in the account.</small>
  ${s.clients.length ? `<h2>linkedin-service clients (DeepSeek, last 35 days)</h2>
  <table>${row(['Client', 'Tokens', 'Cost'])}${s.clients.map((c) => row([esc(c.client), c.tokens.toLocaleString('en-IN'), usd(c.cost)])).join('')}</table>` : ''}
  <h2>By job (last 35 days)</h2>
  <table>${row(['Job', 'Runs', 'Tokens', 'Cost', 'Failed'])}${s.jobs
    .map((j) => row([esc(j.job), j.runs, j.tokens.toLocaleString('en-IN'), usd(j.cost), j.failed || '']))
    .join('')}</table>
  <h2>AWS by service (this month, before credits)</h2>
  <table>${s.services.map(([n, v]) => row([esc(n), usd(v)])).join('') || row(['<span class="muted">Not collected yet</span>'])}</table>
  <h2>Recent runs</h2>
  <table>${row(['When (UTC)', 'Job', 'Time', 'Result'])}${s.runs
    .map((r) => row([esc(r.sk.slice(5, 16).replace('T', ' ')), esc(r.agent ? `${r.agent} / ${r.job}${r.client ? ` (${r.client})` : ''}` : r.job), `${Math.round(r.ms / 1000)}s`, r.ok ? '✅' : `❌ <small>${esc(r.error || '')}</small>`]))
    .join('')}</table>`;
}
