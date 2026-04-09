#!/bin/sh
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"

VERSION=$1
NOTES=${2:-""}

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version> [\"release notes\"]"
  echo "Example: ./scripts/release.sh 1.0.0 \"Initial release\""
  exit 1
fi

VERSION=$(echo "$VERSION" | sed 's/^v//')
TAG="v$VERSION"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Error: must be on main branch (currently on $BRANCH)"
  exit 1
fi

git pull origin main --quiet

echo "Releasing $TAG..."

npm version "$VERSION" --no-git-tag-version --silent

git add package.json package-lock.json
git commit -m "chore: release $TAG"
git push origin main

if [ -n "$NOTES" ]; then
  gh release create "$TAG" --title "$TAG" --notes "$NOTES"
else
  gh release create "$TAG" --title "$TAG" --generate-notes
fi

echo ""
echo "Released $TAG"
echo "  GitHub: https://github.com/Inflect-Labs/slack-digest/releases/tag/$TAG"
echo "  Vercel: https://vercel.com/inflectlabs/slack-digest"
