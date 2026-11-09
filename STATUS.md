# Project status

Last updated: 2026-11-09

## Goal

Study with `/js-angular-prep` in Claude Code → the next morning at 9 AM IST, 3 LinkedIn posts based on what I learned arrive in my Gmail (1 carousel, 1 "what does this print?" puzzle image, 1 tip image) → I approve each one → approved posts go out at 10 AM, 2 PM and 7 PM IST, one per slot. Fully automated, about $0/month except DeepSeek.

## Decisions made

| Topic | Choice | Why |
|---|---|---|
| Hosting | AWS (Lambda, EventBridge Scheduler, S3, SSM) | Want AWS practice; tried Cloudflare first, replaced it |
| Post writer | DeepSeek (`deepseek-flash`, thinking off) | Already have the API key; cheapest |
| LinkedIn access | Own LinkedIn developer app (not Composio) | No third party holding the login; scheduled agent doesn't need an MCP |
| Email | Resend (free) | SES can't reliably send from a @gmail.com address without my own domain |
| Notes storage | This public repo (`notes/`, `progress.md`) | One repo for code and notes; "learning in public" |
| Post topic | AWS only for now (2026-11-09): 3 concepts a day from `aws-topics.md`, "Learn AWS with Vikas" series | Prep is on logic building, which isn't post material. Back to JS/Angular posts from the prep notes once the JS/Angular topics resume: revert the commit "Post AWS topics instead of JS prep notes" |
| Post style | Series line, varied hooks, second DeepSeek pass with the MIT humanizer skill (`src/humanizer/`) | Posts read less like AI; no made-up job stories |
| Video | Skipped | Paid tools, generic results; images and carousels instead |
| Posting times | 10 AM, 2 PM, 7 PM IST | Posting all 3 at once hurts reach |
| Market report | Same Lambda, `market` job at 10 AM IST; free RSS/API sources only; report saved in S3 `reports/`, page at `/report` behind `ADMIN_KEY` | No new accounts or keys; Amazon/G2/Statista block scraping, Upwork feeds are gone |
| Spend dashboard | DynamoDB `Usage` table: every DeepSeek call (tokens, $) and job run logged; `costs` job at 8:45 AM IST pulls AWS Cost Explorer (usage before credits, last 7 days, $0.01/call) and the DeepSeek balance; page at `/dashboard?key=<ADMIN_KEY>`; 9 AM email shows yesterday's spend; alert email above $3/day or DeepSeek balance under $2 | Track AWS + LLM cost per agent now; base for a product later. Credits net AWS to ~$0, so usage is shown before credits |
| Business ideas report | Second email at 10:30 AM (`ideas` job), same code path as `market` (`REPORTS` in `src/index.js`); every idea tagged with ₹ cost and side/full-time; reports in S3 `reports/<type>/` | Wanted any business, not only e-commerce; separate email keeps each one short. Budget and time not decided yet, so ideas are tagged, not filtered |

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

## Market report (added 2026-11-01)

- [x] Code + tests (`npm test`); sources checked from the Mac: HN, Product Hunt, Inc42, YourStory, Entrackr, Google Trends work
- [x] Business ideas report (10:30 AM): code + tests; new sources checked from the Mac (TechCrunch, Crunchbase, ET Startups, ET Small Business, Google Trends US, PIB, Reddit RSS all returned items). PIB English feed returns nothing, so the Hindi feed is used
- [x] Deployed 2026-11-02, test run of `market` and `ideas` both worked (emails + reports saved)
- [ ] Reddit from AWS: the first Reddit feed works, the next ones get HTTP 429 (all other sources fine). Fix: Reddit OAuth app, or fetch Reddit feeds one by one with a pause

## Unverified, check on the first real run

- Chromium rendering on Lambda (could not run on the Mac)
- Carousel PDFs via LinkedIn's Documents API with a normal app (`w_member_social`)
- `LinkedinVersion` `202609` still accepted by LinkedIn
- The skill's notes-and-push step actually runs at the end of a session

## Later

- Before month 6: upgrade the AWS Free plan to Paid, or the account closes
- Every ~60 days: reconnect LinkedIn (the daily email warns a week before)

## Phone control and dashboard (added 2026-11-05)

- [x] `edit` job: rewrite one post from an instruction, re-render the image, email it back as pending
- [x] GitHub Actions: `deploy.yml` deploys on push to main, `job.yml` runs any job (draft/edit/publish/market/ideas) on demand. IAM roles in `github-role.yaml` (stack `linkedin-agent-github`); repo variable `AWS_ACCOUNT_ID`
- [x] Spend dashboard deployed and checked: costs job, DeepSeek balance, `/dashboard` all work
- [ ] Run `job.yml` once from the GitHub phone app (only tested from the laptop so far)
- [ ] Check that a Claude Code cloud session can trigger `job.yml`
- [ ] Phase 2: shared `llm()` / email / job helpers so new agents log usage to the same table with their own name

## Other projects on this dashboard (added 2026-11-05)

- [x] `../linkedin-service` (paid client posting, separate stack) writes its DeepSeek calls and runs to this `Usage` table with `agent` and `client`; the dashboard shows "By project" and per-client cost
- [x] `costs` job also pulls AWS cost by the `project` tag (second Cost Explorer call, $0.01/day); this stack's resources are tagged `project=linkedin-agent`
- [ ] Activate the `project` cost-allocation tag in Billing (command in `../linkedin-service/README.md`); until then all AWS cost shows as "other (untagged)"

