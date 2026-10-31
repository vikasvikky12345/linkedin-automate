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

const STYLE = `
  * { margin: 0; box-sizing: border-box; }
  body { font-family: 'Open Sans', sans-serif; background: #0f172a; color: #e2e8f0; }
  .page { width: 1080px; padding: 90px; display: flex; flex-direction: column; gap: 40px; page-break-after: always; }
  h1 { font-size: 64px; line-height: 1.15; color: #fbbf24; }
  p { font-size: 38px; line-height: 1.45; }
  pre { font: 34px/1.5 'JetBrains Mono', monospace; background: #1e293b; border-radius: 20px; padding: 40px; white-space: pre-wrap; font-variant-ligatures: none; }
  .foot { margin-top: auto; font-size: 28px; color: #94a3b8; }
`;

const block = ({ title, body, code, footer }, height) => `
  <div class="page" style="height:${height}px">
    <h1>${esc(title)}</h1>
    ${body ? `<p>${esc(body)}</p>` : ''}
    ${code ? `<pre>${esc(code)}</pre>` : ''}
    <div class="foot">${esc(footer || '')}</div>
  </div>`;

export const cardHtml = (card) => `<html><head><style>${STYLE}</style></head><body>${block(card, 1080)}</body></html>`;

export const slidesHtml = (slides) =>
  `<html><head><style>${STYLE} @page { size: 1080px 1350px; margin: 0; }</style></head><body>${slides
    .map((s, i) => block({ ...s, footer: `${i + 1} / ${slides.length}` }, 1350))
    .join('')}</body></html>`;
