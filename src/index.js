import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { readFileSync } from 'node:fs';
import { renderVideo } from './video.js';
import { LambdaClient, GetFunctionUrlConfigCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { littleText, nextApproved, validatePosts, validatePost, cardHtml, slidesHtml, esc, parseFeed, plainText, validateReport, marketHtml, ideasHtml, llmCost, summarize, dashboardHtml, usd, pickTopics, SERIES, withSource, kindsFor, titleOf, fileExt } from './lib.js';

const { BUCKET, TABLE, GITHUB_REPO, LINKEDIN_VERSION } = process.env;
const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST

// EventBridge Scheduler sends {"job": "draft" | "publish" | "market" | "ideas" | "costs"}; everything else is a Function URL request.
export async function handler(event) {
  const env = await config();
  if (event.job) return safely(env, { draft, publish, market, ideas, edit, costs }[event.job], event);

  const q = event.queryStringParameters || {};
  if (event.rawPath === '/review') {
    if (event.requestContext.http.method !== 'POST') return reviewPage(q);
    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
    return review(Object.fromEntries(new URLSearchParams(body)));
  }
  if (event.rawPath === '/auth') return startAuth(env, q);
  if (event.rawPath === '/callback') return finishAuth(env, q);
  if (event.rawPath === '/report') return report(env, q);
  if (event.rawPath === '/dashboard') return dashboard(env, q);
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
let running = 'web'; // the job in progress, so DeepSeek usage is logged against it (Lambda runs one event at a time)
async function safely(env, job, event) {
  running = job.name;
  const start = Date.now();
  let error;
  try {
    await job(env, event);
  } catch (e) {
    error = e;
    console.error(e);
    await email(env, `LinkedIn agent failed: ${job.name}`, `<pre>${esc(e.stack || e.message)}</pre>`);
  } finally {
    await record({ pk: 'run', sk: stamp(), date: today(), job: job.name, ok: !error, ms: Date.now() - start, error: error?.message?.slice(0, 300) });
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

// ---------- 9 AM: write 3 posts on the next 3 AWS topics and email them ----------

async function draft(env) {
  const { topics, next } = pickTopics(await github(env, 'aws-topics.md'), (await get('state/aws-next.json'))?.next ?? 0);
  const recent = (await get('state/recent.json')) || [];
  const date = today();
  const posts = await writePosts(env, topics, recent, kindsFor(date));

  const media = await render(posts);
  const saved = [];
  for (const [i, p] of posts.entries()) {
    const post = {
      id: `${date}-${i}`,
      kind: p.kind,
      title: titleOf(p),
      text: p.text,
      source: p.source,
      slides: p.slides, // kept so the edit job can re-render the media
      card: p.card,
      video: p.video,
      token: crypto.randomUUID(),
      status: 'pending',
    };
    await put(`media/${post.id}`, media[i]);
    await put(`posts/${post.id}.json`, post);
    saved.push(post);
  }
  await put('state/recent.json', [...saved.map((p) => p.title), ...recent].slice(0, 30));
  await put('state/aws-next.json', { next }); // only after the posts are saved, so a failed day retries the same topics

  const auth = await get('state/li.json');
  const reconnect =
    !auth || auth.expires - Date.now() < 7 * 864e5
      ? `<p style="color:#b91c1c"><b>LinkedIn access ${auth ? 'expires soon' : 'not connected'}.</b> <a href="${env.APP_URL}/auth?key=${env.ADMIN_KEY}">Reconnect LinkedIn</a></p>`
      : '';
  const body = saved
    .map(
      (p, i) => `<hr><h3>${i + 1}. ${esc(p.kind)}: ${esc(p.title)} (${p.id})</h3>
        <div style="white-space:pre-wrap;font-family:sans-serif">${esc(p.text)}</div>
        ${p.source ? `<p>Check the facts against: <a href="${esc(p.source)}">${esc(p.source)}</a></p>` : ''}
        <p><a href="${env.APP_URL}/review?id=${p.id}&t=${p.token}">Review &amp; approve</a></p>`,
    )
    .join('');
  const spend = await spendLine(env).catch((e) => (console.error('spend line failed', e), '')); // never block the posts
  await email(env, `3 LinkedIn posts for ${date}`, `${reconnect}${spend}<p>Approved posts go out at 10 AM (carousel), 2 PM (video) and 7 PM (image), one per slot. Visuals are attached.</p>${body}`, saved.map((p, i) => ({
    filename: `${i + 1}-${p.kind}.${fileExt(p.kind)}`,
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

// The AWS docs page for a topic as markdown (docs.aws.amazon.com serves <page>.md), so the post is grounded in it.
async function docs(url) {
  if (!url) return '';
  try {
    return (await fetchText(url.replace(/\.html$/, '.md'))).replace(/<[^>]+>/g, '').slice(0, 7000);
  } catch (e) {
    console.error('docs fetch failed', url, e); // a post without a source beats no email at all
    return '';
  }
}

async function writePosts(env, topics, recent, kinds) {
  const sources = await Promise.all(topics.map((t) => docs(t.url)));
  const third =
    kinds[2] === 'cheatsheet'
      ? `{"kind":"cheatsheet","text":"...","card":{"title":"<topic> cheat sheet","table":{"columns":["...","..."],"rows":[["...","..."]]},"footer":"Save this for later"}}`
      : `{"kind":"puzzle","text":"...","card":{"title":"What happens here?","body":"one-line setup","code":"...","footer":"Answer in the comments"}}`;
  const prompt = `You write LinkedIn posts for a developer who builds serverless apps on AWS (Lambda, S3, DynamoDB, EventBridge, SAM) and is learning AWS in public.

Write exactly 3 posts, one per AWS concept, in this order:
1. carousel: ${topics[0].name}
2. video: ${topics[1].name}
3. ${kinds[2]}: ${topics[2].name}
Avoid repeating these recent posts: ${JSON.stringify(recent)}

Return JSON only:
{"posts":[
 {"kind":"carousel","text":"...","slides":[
   {"title":"hook question or bold claim","diagram":{"nodes":[{"id":"a","label":"...","service":"..."}],"edges":[{"from":"a","to":"b","label":"optional"}]}},
   {"title":"...","body":"...","code":"optional"},
   {"title":"...","before":"config or code","after":"config or code","body":"optional, one line"},
   {"title":"...","table":{"columns":["...","..."],"rows":[["...","..."]]}},
   {"title":"Cheat sheet","table":{"rows":[["term","what to remember"]]}}]},
 {"kind":"video","text":"...","video":{"title":"...","diagram":{"nodes":[...],"edges":[...]},"steps":[{"from":"a","to":"b","caption":"..."}],"outro":"one-line takeaway"}},
 ${third}
]}

Rules:
- The goal is to make the concept click. Every post explains: what the thing is and the problem it solves, how it actually works step by step (the mental model), when to use it vs the alternative, and the one mistake beginners make. Explain like a good teacher to someone who has never used it; use a simple everyday analogy where it helps.
- Ground every fact in the SOURCE for that topic below (official AWS docs). Do not state anything the source does not support. If the source is empty, stick to long-standing basics.
- Every post text starts with the series line "${SERIES} | <topic in 2 to 5 words>", then a blank line, then the hook.
- Hook: one or two short lines that make people click "see more" (only about 200 characters show). Use a different hook style for each of the 3 posts: scenario ("Picture this: ..."), did you know, confession ("while learning I ..."), quiz, or myth vs fact.
- Never claim something happened at a job or with a real colleague or client. Scenarios are framed as "picture this", "imagine", or "while learning".
- Do not quote prices, free-tier amounts or quotas unless the source states them.
- Code means real AWS code or config: AWS CLI commands, IAM policy JSON, SAM/CloudFormation YAML, or AWS SDK for JavaScript v3. Never invent CLI flags or API names. Code supports the explanation; it is not the point.
- End with a specific question that invites a comment, never a generic "Thoughts?". Then 3 to 5 hashtags like #AWS #LearnAWSWithVikas #CloudComputing.
- text: 1000 to 1900 characters, plain text (no markdown, no **). Do not add a source line; it is added for you.
- Diagrams: 3 to 6 nodes in flow order, label 1 to 3 words, service a short AWS service name (Lambda, S3, IAM, VPC, ...) or a plain role (User, Internet, Laptop). Edge labels 1 to 3 words.
- carousel: 8 to 10 slides. Slide 1: hook title plus a flow diagram of the concept. Then one idea per slide: what it is, how it works, an analogy, when to use it vs the alternative, a before/after slide (wrong vs right config), a comparison table, the common mistake. Last slide: the cheat sheet table (4 to 6 rows) with footer "Follow for more ${SERIES}".
- video: a 20 to 30 second silent animation where a dot (the request or data) moves through the diagram. 4 to 7 steps, each moving along one edge from one node to the next, in order. caption: what happens at that step and why, max 90 characters, plain words. The text explains the same flow in more depth.
- puzzle: a short scenario (config, policy, command) and "what happens?". Never reveal the answer in the card or text; ask people to comment their answer with a one-line reason. The text explains the concept around it without giving it away.
- cheatsheet: one image that sums up the concept: 5 to 8 rows, 2 or 3 columns (e.g. term / what it does / when to use, or a side-by-side comparison). The text walks through the most important rows.
- Honest learner voice, not guru claims.
- Slides, cards and captions: no emoji (the renderer has no emoji font). Code at most 10 lines, 48 characters wide; before/after at most 6 lines each. Table cells at most 40 characters.

${topics.map((t, i) => `SOURCE for post ${i + 1} (${t.url || 'none'}):\n${sources[i] || '(empty)'}`).join('\n\n')}

STYLE GUIDE FOR THE POST TEXT (wins over the rules above where they differ):
${POST_STYLE}`;

  // The model sometimes breaks the shape (e.g. a 2-slide carousel); ask again once before failing the day.
  // kind comes from the slot, not the model, so a mislabelled post can't land in the wrong slot.
  const ask = async () => validatePosts({ posts: (await deepseek(env, [{ role: 'user', content: prompt }]))?.posts?.map((p, i) => ({ ...p, kind: kinds[i] })) });
  let posts;
  try {
    posts = await ask();
  } catch (e) {
    console.error('bad draft, retrying', e);
    posts = await ask();
  }
  console.log('before humanizer', JSON.stringify(posts.map((p) => p.text))); // to compare in the logs
  const human = await humanize(env, posts).catch((e) => (console.error('humanize failed, keeping the first draft', e), posts)); // a worse text beats no email at all
  return human.map((p, i) => ({ ...p, source: topics[i].url, text: withSource(p.text, topics[i].url) }));
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
- the first line "${SERIES} | ..." exactly as it is,
- the hook's style (question, quiz, "Did you know", confession or scenario) and the closing question,
- every technical fact, every code line exactly as written, the emojis, and the hashtags at the end.
A LinkedIn post can use short paragraphs; that is not a tell. Do not add facts.
Return JSON only: {"texts":["...","...","..."]} in the same order.

${JSON.stringify(posts.map((p) => p.text))}`,
    },
  ]);
  const texts = out?.texts;
  if (!Array.isArray(texts) || texts.length !== posts.length) throw new Error('humanizer returned the wrong shape');
  return posts.map((p, i) => (texts[i]?.startsWith(SERIES) ? { ...p, text: texts[i] } : p));
}

const MODEL = 'deepseek-flash';

async function deepseek(env, messages) {
  const start = Date.now();
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    // deepseek-chat was retired 2026-07-24; thinking off keeps the old behaviour and cost.
    body: JSON.stringify({ model: MODEL, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, messages }),
  });
  if (!r.ok) throw new Error(`DeepSeek: ${r.status} ${await r.text()}`);
  const res = await r.json();
  const u = res.usage;
  if (u) {
    await record({
      pk: 'llm', sk: stamp(), date: today(), job: running, model: MODEL, ms: Date.now() - start,
      inTokens: u.prompt_tokens, cacheHitTokens: u.prompt_cache_hit_tokens ?? 0, outTokens: u.completion_tokens,
      cost: llmCost(MODEL, u, new Date()),
    });
  }
  return JSON.parse(res.choices[0].message.content);
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
      } else if (p.kind === 'video') {
        out.push(await renderVideo(page, p.video));
      } else {
        await page.setViewport({ width: 1080, height: 1350 });
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
  const visual = Boolean(post.slides || post.card || post.video);
  const old = { kind: post.kind, text: post.text, slides: post.slides, card: post.card, video: post.video };
  const out = await deepseek(env, [
    {
      role: 'user',
      content: `You edit one LinkedIn post. Apply this change and keep everything else as it is:
${instruction}

Return JSON only, ${visual ? 'the same shape as the post below' : '{"text":"..."}'}.
Keep the first line (the "... with Vikas | ..." series line) unless the change is about it, and keep the hashtags at the end.
Slides, cards and video captions: no emoji, code at most 10 lines, 48 characters wide. A carousel keeps 8 to 10 slides. Keep the "📖 Source:" line.

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
    text: withSource(next.text, post.source),
    ...(visual && { slides: next.slides, card: next.card, video: next.video, title: titleOf(next) }),
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
    media ? [{ filename: `${id}.${fileExt(saved.kind)}`, content: Buffer.from(media).toString('base64') }] : [],
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
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`LinkedIn ${path}: ${r.status} ${await r.text()}`);
    return r;
  };

  const bytes = await get(`media/${post.id}`, 'bytes');
  let mediaId;
  if (post.kind === 'video') mediaId = await uploadVideo(li, auth, bytes);
  else {
    const type = post.kind === 'carousel' ? 'documents' : 'images';
    const init = await (await li(`${type}?action=initializeUpload`, { initializeUploadRequest: { owner: auth.urn } })).json();
    const up = await fetch(init.value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${auth.token}` }, body: bytes });
    if (!up.ok) throw new Error(`LinkedIn upload: ${up.status} ${await up.text()}`);
    mediaId = init.value.image || init.value.document;
  }

  await li('posts', {
    author: auth.urn,
    commentary: littleText(post.text),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: mediaId, title: post.title } },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  });
  await del(`posts/${post.id}.json`);
  await del(`media/${post.id}`);
}

// Videos API: upload in the parts LinkedIn asks for (4 MB each), finalize with their ETags, then wait until it is AVAILABLE.
async function uploadVideo(li, auth, bytes) {
  const { value: v } = await (
    await li('videos?action=initializeUpload', { initializeUploadRequest: { owner: auth.urn, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false } })
  ).json();
  const etags = [];
  for (const part of v.uploadInstructions) {
    const r = await fetch(part.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes.subarray(part.firstByte, part.lastByte + 1) });
    if (!r.ok) throw new Error(`LinkedIn video upload: ${r.status} ${await r.text()}`);
    etags.push(r.headers.get('etag'));
  }
  await li('videos?action=finalizeUpload', { finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || '', uploadedPartIds: etags } });
  for (let i = 0; i < 60; i++) {
    const { status } = await (await li(`videos/${encodeURIComponent(v.video)}`)).json();
    if (status === 'AVAILABLE') return v.video;
    if (status === 'PROCESSING_FAILED') throw new Error(`LinkedIn could not process video ${v.video}`);
    await new Promise((ok) => setTimeout(ok, 5000));
  }
  throw new Error(`LinkedIn video ${v.video} still processing after 5 minutes`);
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

// ---------- Usage table: pk "llm" | "run" (sk = time), "aws" | "balance" (sk = date) ----------

const stamp = () => `${new Date().toISOString()}#${crypto.randomUUID().slice(0, 8)}`;

// Logging must never break a job, so failures are only printed.
async function record(item) {
  try {
    const ttl = Math.floor(Date.now() / 1000) + 400 * 86400; // DynamoDB deletes items after ~13 months
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...item, ttl } }));
  } catch (e) {
    console.error('usage log failed', e);
  }
}

// shortcut: no pagination (1 MB per query, thousands of items); page through LastEvaluatedKey once many agents log here.
async function loadUsage(days) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const query = async (pk, extra = { KeyConditionExpression: 'pk = :pk AND sk >= :since', ExpressionAttributeValues: { ':pk': pk, ':since': since } }) =>
    (await ddb.send(new QueryCommand({ TableName: TABLE, ...extra }))).Items;
  const [llm, runs, aws, awsProjects, [balance]] = await Promise.all([
    query('llm'),
    query('run'),
    query('aws'),
    query('awsproject'),
    query('balance', { KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': 'balance' }, ScanIndexForward: false, Limit: 1 }),
  ]);
  return { llm, runs, aws, awsProjects, balance };
}

const dashboardUrl = (env) => `${env.APP_URL}/dashboard?key=${env.ADMIN_KEY}`;

async function dashboard(env, q) {
  if (q.key !== env.ADMIN_KEY) return { statusCode: 403, body: 'Forbidden' };
  return html(dashboardHtml(summarize(await loadUsage(35), today())));
}

const ALERT_PER_DAY = 3; // USD/day, AWS (before credits) + DeepSeek. Normal is ~$2/day from other projects; $70/month budget is ~$2.3/day
const LOW_BALANCE = 2;

// Yesterday in IST. AWS days are UTC, close enough for a daily total.
async function yesterday() {
  const date = new Date(Date.now() + 5.5 * 3600e3 - 864e5).toISOString().slice(0, 10);
  return summarize(await loadUsage(3), today()).days.find((d) => d.date === date) || { date, aws: 0, llm: 0 };
}

async function spendLine(env) {
  const y = await yesterday();
  return `<p>Yesterday's spend: <b>${usd(y.aws + y.llm)}</b> (AWS ${usd(y.aws)}, DeepSeek ${usd(y.llm)}). <a href="${dashboardUrl(env)}">Dashboard</a></p>`;
}

// ---------- 8:45 AM: AWS + DeepSeek spend for the dashboard, alert email when over the limit ----------

async function costs(env) {
  const utcDay = (ago) => new Date(Date.now() - ago * 864e5).toISOString().slice(0, 10);
  // Cost Explorer is $0.01 per call and only in us-east-1. Two calls a day refresh the last 7 days, since recent days keep changing.
  const ce = await new CostExplorerClient({ region: 'us-east-1' }).send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: utcDay(7), End: utcDay(0) },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      Filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Usage'] } }, // real usage; free-plan credits would net it to ~0
    }),
  );
  for (const r of ce.ResultsByTime) {
    const services = Object.fromEntries(r.Groups.map((g) => [g.Keys[0], Number(g.Metrics.UnblendedCost.Amount)]).filter(([, v]) => v > 0));
    await record({ pk: 'aws', sk: r.TimePeriod.Start, total: Object.values(services).reduce((s, v) => s + v, 0), services });
  }
  // Same days split by the "project" tag (linkedin-agent, linkedin-service; "" = untagged). Needs the tag activated in Billing > Cost allocation tags.
  const byProject = await new CostExplorerClient({ region: 'us-east-1' }).send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: utcDay(7), End: utcDay(0) },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'TAG', Key: 'project' }],
      Filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Usage'] } },
    }),
  );
  for (const r of byProject.ResultsByTime) {
    const projects = Object.fromEntries(r.Groups.map((g) => [g.Keys[0].replace(/^project\$/, ''), Number(g.Metrics.UnblendedCost.Amount)]).filter(([, v]) => v > 0));
    await record({ pk: 'awsproject', sk: r.TimePeriod.Start, projects });
  }

  const b = await fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` } });
  if (!b.ok) throw new Error(`DeepSeek balance: ${b.status} ${await b.text()}`);
  const infos = (await b.json()).balance_infos || [];
  const info = infos.find((i) => i.currency === 'USD') || infos[0];
  if (info) await record({ pk: 'balance', sk: today(), amount: Number(info.total_balance), currency: info.currency });

  const y = await yesterday();
  const problems = [];
  if (y.aws + y.llm > ALERT_PER_DAY) problems.push(`Yesterday's spend was <b>${usd(y.aws + y.llm)}</b> (AWS ${usd(y.aws)}, DeepSeek ${usd(y.llm)}), over your ${usd(ALERT_PER_DAY)}/day limit.`);
  // shortcut: compares the number as is, so a CNY balance is checked against 2 CNY.
  if (info && Number(info.total_balance) < LOW_BALANCE) problems.push(`DeepSeek balance is down to <b>${esc(info.total_balance)} ${esc(info.currency)}</b>. Top up at platform.deepseek.com.`);
  if (problems.length) await email(env, 'Spend alert', `<p>${problems.join('</p><p>')}</p><p><a href="${dashboardUrl(env)}">Open the dashboard</a></p>`);
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
