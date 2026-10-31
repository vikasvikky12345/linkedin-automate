# Sourced by deploy.sh and secrets.sh: never touch the default (office) AWS profile.
if [ -z "$AWS_PROFILE" ] || [ "$AWS_PROFILE" = default ]; then
  echo "Set your personal profile first, e.g.: AWS_PROFILE=personal $0" >&2
  exit 1
fi
ACCOUNT=$(aws sts get-caller-identity --query Account --output text) || exit 1
printf 'Using AWS profile "%s", account %s, region %s. Continue? [y/N] ' "$AWS_PROFILE" "$ACCOUNT" "$(aws configure get region)"
read -r ok
[ "$ok" = y ] || exit 1
