# LinkedIn agent

Read [PROGRESS.md](PROGRESS.md) first: what's done, where we are, what's left. Keep it updated when a step is finished or a decision changes. Setup commands are in [README.md](README.md).

## Accounts: personal only

- GitHub: personal account **vikasvikky12345**, remote via SSH host `github.com-personal`. Never use the office account vikasvikky321.
- AWS: the `default` CLI profile is the **office** account. Never run AWS commands on it. Always use `AWS_PROFILE=personal`.
- This repo is public: no keys, emails or account numbers in it. Keys go in SSM via `./secrets.sh`.

## Code

- `src/index.js`: Lambda handler (scheduled jobs + approve page + LinkedIn login), `src/lib.js`: pure helpers covered by `npm test`.
- `template.yaml`: SAM template, deployed with `./deploy.sh` (plain AWS CLI, SAM CLI not installed).
- `/js-angular-prep` (skill at `~/.claude/skills/js-angular-prep/`) writes `notes/` and `progress.md` here and pushes them.
