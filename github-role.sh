#!/bin/bash
# One-time: create the IAM roles GitHub Actions uses (see github-role.yaml).
set -euo pipefail
cd "$(dirname "$0")"
. ./guard.sh

aws cloudformation deploy --template-file github-role.yaml --stack-name linkedin-agent-github --capabilities CAPABILITY_NAMED_IAM
echo "In GitHub: repo Settings > Secrets and variables > Actions > Variables, add AWS_ACCOUNT_ID = $ACCOUNT"
