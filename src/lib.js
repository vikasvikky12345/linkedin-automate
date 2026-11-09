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
  if (p.kind !== 'carousel' && !p.card?.title) throw new Error('Image post needs a card');
  return p;
}

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const SERIES = 'Learn AWS with Vikas';
const BRAND = SERIES;

// The next n topics from aws-topics.md (its "1. ..." lines), starting at index start; wraps to the top at the end.
export function pickTopics(md, start = 0, n = 3) {
  const all = md.split('\n').map((l) => l.match(/^\s*\d+\.\s+(.+)/)?.[1].trim()).filter(Boolean);
  if (all.length < n) throw new Error(`aws-topics.md needs at least ${n} numbered topics`);
  return { topics: Array.from({ length: n }, (_, i) => all[(start + i) % all.length]), next: (start + n) % all.length };
}

const STYLE = `
  * { margin: 0; box-sizing: border-box; }
  body { font-family: 'Open Sans', sans-serif; background: #0f172a; color: #e2e8f0; }
  .page { width: 1080px; padding: 80px 90px; display: flex; flex-direction: column; gap: 40px; page-break-after: always; }
  .top { display: flex; justify-content: space-between; align-items: center; font-size: 26px; font-weight: 700; color: #94a3b8; }
  .badge { background: #fbbf24; color: #0f172a; padding: 12px 28px; border-radius: 999px; letter-spacing: 1px; }
  .bar { height: 8px; background: #1e293b; border-radius: 4px; margin-top: -16px; }
  .bar i { display: block; height: 100%; background: #fbbf24; border-radius: 4px; }
  h1 { font-size: 64px; line-height: 1.15; color: #fbbf24; }
  .cover { justify-content: center; }
  .cover h1 { font-size: 96px; margin-top: auto; }
  p { font-size: 38px; line-height: 1.45; }
  pre { font: 34px/1.5 'JetBrains Mono', monospace; background: #1e293b; border-radius: 20px; padding: 40px; white-space: pre-wrap; font-variant-ligatures: none; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; font-size: 30px; color: #94a3b8; }
  .foot b { color: #fbbf24; }
`;

// n/total are set for carousel slides only; slide 1 is the cover, the last slide asks for a follow.
const block = ({ title, body, code, footer }, height, n, total) => {
  const slide = n !== undefined;
  const right = !slide ? '' : n < total ? '<b>Swipe for more &gt;&gt;</b>' : '<b>Follow for more</b>';
  return `
  <div class="page${slide && n === 1 ? ' cover' : ''}" style="height:${height}px">
    <div class="top"><span class="badge">${BRAND}</span>${slide ? `<span>${n} / ${total}</span>` : ''}</div>
    ${slide ? `<div class="bar"><i style="width:${(n / total) * 100}%"></i></div>` : ''}
    <h1>${esc(title)}</h1>
    ${body ? `<p>${esc(body)}</p>` : ''}
    ${code ? `<pre>${esc(code)}</pre>` : ''}
    <div class="foot"><span>${esc(footer || '')}</span>${right}</div>
  </div>`;
};

export const cardHtml = (card) => `<html><head><style>${STYLE}</style></head><body>${block(card, 1080)}</body></html>`;

export const slidesHtml = (slides) =>
  `<html><head><style>${STYLE} @page { size: 1080px 1350px; margin: 0; }</style></head><body>${slides
    .map((s, i) => block(s, 1350, i + 1, slides.length))
    .join('')}</body></html>`;

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
