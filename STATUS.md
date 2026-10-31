# Project status

Last updated: 2026-10-31

## Goal

Study with `/js-angular-prep` in Claude Code → the next morning at 9 AM IST, 3 LinkedIn posts based on what I learned arrive in my Gmail (1 carousel, 1 "what does this print?" puzzle image, 1 tip image) → I approve each one → approved posts go out at 10 AM, 2 PM and 7 PM IST, one per slot. Fully automated, about $0/month except DeepSeek.

## Decisions made

| Topic | Choice | Why |
|---|---|---|
| Hosting | AWS (Lambda, EventBridge Scheduler, S3, SSM) | Want AWS practice; tried Cloudflare first, replaced it |
| Post writer | DeepSeek (`deepseek-chat`) | Already have the API key; cheapest |
| LinkedIn access | Own LinkedIn developer app (not Composio) | No third party holding the login; scheduled agent doesn't need an MCP |
| Email | Resend (free) | SES can't reliably send from a @gmail.com address without my own domain |
| Notes storage | This public repo (`notes/`, `progress.md`) | One repo for code and notes; "learning in public" |
| Post style | "Learn JS with Vikas" series, varied hooks, second DeepSeek pass with the MIT humanizer skill (`src/humanizer/`) | Posts read less like AI; no made-up job stories |
| Video | Skipped | Paid tools, generic results; images and carousels instead |
| Posting times | 10 AM, 2 PM, 7 PM IST | Posting all 3 at once hurts reach |

## Done

- [x] Agent code for AWS: [src/index.js](src/index.js), [src/lib.js](src/lib.js), [template.yaml](template.yaml)
- [x] Approve page uses a button (GET only shows the form), so email link scanners can't auto-approve
- [x] Failures email me the error; retries are off so a failed draft never sends a second batch
- [x] `deploy.sh` / `secrets.sh` refuse the `default` AWS profile (office account) and ask for confirmation
- [x] Tests for the pure helpers: `npm test`
- [x] `/js-angular-prep` skill now writes `notes/YYYY-MM-DD.md` here after each session, copies `progress.md`, and pushes
- [x] Repo pushed to github.com/vikasvikky12345/linkedin-automate with the personal identity

## Where we are now

Deployed and LinkedIn connected (2026-10-31), but **never run for real**. Next: a study session that pushes a notes file (step 8), then the test run (step 9).

## Left to do (in order; details in [README.md](README.md))

1. [x] Personal AWS: IAM user `vikas-cli` + `aws configure --profile personal` (region `ap-south-1`)
   - [x] Budget alert: "My Monthly Cost Budget", $70/month (other projects already cost ~$60-66/month). Alerts at 85% actual, 100% actual, 100% forecast
2. [x] GitHub fine-grained token (read-only Contents on `linkedin-automate`), logged in as vikasvikky12345. Already stored in SSM (`/linkedin-agent/GITHUB_TOKEN`)
3. [x] Resend account with my Gmail + API key. `RESEND_API_KEY` and `EMAIL_TO` stored in SSM
4. [x] LinkedIn developer app (needs a Company Page): add "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect"
5. [x] `AWS_PROFILE=personal ./secrets.sh`: all 7 keys in SSM
6. [x] Deployed (2026-10-31, via the console: code zip in bucket `new-linkedin-agent-artifacts-<account>`, stack `linkedin-agent`). AppUrl is in the stack's Outputs tab
   - [x] Add `<AppUrl>callback` as the LinkedIn redirect URL
7. [x] Open `<AppUrl>auth?key=<ADMIN_KEY>` to connect LinkedIn (connected 2026-10-31, expires 2026-12-30)
8. [ ] Do one `/js-angular-prep` session and check that a notes file gets pushed here
9. [ ] Test run (`aws lambda invoke` with `{"job":"draft"}`), approve a post, then `{"job":"publish"}`
10. [ ] Clean-up: `rm -rf ~/.claude/skills/js-angular-prep/.git` (old unused repo from the first attempt)

## Unverified, check on the first real run

- Chromium rendering on Lambda (could not run on the Mac)
- Carousel PDFs via LinkedIn's Documents API with a normal app (`w_member_social`)
- `LinkedinVersion` `202609` still accepted by LinkedIn
- The skill's notes-and-push step actually runs at the end of a session

## Later

- Before month 6: upgrade the AWS Free plan to Paid, or the account closes
- Every ~60 days: reconnect LinkedIn (the daily email warns a week before)
