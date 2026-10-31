import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { readFileSync } from 'node:fs';
import { LambdaClient, GetFunctionUrlConfigCommand } from '@aws-sdk/client-lambda';
import { littleText, nextApproved, validatePosts, cardHtml, slidesHtml, esc } from './lib.js';

const { BUCKET, GITHUB_REPO, LINKEDIN_VERSION } = process.env;
const s3 = new S3Client({});
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST

// EventBridge Scheduler sends {"job": "draft" | "publish"}; everything else is a Function URL request.
export async function handler(event) {
  const env = await config();
  if (event.job) return safely(env, event.job === 'draft' ? draft : publish);

  const q = event.queryStringParameters || {};
  if (event.rawPath === '/review') {
    if (event.requestContext.http.method !== 'POST') return reviewPage(q);
    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
    return review(Object.fromEntries(new URLSearchParams(body)));
  }
  if (event.rawPath === '/auth') return startAuth(env, q);
  if (event.rawPath === '/callback') return finishAuth(env, q);
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
async function safely(env, job) {
  try {
    await job(env);
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
      (p, i) => `<hr><h3>${i + 1}. ${esc(p.kind)}: ${esc(p.title)}</h3>
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

PROGRESS FILE:
${progress}

STUDY NOTES:
${notes.text}`;

  const posts = validatePosts(await deepseek(env, [{ role: 'user', content: prompt }]));
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

async function humanize(env, posts) {
  const out = await deepseek(env, [
    { role: 'system', content: HUMANIZER },
    {
      role: 'user',
      content: `Embedded mode. Rewrite each LinkedIn post text below using the rules above. Keep for each post:
- the first line "Learn JS with Vikas | ..." exactly as it is,
- the hook's style (question, quiz, "Did you know", confession or scenario) and the closing question,
- every technical fact and code value, and the hashtags at the end.
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
    body: JSON.stringify({ model: 'deepseek-chat', response_format: { type: 'json_object' }, messages }),
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
