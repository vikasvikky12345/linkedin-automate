import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { readFileSync } from 'node:fs';
import { LambdaClient, GetFunctionUrlConfigCommand } from '@aws-sdk/client-lambda';
import { littleText, nextApproved, validatePosts, validatePost, cardHtml, slidesHtml, esc, parseFeed, plainText, validateReport, marketHtml, ideasHtml } from './lib.js';

const { BUCKET, GITHUB_REPO, LINKEDIN_VERSION } = process.env;
const s3 = new S3Client({});
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST

// EventBridge Scheduler sends {"job": "draft" | "publish" | "market" | "ideas"}; everything else is a Function URL request.
export async function handler(event) {
  const env = await config();
  if (event.job) return safely(env, { draft, publish, market, ideas, edit }[event.job], event);

  const q = event.queryStringParameters || {};
  if (event.rawPath === '/review') {
    if (event.requestContext.http.method !== 'POST') return reviewPage(q);
    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
    return review(Object.fromEntries(new URLSearchParams(body)));
  }
  if (event.rawPath === '/auth') return startAuth(env, q);
  if (event.rawPath === '/callback') return finishAuth(env, q);
  if (event.rawPath === '/report') return report(env, q);
  return { statusCode: 404, body: 'Not found' };
}

// Secrets live in SSM under /linkedin-agent/; loaded once per warm container.
let cached;
async function config() {
  if (cached) return cached;
  const env = {};
  let NextToken;
  do {
    const r = await new SSMClient({}).send(new GetParametersByPathCommand({ Path: '/linkedin-agent/', WithDecryption: true, NextToken }));
    for (const p of r.Parameters) env[p.Name.split('/').pop()] = p.Value;
    NextToken = r.NextToken;
  } while (NextToken);
  const url = await new LambdaClient({}).send(new GetFunctionUrlConfigCommand({ FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME }));
  return (cached = { ...env, APP_URL: url.FunctionUrl.replace(/\/$/, '') });
}

// Errors are emailed, not thrown: a retry would draft and email a second batch.
async function safely(env, job, event) {
  try {
    await job(env, event);
  } catch (e) {
    console.error(e);
    await email(env, `LinkedIn agent failed: ${job.name}`, `<pre>${esc(e.stack || e.message)}</pre>`);
  }
}

// ---------- S3 storage: posts/<id>.json, media/<id>, state/*.json ----------

async function get(Key, as = 'json') {
  try {
    const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key }));
    return as === 'bytes' ? Body.transformToByteArray() : JSON.parse(await Body.transformToString());
  } catch (e) {
    if (e.name === 'NoSuchKey') return null;
    throw e;
  }
}
const put = (Key, body) =>
  s3.send(new PutObjectCommand({ Bucket: BUCKET, Key, Body: body instanceof Uint8Array ? body : JSON.stringify(body) }));
const del = (Key) => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }));
const list = async (Prefix) => ((await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix }))).Contents || []).map((o) => o.Key);

// ---------- 9 AM: write 3 posts from the latest prep notes and email them ----------

async function draft(env) {
  const notes = await latestNotes(env);
  const progress = await github(env, 'progress.md');
  const recent = (await get('state/recent.json')) || [];
  const posts = await writePosts(env, notes, progress, recent);

  const media = await render(posts);
  const date = today();
  const saved = [];
  for (const [i, p] of posts.entries()) {
    const post = {
      id: `${date}-${i}`,
      kind: p.kind,
      title: p.kind === 'carousel' ? p.slides[0].title : p.card.title,
      text: p.text,
      slides: p.slides, // kept so the edit job can re-render the image
      card: p.card,
      token: crypto.randomUUID(),
      status: 'pending',
    };
    await put(`media/${post.id}`, media[i]);
    await put(`posts/${post.id}.json`, post);
    saved.push(post);
  }
  await put('state/recent.json', [...saved.map((p) => p.title), ...recent].slice(0, 30));

  const auth = await get('state/li.json');
  const reconnect =
    !auth || auth.expires - Date.now() < 7 * 864e5
      ? `<p style="color:#b91c1c"><b>LinkedIn access ${auth ? 'expires soon' : 'not connected'}.</b> <a href="${env.APP_URL}/auth?key=${env.ADMIN_KEY}">Reconnect LinkedIn</a></p>`
      : '';
  const body = saved
    .map(
      (p, i) => `<hr><h3>${i + 1}. ${esc(p.kind)}: ${esc(p.title)} (${p.id})</h3>
        <div style="white-space:pre-wrap;font-family:sans-serif">${esc(p.text)}</div>
        <p><a href="${env.APP_URL}/review?id=${p.id}&t=${p.token}">Review &amp; approve</a></p>`,
    )
    .join('');
  await email(env, `3 LinkedIn posts for ${date}`, `${reconnect}<p>Approved posts go out at 10 AM, 2 PM and 7 PM, one per slot. Visuals are attached.</p>${body}`, saved.map((p, i) => ({
    filename: `${i + 1}-${p.kind}.${p.kind === 'carousel' ? 'pdf' : 'png'}`,
    content: Buffer.from(media[i]).toString('base64'),
  })));
}

async function github(env, path, raw = true) {
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'User-Agent': 'linkedin-agent',
    },
  });
  if (!r.ok) throw new Error(`GitHub ${path}: ${r.status} ${await r.text()}`);
  return raw ? r.text() : r.json();
}

async function latestNotes(env) {
  const files = (await github(env, 'notes', false)).map((f) => f.name).filter((n) => n.endsWith('.md')).sort();
  if (!files.length) throw new Error('No notes in the repo yet. Finish a /js-angular-prep session first.');
  const name = files.at(-1);
  return { date: name.slice(0, -3), text: await github(env, `notes/${name}`) };
}

async function writePosts(env, notes, progress, recent) {
  const prompt = `You write LinkedIn posts for a frontend developer who is preparing for JavaScript + Angular interviews and learning in public.

Write exactly 3 posts from their latest study notes (${notes.date}). If the notes are not from yesterday, write revision posts: pick a different angle or a weak topic from the progress file.
Avoid repeating these recent posts: ${JSON.stringify(recent)}

Return JSON only:
{"posts":[
 {"kind":"carousel","text":"...","slides":[{"title":"...","body":"...","code":"optional"}]},
 {"kind":"puzzle","text":"...","card":{"title":"What does this print?","code":"...","footer":"Answer in the comments"}},
 {"kind":"tip","text":"...","card":{"title":"...","body":"...","code":"optional"}}
]}

Rules:
- Every post text starts with the series line "Learn JS with Vikas | <topic in 2 to 5 words>", then a blank line, then the hook.
- Hook: one or two short lines that make people click "see more" (only about 200 characters show). Use a different hook style for each of the 3 posts, picked from:
  * Scenario: "Picture this: a form saves quantity 0 and the API gets 10 instead..." (a realistic bug from a real project, then "this is exactly what tripped me up in my prep").
  * Did you know: one surprising fact, e.g. "Did you know null >= 0 is true but null == 0 is false?"
  * Confession: "I got this wrong 3 times this week."
  * Quiz: "Quick one before your coffee: what does this print?"
  * Myth vs fact: "Everyone says ?? is just a safer ||. Not quite."
- Never claim something happened at a job or with a real colleague or client. Scenarios are framed as "picture this", "imagine", or "in my prep today".
- After the hook, really teach it: the problem, why JavaScript behaves that way (the actual rule), and the fix or the right mental model. Short paragraphs, one idea each. A beginner should understand it without the image.
- End with a specific question that invites a comment (e.g. "Which of these 4 lines surprised you?"), never a generic "Thoughts?" or "Agree?". Then 3 to 5 hashtags like #JavaScript #LearnJSWithVikas.
- text: 900 to 1800 characters, plain text (no markdown, no **). A few arrows or numbers for steps are fine.
- carousel: 6 to 8 slides. Slide 1 is a hook question or bold claim, then one idea per slide (problem, why, fix, common mistake), last slide a 3-line summary plus "Follow for more Learn JS with Vikas".
- puzzle: a short tricky snippet. Never reveal the answer in the card or post text; tell people to comment their answer with a one-line reason. The text can explain the concept around it without giving away the output.
- tip: one practical takeaway or a mistake they made, with before/after code on the card.
- Honest learner voice, not guru claims.
- Slides and cards: no emoji (the image renderer has no emoji font). Code at most 12 lines, 50 characters wide.

STYLE GUIDE FOR THE POST TEXT (wins over the rules above where they differ):
${POST_STYLE}

PROGRESS FILE:
${progress}

STUDY NOTES:
${notes.text}`;

  // The model sometimes breaks the shape (e.g. a 2-slide carousel); ask again once before failing the day.
  let posts;
  try {
    posts = validatePosts(await deepseek(env, [{ role: 'user', content: prompt }]));
  } catch (e) {
    console.error('bad draft, retrying', e);
    posts = validatePosts(await deepseek(env, [{ role: 'user', content: prompt }]));
  }
  console.log('before humanizer', JSON.stringify(posts.map((p) => p.text))); // to compare in the logs
  try {
    return await humanize(env, posts);
  } catch (e) {
    console.error('humanize failed, keeping the first draft', e); // a worse text beats no email at all
    return posts;
  }
}

// Second pass with the humanizer skill (MIT, github.com/blader/humanizer) to strip AI writing tells.
const HUMANIZER = readFileSync(new URL('./humanizer/SKILL.md', import.meta.url), 'utf8');
const POST_STYLE = readFileSync(new URL('./post-style.md', import.meta.url), 'utf8');

async function humanize(env, posts) {
  const out = await deepseek(env, [
    { role: 'system', content: HUMANIZER },
    {
      role: 'user',
      content: `Embedded mode. Rewrite each LinkedIn post text below using the rules above. Keep for each post:
- the first line "Learn JS with Vikas | ..." exactly as it is,
- the hook's style (question, quiz, "Did you know", confession or scenario) and the closing question,
- every technical fact, every code line exactly as written, the emojis, and the hashtags at the end.
A LinkedIn post can use short paragraphs; that is not a tell. Do not add facts.
Return JSON only: {"texts":["...","...","..."]} in the same order.

${JSON.stringify(posts.map((p) => p.text))}`,
    },
  ]);
  const texts = out?.texts;
  if (!Array.isArray(texts) || texts.length !== posts.length) throw new Error('humanizer returned the wrong shape');
  return posts.map((p, i) => (texts[i]?.startsWith('Learn JS with Vikas') ? { ...p, text: texts[i] } : p));
}

async function deepseek(env, messages) {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    // deepseek-chat was retired 2026-07-24; thinking off keeps the old behaviour and cost.
    body: JSON.stringify({ model: 'deepseek-flash', thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, messages }),
  });
  if (!r.ok) throw new Error(`DeepSeek: ${r.status} ${await r.text()}`);
  return JSON.parse((await r.json()).choices[0].message.content);
}

// Chromium is ~60 MB, so it is only loaded on the 9 AM run.
async function render(posts) {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([import('@sparticuz/chromium'), import('puppeteer-core')]);
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
  try {
    const page = await browser.newPage();
    const out = [];
    for (const p of posts) {
      if (p.kind === 'carousel') {
        await page.setContent(slidesHtml(p.slides));
        out.push(await page.pdf({ width: '1080px', height: '1350px', printBackground: true }));
      } else {
        await page.setViewport({ width: 1080, height: 1080 });
        await page.setContent(cardHtml(p.card));
        out.push(await page.screenshot({ type: 'png' }));
      }
    }
    return out;
  } finally {
    await browser.close();
  }
}

// ---------- On demand ("run job" GitHub Action): rewrite one post from an instruction ----------

async function edit(env, { id, instruction }) {
  const post = /^[\w-]+$/.test(id || '') && (await get(`posts/${id}.json`));
  if (!post) throw new Error(`No post ${id}: published, rejected, older than 14 days, or a wrong id.`);
  if (!instruction?.trim()) throw new Error('Edit needs an instruction');

  // Posts drafted before the edit job existed have no slides/card saved, so only their text can change.
  const visual = Boolean(post.slides || post.card);
  const old = { kind: post.kind, text: post.text, slides: post.slides, card: post.card };
  const out = await deepseek(env, [
    {
      role: 'user',
      content: `You edit one LinkedIn post. Apply this change and keep everything else as it is:
${instruction}

Return JSON only, ${visual ? 'the same shape as the post below' : '{"text":"..."}'}.
Keep the first line "Learn JS with Vikas | ..." unless the change is about it, and keep the hashtags at the end.
Slides and cards: no emoji, code at most 12 lines, 50 characters wide. A carousel keeps 6 to 8 slides.

STYLE GUIDE FOR THE POST TEXT:
${POST_STYLE}

POST:
${JSON.stringify(old)}`,
    },
  ]);
  const next = visual ? validatePost({ ...old, ...out, kind: post.kind }) : { text: out.text };
  if (!next.text || typeof next.text !== 'string') throw new Error('Edit returned no text');

  const saved = {
    ...post,
    text: next.text,
    ...(visual && { slides: next.slides, card: next.card, title: next.kind === 'carousel' ? next.slides[0].title : next.card.title }),
    status: 'pending', // an edited post needs approving again
  };
  if (visual) await put(`media/${id}`, (await render([saved]))[0]);
  await put(`posts/${id}.json`, saved);

  const media = await get(`media/${id}`, 'bytes');
  await email(
    env,
    `Edited post ${id}`,
    `<p>Change: ${esc(instruction)}${visual ? '' : '<br><i>Only the text changed: this post was drafted before images could be re-rendered.</i>'}</p>
    <h3>${esc(saved.kind)}: ${esc(saved.title)} (${id})</h3>
    <div style="white-space:pre-wrap;font-family:sans-serif">${esc(saved.text)}</div>
    <p><a href="${env.APP_URL}/review?id=${id}&t=${saved.token}">Review &amp; approve</a></p>`,
    media ? [{ filename: `${id}.${saved.kind === 'carousel' ? 'pdf' : 'png'}`, content: Buffer.from(media).toString('base64') }] : [],
  );
}

// ---------- Approve / reject ----------

async function findPost(id, token) {
  if (!/^[\w-]+$/.test(id || '')) return null;
  const post = await get(`posts/${id}.json`);
  return post && post.token === token ? post : null;
}

// GET only shows a form, so email link scanners can't approve posts by opening the link.
async function reviewPage(q) {
  const post = await findPost(q.id, q.t);
  if (!post) return html('<p>This post was already handled or the link is invalid.</p>');
  return html(`<h2>${esc(post.title)}</h2>
    <div style="white-space:pre-wrap">${esc(post.text)}</div>
    <p>Status: <b>${post.status}</b></p>
    <form method="post">
      <input type="hidden" name="id" value="${esc(post.id)}"><input type="hidden" name="t" value="${esc(post.token)}">
      <button name="action" value="approve" style="font-size:20px">Approve</button>
      <button name="action" value="reject" style="font-size:20px">Reject</button>
    </form>`);
}

async function review(form) {
  const post = await findPost(form.id, form.t);
  if (!post) return html('<p>This post was already handled or the link is invalid.</p>');
  if (form.action === 'approve') {
    await put(`posts/${post.id}.json`, { ...post, status: 'approved' });
    return html('<p>✅ Approved. It will be posted in the next slot (10 AM, 2 PM or 7 PM).</p>');
  }
  await del(`posts/${post.id}.json`);
  await del(`media/${post.id}`);
  return html('<p>❌ Rejected and deleted.</p>');
}

// ---------- 10 AM / 2 PM / 7 PM: publish one approved post ----------

async function publish(env) {
  const posts = await Promise.all((await list('posts/')).map((k) => get(k)));
  const post = nextApproved(posts.filter(Boolean));
  if (!post) return;

  const auth = await get('state/li.json');
  if (!auth) throw new Error(`Post ${post.id} is approved but LinkedIn is not connected. Open ${env.APP_URL}/auth?key=${env.ADMIN_KEY}`);

  const li = async (path, body) => {
    const r = await fetch(`https://api.linkedin.com/rest/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`LinkedIn ${path}: ${r.status} ${await r.text()}`);
    return r;
  };

  const type = post.kind === 'carousel' ? 'documents' : 'images';
  const init = await (await li(`${type}?action=initializeUpload`, { initializeUploadRequest: { owner: auth.urn } })).json();
  const up = await fetch(init.value.uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${auth.token}` },
    body: await get(`media/${post.id}`, 'bytes'),
  });
  if (!up.ok) throw new Error(`LinkedIn upload: ${up.status} ${await up.text()}`);

  await li('posts', {
    author: auth.urn,
    commentary: littleText(post.text),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: init.value.image || init.value.document, title: post.title } },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  });
  await del(`posts/${post.id}.json`);
  await del(`media/${post.id}`);
}

// ---------- 10 AM / 10:30 AM: market and business-ideas reports, emailed as a link ----------

const UA = 'Mozilla/5.0 (compatible; market-report/1.0)';
const ECOM_SUBS = 'r/smallbusiness+Entrepreneur+SaaS+StartUpIndia+ecommerce';
const IDEA_SUBS = 'r/Entrepreneur+sidehustle+startups+indianstartups+smallbusiness';
const ONLY_REAL_URLS = 'Every url must be copied exactly from the data below. Use null if nothing fits; never invent a link.';

const REPORTS = {
  market: {
    title: 'Market report',
    listKey: 'gaps',
    html: marketHtml,
    sources: (since) => ({
      'Hacker News (Show HN)': () => hn(`tags=show_hn&numericFilters=created_at_i>${since}`),
      'Hacker News (Ask HN)': () => hn(`tags=ask_hn&numericFilters=created_at_i>${since}`),
      // Reddit's JSON API is 403 without OAuth; its RSS feeds are open.
      'Reddit (top today)': () => feed(`https://www.reddit.com/${ECOM_SUBS}/top/.rss?t=day&limit=40`, 40),
      'Reddit (asking for tools)': () =>
        feed(`https://www.reddit.com/${ECOM_SUBS}/search.rss?restrict_sr=1&sort=new&t=week&limit=40&q=${encodeURIComponent('"is there a tool" OR "I wish there was" OR "looking for an app"')}`, 40),
      'Product Hunt': () => feed('https://www.producthunt.com/feed'),
      Inc42: () => feed('https://inc42.com/feed/'),
      YourStory: () => feed('https://yourstory.com/feed'),
      Entrackr: () => feed('https://entrackr.com/rss'),
      'Google Trends India': () => feed('https://trends.google.com/trending/rss?geo=IN'),
    }),
    prompt: (data, recent) => `You are a market analyst for a software developer in India who builds warehouse and shipping software for Indian e-commerce sellers (WMS, courier aggregation, NDR, COD, RTO, Shopify/Amazon/Meesho channel integrations) and wants to start a profitable side business.

Below is what people posted, launched, searched and funded in the last day. Find business opportunities in it.

Return JSON only:
{"headline":"one sentence: the most interesting signal today",
 "gaps":[{"title":"short name of the gap","pain":"the problem people have, in their words where possible","who":"who would pay and roughly how much","build":"the smallest product or service that fills it","url":"the source url it came from"}],
 "trends":[{"title":"...","note":"why it matters, one sentence","url":"..."}],
 "funding":[{"title":"...","note":"what it says about where money is going","url":"..."}],
 "idea":{"title":"...","pitch":"2 to 3 sentences","firstStep":"one concrete thing to do this week to validate it"}}

Rules:
- gaps: 3 to 6, best first. Prefer real pain someone would pay to fix over tech novelty. India-relevant gaps first.
- ${ONLY_REAL_URLS}
- trends: up to 5. funding: up to 5, Indian startups first.
- idea: one opportunity that fits his logistics and e-commerce experience, inspired by today's data.
- Plain, simple English. No hype words.
- Avoid repeating these recent gaps: ${JSON.stringify(recent)}

DATA:
${data}`,
  },
  ideas: {
    title: 'Business ideas',
    listKey: 'ideas',
    html: ideasHtml,
    sources: (since) => ({
      TechCrunch: () => feed('https://techcrunch.com/category/startups/feed/'),
      'Crunchbase News': () => feed('https://news.crunchbase.com/feed/'),
      'Economic Times Startups': () => feed('https://economictimes.indiatimes.com/tech/startups/rssfeeds/78570540.cms'),
      'Economic Times Small Business': () => feed('https://economictimes.indiatimes.com/small-biz/rssfeeds/5575607.cms'),
      Inc42: () => feed('https://inc42.com/feed/'),
      'Reddit (top today)': () => feed(`https://www.reddit.com/${IDEA_SUBS}/top/.rss?t=day&limit=40`, 40),
      'Reddit (would pay for)': () =>
        feed(`https://www.reddit.com/${IDEA_SUBS}/search.rss?restrict_sr=1&sort=new&t=week&limit=40&q=${encodeURIComponent('"would pay for" OR "is there a service" OR "business idea"')}`, 40),
      'Google Trends India': () => feed('https://trends.google.com/trending/rss?geo=IN'),
      'Google Trends US': () => feed('https://trends.google.com/trending/rss?geo=US'),
      'Product Hunt': () => feed('https://www.producthunt.com/feed'),
      'Hacker News (Show HN)': () => hn(`tags=show_hn&numericFilters=created_at_i>${since}`),
      'PIB (Government of India, Hindi)': () => feed('https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3'),
    }),
    prompt: (data, recent) => `You are a business advisor for someone in India who wants to start a profitable business. It can be anything: an online business, selling products on e-commerce, a local or offline shop or service, a side hustle, or a funded startup. They are a software developer, but do not limit ideas to software. Budget is open and they have not decided between a side business and going full-time, so label every idea with both.

Below is what people posted, launched, searched, funded and what the government announced in the last day (some items are in Hindi; always answer in English). Find business opportunities in it.

Return JSON only:
{"headline":"one sentence: the most interesting opportunity today",
 "ideas":[{"title":"...","category":"online | ecommerce | local | service | startup","what":"what the business is, 1 to 2 sentences","why":"the signal in today's data that shows demand","url":"source url","cost":"startup cost in rupees, e.g. ₹20k-50k","time":"side business | full-time","money":"how it makes money, with rough pricing","firstStep":"one concrete thing to do this week to test it"}],
 "funding":[{"title":"...","note":"what investors are paying for","url":"..."}],
 "products":[{"title":"...","note":"why it could sell online now","url":"..."}],
 "local":[{"title":"...","note":"the local or offline opportunity in India","url":"..."}],
 "hustles":[{"title":"...","note":"the service people are asking to pay for","url":"..."}],
 "deepDive":{"title":"the most promising idea above","customers":"who buys and how to reach them","competitors":"who already does it and their weak spot","numbers":"rough costs, price, margin and break-even","risks":"what could go wrong","firstStep":"what to do this week"}}

Rules:
- ideas: exactly 3, best first, from different categories. At least one should be cheap (under ₹50k) and one should not be software.
- funding, products, local, hustles: up to 4 each; leave a list empty if today's data has nothing real for it.
- Government items: only mention schemes, subsidies or rule changes that open a business opportunity.
- ${ONLY_REAL_URLS}
- India first. Plain, simple English. No hype words. Be honest about costs and risks.
- Avoid repeating these recent ideas: ${JSON.stringify(recent)}

DATA:
${data}`,
  },
};

const market = (env) => runReport(env, 'market');
const ideas = (env) => runReport(env, 'ideas');

async function runReport(env, type) {
  const cfg = REPORTS[type];
  const sources = cfg.sources(Math.floor(Date.now() / 1000) - 86400);
  const names = Object.keys(sources);
  const results = await Promise.allSettled(names.map((n) => sources[n]()));
  const items = {};
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.length) items[names[i]] = r.value;
    else failed.push(`${names[i]} (${r.reason?.message || 'no items'})`);
  });
  if (!Object.keys(items).length) throw new Error(`Every source failed: ${failed.join('; ')}`);

  const recent = (await get(`state/${type}-recent.json`)) || [];
  const data = Object.entries(items)
    .map(([name, list]) => `## ${name}\n${list.map((x) => `- ${x.title} | ${x.url} | ${x.text}`).join('\n')}`)
    .join('\n\n');
  const urls = new Set(Object.values(items).flat().map((x) => x.url));
  const out = validateReport(await deepseek(env, [{ role: 'user', content: cfg.prompt(data, recent) }]), urls, cfg.listKey);
  const r = { type, date: today(), ...out, sources: Object.keys(items), failed };
  await put(`reports/${type}/${r.date}.json`, r);
  await put(`state/${type}-recent.json`, [...r[cfg.listKey].map((x) => x.title), ...recent].slice(0, 30));

  const link = reportUrl(env, type, r.date);
  await email(env, `${cfg.title} ${r.date}: ${r[cfg.listKey].length} ${cfg.listKey}`, `<p><b>${esc(r.headline)}</b></p>
    <ul>${r[cfg.listKey].map((x) => `<li>${esc(x.title)}</li>`).join('')}</ul>
    <p><a href="${link}" style="font-size:18px">Open the full report</a></p>
    ${failed.length ? `<p style="color:#64748b">Failed today: ${esc(failed.join('; '))}</p>` : ''}`);
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20e3) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

const feed = async (url, max) => parseFeed(await fetchText(url), max);

const hn = async (query) =>
  JSON.parse(await fetchText(`https://hn.algolia.com/api/v1/search?${query}&hitsPerPage=25`)).hits.map((h) => ({
    title: h.title,
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    text: `${h.points} points. ${plainText(h.story_text || '')}`.slice(0, 300),
  }));

const reportUrl = (env, type, date) => `${env.APP_URL}/report?type=${type}&date=${date}&key=${env.ADMIN_KEY}`;

// Protected by ADMIN_KEY like /auth; the key only travels in your own email.
async function report(env, q) {
  if (q.key !== env.ADMIN_KEY) return { statusCode: 403, body: 'Forbidden' };
  const type = REPORTS[q.type] ? q.type : 'market';
  const prefix = `reports/${type}/`;
  const dates = (await list(prefix)).map((k) => k.slice(prefix.length, -'.json'.length)).sort().reverse();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : dates[0];
  const r = date && (await get(`${prefix}${date}.json`));
  if (!r) return html('<p>No report for that day yet.</p>');
  const other = type === 'market' ? 'ideas' : 'market';
  return html(
    REPORTS[type].html(r, {
      archive: dates.slice(0, 14).map((d) => ({ date: d, href: reportUrl(env, type, d) })),
      other: { title: REPORTS[other].title, href: reportUrl(env, other, date) },
    }),
  );
}

// ---------- LinkedIn login (one click every ~60 days) ----------

async function startAuth(env, q) {
  if (q.key !== env.ADMIN_KEY) return { statusCode: 403, body: 'Forbidden' };
  const state = crypto.randomUUID();
  await put('state/oauth.json', { state, expires: Date.now() + 600e3 });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINKEDIN_CLIENT_ID,
    redirect_uri: `${env.APP_URL}/callback`,
    state,
    scope: 'openid profile w_member_social',
  });
  return { statusCode: 302, headers: { Location: `https://www.linkedin.com/oauth/v2/authorization?${params}` } };
}

async function finishAuth(env, q) {
  const saved = await get('state/oauth.json');
  if (!saved || saved.expires < Date.now() || q.state !== saved.state) return { statusCode: 403, body: 'Invalid state' };
  await del('state/oauth.json');

  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: q.code,
      redirect_uri: `${env.APP_URL}/callback`,
      client_id: env.LINKEDIN_CLIENT_ID,
      client_secret: env.LINKEDIN_CLIENT_SECRET,
    }),
  });
  if (!r.ok) return html(`<p>LinkedIn login failed: ${esc(await r.text())}</p>`);
  const { access_token, expires_in } = await r.json();
  const me = await (await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${access_token}` } })).json();
  await put('state/li.json', { token: access_token, expires: Date.now() + expires_in * 1000, urn: `urn:li:person:${me.sub}` });
  return html(`<p>✅ LinkedIn connected as ${esc(me.name)}. Valid for ${Math.round(expires_in / 86400)} days.</p>`);
}

// ---------- helpers ----------

const html = (body) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
  body: `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;max-width:640px;margin:24px auto;padding:0 16px">${body}`,
});

async function email(env, subject, body, attachments = []) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'LinkedIn Agent <onboarding@resend.dev>', to: [env.EMAIL_TO], subject, html: body, attachments }),
  });
  if (!r.ok) throw new Error(`Resend: ${r.status} ${await r.text()}`);
}
