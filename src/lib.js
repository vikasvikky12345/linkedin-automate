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
  for (const p of posts) {
    if (!p.text || typeof p.text !== 'string') throw new Error('Post missing text');
    if (p.kind === 'carousel' && !(p.slides?.length >= 3)) throw new Error('Carousel needs 3+ slides');
    if (p.kind !== 'carousel' && !p.card?.title) throw new Error('Image post needs a card');
  }
  return posts;
}

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BRAND = 'Learn JS with Vikas';

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
