#!/bin/zsh
set -e
exec > >(tee /private/tmp/pachinko-github-push.log) 2>&1
cd /Users/stork/pachinko-sim
eval "$(/opt/homebrew/bin/brew shellenv)"
if ! command -v gh >/dev/null 2>&1; then
  brew install gh
fi
if ! gh auth status >/dev/null 2>&1; then
  gh auth login --hostname github.com --git-protocol https --web
fi
git push -u origin main
echo
echo "GitHub push completed. This window may be closed."
