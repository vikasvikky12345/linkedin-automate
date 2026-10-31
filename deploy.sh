#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
. ./guard.sh

ARTIFACTS="linkedin-agent-artifacts-$ACCOUNT"
if ! aws s3api head-bucket --bucket "$ARTIFACTS" 2>/dev/null; then
  aws s3 mb "s3://$ARTIFACTS"
  aws s3api put-bucket-lifecycle-configuration --bucket "$ARTIFACTS" \
    --lifecycle-configuration '{"Rules":[{"ID":"old-builds","Status":"Enabled","Filter":{},"Expiration":{"Days":7}}]}'
fi

(cd src && npm ci --omit=dev --silent)
aws cloudformation package --template-file template.yaml --s3-bucket "$ARTIFACTS" --output-template-file .packaged.yaml
aws cloudformation deploy --template-file .packaged.yaml --stack-name linkedin-agent --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND
aws cloudformation describe-stacks --stack-name linkedin-agent --query "Stacks[0].Outputs" --output table
