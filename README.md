# LinkedIn agent

Every day at 9 AM IST it reads your latest `/js-angular-prep` notes from this repo, has DeepSeek write 3 posts (carousel, puzzle image, tip image) and emails them to you. Posts you approve go out at 10 AM, 2 PM and 7 PM IST, one per slot.

Every day at 10 AM IST it also emails a **market report**: business gaps, trends and funding news from Hacker News, Reddit, Product Hunt, Inc42, YourStory, Entrackr and Google Trends India, summarised by DeepSeek. At 10:30 AM IST a second email, **business ideas**, covers any kind of business (online, e-commerce, local/offline, services, startups) from TechCrunch, Crunchbase News, Economic Times, Inc42, Reddit, Google Trends India + US, Product Hunt, Hacker News and PIB. Each idea is tagged with a ₹ cost and side business / full-time, plus one deep dive.
Each email links to its full report at `<AppUrl>report?type=market|ideas&key=<ADMIN_KEY>` (past days are linked at the bottom, and each report links to the other one).

Runs on AWS: Lambda (+ Function URL for the approve page), EventBridge Scheduler, S3, SSM Parameter Store. Email goes through Resend, posts are written by DeepSeek.

## Safety: personal AWS account only

The scripts refuse to run on the `default` AWS CLI profile (that is the office account). They need `AWS_PROFILE` set to your **personal** profile and show the account number for you to confirm before doing anything.

## One-time setup

1. **Personal AWS profile**: in your personal AWS account, create an IAM user with access keys (not the root user). Then:
   ```sh
   aws configure --profile personal     # region: ap-south-1
   AWS_PROFILE=personal aws sts get-caller-identity   # check it is the personal account number
   ```
   In Billing → Budgets, create a $1 monthly budget with an email alert.
   Do not create AWS Organizations, Control Tower or IAM Identity Center: on the Free plan that ends your credits.

2. **GitHub token**: logged in as **vikasvikky12345**, create a fine-grained token (Settings → Developer settings → Fine-grained tokens) with read-only **Contents** access to `linkedin-automate` only.

3. **Resend** (sends the email, free): sign up at resend.com with the Gmail address you want the posts sent to and create an API key.

4. **Keys** (stored encrypted in SSM; each one is prompted, nothing lands in shell history):
   ```sh
   cd ~/Documents/linkedin-agent
   AWS_PROFILE=personal ./secrets.sh
   ```
   It asks for: `EMAIL_TO` (your Gmail), `DEEPSEEK_API_KEY`, `GITHUB_TOKEN`, `RESEND_API_KEY`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `ADMIN_KEY` (any long random string, e.g. from `openssl rand -hex 24`).
   To change one later: `AWS_PROFILE=personal ./secrets.sh DEEPSEEK_API_KEY`

5. **Deploy**: `AWS_PROFILE=personal ./deploy.sh`. It prints `AppUrl` at the end, like `https://abc123.lambda-url.ap-south-1.on.aws/`.

6. **LinkedIn app**: in your app on linkedin.com/developers:
   - Products: add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**
   - Auth → Authorized redirect URLs: add `<AppUrl>callback`

7. **Connect LinkedIn**: open `<AppUrl>auth?key=<ADMIN_KEY>` in your browser and log in. Repeat every ~60 days; the daily email warns you a week before it expires.

## Try it without waiting for 9 AM

```sh
# draft + email now
AWS_PROFILE=personal aws lambda invoke --function-name linkedin-agent --cli-binary-format raw-in-base64-out \
  --payload '{"job":"draft"}' --cli-read-timeout 300 /dev/stdout
# market report now
AWS_PROFILE=personal aws lambda invoke --function-name linkedin-agent --cli-binary-format raw-in-base64-out \
  --payload '{"job":"market"}' --cli-read-timeout 300 /dev/stdout
# business ideas report now
AWS_PROFILE=personal aws lambda invoke --function-name linkedin-agent --cli-binary-format raw-in-base64-out \
  --payload '{"job":"ideas"}' --cli-read-timeout 300 /dev/stdout
# publish the next approved post now
AWS_PROFILE=personal aws lambda invoke --function-name linkedin-agent --cli-binary-format raw-in-base64-out \
  --payload '{"job":"publish"}' /dev/stdout
# logs
AWS_PROFILE=personal aws logs tail /aws/lambda/linkedin-agent --since 1h
```

## When something breaks

Any failure sends you an email with the error. Common ones:
- `LinkedIn ...: 426` or a version error: bump the `LinkedinVersion` default in `template.yaml` to a recent `YYYYMM` and redeploy.
- `LinkedIn ...: 401`: the login expired. Open the `/auth` link again.
- `No notes in the repo yet`: finish a `/js-angular-prep` session so it pushes a notes file.

## Cost

DeepSeek: about $0.30–0.50/month. AWS: covered by Free plan credits for 6 months; upgrade to the Paid plan before then to keep it running (should stay at about $0, the budget alert tells you otherwise). Everything else is free.
