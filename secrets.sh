#!/bin/bash
# Stores keys as encrypted SSM parameters. Pass names to update only some, e.g. ./secrets.sh DEEPSEEK_API_KEY
set -euo pipefail
cd "$(dirname "$0")"
. ./guard.sh

for k in "${@:-EMAIL_TO DEEPSEEK_API_KEY GITHUB_TOKEN RESEND_API_KEY LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET ADMIN_KEY}"; do
  for name in $k; do
    read -rsp "$name: " value; echo
    aws ssm put-parameter --name "/linkedin-agent/$name" --type SecureString --overwrite --value "$value" >/dev/null
  done
done
echo "Saved. The running Lambda picks up changes within ~15 minutes, or right away after ./deploy.sh."
