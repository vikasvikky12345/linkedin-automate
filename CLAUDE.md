# LinkedIn agent

Read [STATUS.md](STATUS.md) first: what's done, where we are, what's left. Keep it updated when a step is finished or a decision changes. Setup commands are in [README.md](README.md).

## Accounts: personal only

- GitHub: personal account **vikasvikky12345**, remote via SSH host `github.com-personal`. Never use the office account vikasvikky321.
- AWS: the `default` CLI profile is the **office** account. Never run AWS commands on it. Always use `AWS_PROFILE=personal`.
- This repo is public: no keys, emails or account numbers in it. Keys go in SSM via `./secrets.sh`.

## Code

- `src/index.js`: Lambda handler (scheduled jobs + approve page + LinkedIn login), `src/lib.js`: pure helpers covered by `npm test`.
- `template.yaml`: SAM template, deployed with `./deploy.sh` (plain AWS CLI, SAM CLI not installed).
- `/js-angular-prep` (skill at `~/.claude/skills/js-angular-prep/`) writes `notes/` and `progress.md` here and pushes them.

## From the phone (Claude Code on the web / mobile)

There are no AWS credentials in a cloud session. Everything goes through GitHub Actions, which use the `linkedin-agent-github` role (`github-role.yaml`):

- **Code changes:** commit and push to `main`. `.github/workflows/deploy.yml` runs `npm test` and deploys. Run `npm test` before pushing; a push to main is live in ~3 minutes.
- **Post content:** trigger `.github/workflows/job.yml` (workflow_dispatch) with `job=edit`, `id`, `instruction`. Post ids are `YYYY-MM-DD-n` with n from 0, so "post 2 of today" is `<today>-1`; the email headings show the ids. The result arrives by email with a new Review link (the post goes back to pending).
- **Other jobs:** same workflow with `job=draft` (3 new posts), `publish` (next approved post now), `market`, `ideas`.
- To trigger: `gh workflow run job.yml -f job=edit -f id=2026-11-05-1 -f instruction="..."`, or the GitHub API `POST /repos/vikasvikky12345/linkedin-automate/actions/workflows/job.yml/dispatches` with `{"ref":"main","inputs":{...}}`. If neither works from the session, tell the user to tap Actions > run job > Run workflow in the GitHub app and give them the exact values.
- Post text rules live in `src/post-style.md`; changing that file changes every future post.
