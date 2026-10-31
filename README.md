# LinkedIn agent

Every day at 9 AM IST it reads your latest `/js-angular-prep` notes from GitHub, has DeepSeek write 3 posts (carousel, puzzle image, tip image) and emails them to you. Posts you approve go out at 10 AM, 2 PM and 7 PM IST, one per slot.

## One-time setup

1. **GitHub token**: this repo (vikasvikky12345/linkedin-automate) also holds your notes in `notes/` and `progress.md`; `/js-angular-prep` pushes them after each session. Logged in as **vikasvikky12345**, create a fine-grained token (GitHub → Settings → Developer settings → Fine-grained tokens) with read-only **Contents** access to `linkedin-automate` only. The repo is public, but the token keeps the agent clear of GitHub's anonymous rate limit.

2. **Resend** (sends the email, free): sign up at resend.com with the Gmail address you want the posts sent to, then create an API key.

3. **Cloudflare**
   ```sh
   cd ~/Documents/linkedin-agent
   npx wrangler login
   npx wrangler kv namespace create KV     # paste the id into wrangler.toml
   ```
4. **Secrets** (each command prompts for the value; kept out of the repo because it is public)
   ```sh
   npx wrangler secret put EMAIL_TO         # your Gmail address
   npx wrangler secret put DEEPSEEK_API_KEY
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put LINKEDIN_CLIENT_ID
   npx wrangler secret put LINKEDIN_CLIENT_SECRET
   npx wrangler secret put ADMIN_KEY        # any long random string, e.g. from: openssl rand -hex 24
   ```

5. **Deploy**: `npm run deploy`. Copy the `https://linkedin-agent.<you>.workers.dev` URL it prints into `WORKER_URL` in `wrangler.toml`, then run `npm run deploy` again.

6. **LinkedIn app**: in your app on linkedin.com/developers:
   - Products: add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**
   - Auth → Authorized redirect URLs: add `<WORKER_URL>/callback`

7. **Connect LinkedIn**: open `<WORKER_URL>/auth?key=<ADMIN_KEY>` in your browser and log in. Repeat this every ~60 days; the daily email warns you a week before it expires.

## Try it without waiting for 9 AM

```sh
npx wrangler dev --remote --test-scheduled
curl "http://localhost:8787/__scheduled?cron=30+3+*+*+*"   # draft + email now
curl "http://localhost:8787/__scheduled?cron=30+4+*+*+*"   # publish the next approved post now
```

## When something breaks

Any failure sends you an email with the error. Common ones:
- `LinkedIn ...: 426` or a version error: bump `LINKEDIN_VERSION` in `wrangler.toml` to a recent `YYYYMM`.
- `LinkedIn ...: 401`: the login expired. Open the `/auth` link again.
- `No notes in the repo yet`: finish a `/js-angular-prep` session so it pushes a notes file.
