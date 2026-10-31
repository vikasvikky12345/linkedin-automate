import puppeteer from '@cloudflare/puppeteer';
import { Buffer } from 'node:buffer';
import { littleText, nextApproved, validatePosts, cardHtml, slidesHtml, esc } from './lib.js';

const DRAFT_CRON = '30 3 * * *';
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(safely(env, event.cron === DRAFT_CRON ? draft : publish));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/review') return req.method === 'POST' ? review(req, env) : reviewPage(url, env);
    if (url.pathname === '/auth') return startAuth(url, env);
    if (url.pathname === '/callback') return finishAuth(url, env);
    return new Response('Not found', { status: 404 });
  },
};

async function safely(env, job) {
  try {
    await job(env);
  } catch (e) {
    console.error(e);
    await email(env, `LinkedIn agent failed: ${job.name}`, `<pre>${esc(e.stack || e.message)}</pre>`);
  }
}

// ---------- 9 AM: write 3 posts from the latest prep notes and email them ----------

async function draft(env) {
  const notes = await latestNotes(env);
  const progress = await github(env, 'progress.md');
  const recent = (await env.KV.get('recent', 'json')) || [];
  const posts = await writePosts(env, notes, progress, recent);

  const media = await render(env, posts);
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
    await env.KV.put(`media:${post.id}`, media[i]);
    await env.KV.put(`post:${post.id}`, JSON.stringify(post));
    saved.push(post);
  }
  await env.KV.put('recent', JSON.stringify([...saved.map((p) => p.title), ...recent].slice(0, 30)));

  const auth = await env.KV.get('li', 'json');
  const reconnect =
    !auth || auth.expires - Date.now() < 7 * 864e5
      ? `<p style="color:#b91c1c"><b>LinkedIn access ${auth ? 'expires soon' : 'not connected'}.</b> <a href="${env.WORKER_URL}/auth?key=${env.ADMIN_KEY}">Reconnect LinkedIn</a></p>`
      : '';
  const body = saved
    .map(
      (p, i) => `<hr><h3>${i + 1}. ${esc(p.kind)}: ${esc(p.title)}</h3>
        <div style="white-space:pre-wrap;font-family:sans-serif">${esc(p.text)}</div>
        <p><a href="${env.WORKER_URL}/review?id=${p.id}&t=${p.token}">Review &amp; approve</a></p>`,
    )
    .join('');
  await email(env, `3 LinkedIn posts for ${date}`, `${reconnect}<p>Approved posts go out at 10 AM, 2 PM and 7 PM, one per slot. Visuals are attached.</p>${body}`, saved.map((p, i) => ({
    filename: `${i + 1}-${p.kind}.${p.kind === 'carousel' ? 'pdf' : 'png'}`,
    content: Buffer.from(media[i]).toString('base64'),
  })));
}

async function github(env, path, raw = true) {
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
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
- carousel: 5 to 8 slides teaching one concept step by step. Last slide is a short summary.
- puzzle: a short tricky snippet. Never reveal the answer in the card or post text.
- tip: one practical takeaway or a mistake they made and the fix.
- text: 500 to 1200 characters, strong first line, short paragraphs, plain text (no markdown, no **), 3 to 5 hashtags at the end like #JavaScript.
- Honest learner voice ("today I learned", "I got this wrong"), not guru claims.
- Code on cards: at most 12 lines, 50 characters wide.

PROGRESS FILE:
${progress}

STUDY NOTES:
${notes.text}`;

  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`DeepSeek: ${r.status} ${await r.text()}`);
  return validatePosts(JSON.parse((await r.json()).choices[0].message.content));
}

async function render(env, posts) {
  const browser = await puppeteer.launch(env.BROWSER);
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

async function findPost(env, id, token) {
  const post = await env.KV.get(`post:${id}`, 'json');
  return post && post.token === token ? post : null;
}

// GET only shows a form, so email link scanners can't approve posts by opening the link.
async function reviewPage(url, env) {
  const post = await findPost(env, url.searchParams.get('id'), url.searchParams.get('t'));
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

async function review(req, env) {
  const form = await req.formData();
  const post = await findPost(env, form.get('id'), form.get('t'));
  if (!post) return html('<p>This post was already handled or the link is invalid.</p>');
  if (form.get('action') === 'approve') {
    await env.KV.put(`post:${post.id}`, JSON.stringify({ ...post, status: 'approved' }));
    return html('<p>✅ Approved. It will be posted in the next slot (10 AM, 2 PM or 7 PM).</p>');
  }
  await env.KV.delete(`post:${post.id}`);
  await env.KV.delete(`media:${post.id}`);
  return html('<p>❌ Rejected and deleted.</p>');
}

// ---------- 10 AM / 2 PM / 7 PM: publish one approved post ----------

async function publish(env) {
  const { keys } = await env.KV.list({ prefix: 'post:' });
  const posts = await Promise.all(keys.map((k) => env.KV.get(k.name, 'json')));
  const post = nextApproved(posts.filter(Boolean));
  if (!post) return;

  const auth = await env.KV.get('li', 'json');
  if (!auth) throw new Error(`Post ${post.id} is approved but LinkedIn is not connected. Open ${env.WORKER_URL}/auth?key=${env.ADMIN_KEY}`);

  const li = async (path, body) => {
    const r = await fetch(`https://api.linkedin.com/rest/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'LinkedIn-Version': env.LINKEDIN_VERSION,
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
    body: await env.KV.get(`media:${post.id}`, 'arrayBuffer'),
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
  await env.KV.delete(`post:${post.id}`);
  await env.KV.delete(`media:${post.id}`);
}

// ---------- LinkedIn login (one click every ~60 days) ----------

async function startAuth(url, env) {
  if (url.searchParams.get('key') !== env.ADMIN_KEY) return new Response('Forbidden', { status: 403 });
  const state = crypto.randomUUID();
  await env.KV.put('oauth_state', state, { expirationTtl: 600 });
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINKEDIN_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/callback`,
    state,
    scope: 'openid profile w_member_social',
  });
  return Response.redirect(`https://www.linkedin.com/oauth/v2/authorization?${q}`, 302);
}

async function finishAuth(url, env) {
  const state = await env.KV.get('oauth_state');
  if (!state || url.searchParams.get('state') !== state) return new Response('Invalid state', { status: 403 });
  await env.KV.delete('oauth_state');

  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: url.searchParams.get('code'),
      redirect_uri: `${env.WORKER_URL}/callback`,
      client_id: env.LINKEDIN_CLIENT_ID,
      client_secret: env.LINKEDIN_CLIENT_SECRET,
    }),
  });
  if (!r.ok) return html(`<p>LinkedIn login failed: ${esc(await r.text())}</p>`);
  const { access_token, expires_in } = await r.json();
  const me = await (await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${access_token}` } })).json();
  await env.KV.put('li', JSON.stringify({ token: access_token, expires: Date.now() + expires_in * 1000, urn: `urn:li:person:${me.sub}` }));
  return html(`<p>✅ LinkedIn connected as ${esc(me.name)}. Valid for ${Math.round(expires_in / 86400)} days.</p>`);
}

// ---------- helpers ----------

const html = (body) =>
  new Response(`<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;max-width:640px;margin:24px auto;padding:0 16px">${body}`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

async function email(env, subject, body, attachments = []) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'LinkedIn Agent <onboarding@resend.dev>', to: [env.EMAIL_TO], subject, html: body, attachments }),
  });
  if (!r.ok) throw new Error(`Resend: ${r.status} ${await r.text()}`);
}
