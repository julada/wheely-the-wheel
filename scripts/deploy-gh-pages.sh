#!/usr/bin/env bash
# Builds main and force-pushes the result as a single fresh commit on gh-pages.
#
# Usage: scripts/deploy-gh-pages.sh
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "error: run this from main (currently on '$BRANCH')." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is not clean — commit or stash before deploying." >&2
  exit 1
fi

MAIN_SHA="$(git rev-parse --short HEAD)"

echo "Building main@${MAIN_SHA}..."
npm ci
npm run build

if [ ! -f "$REPO_ROOT/dist/index.html" ]; then
  echo "error: build did not produce dist/index.html — aborting." >&2
  exit 1
fi

WORKTREE="$(mktemp -d)"
cleanup() {
  git worktree remove --force "$WORKTREE" 2>/dev/null || true
  rm -rf "$WORKTREE"
}
trap cleanup EXIT

# Any local gh-pages branch is disposable — it's about to be recreated from scratch
# and the result is force-pushed anyway, so there's no history worth preserving here.
git branch -D gh-pages >/dev/null 2>&1 || true

git worktree add --detach "$WORKTREE" "$MAIN_SHA" >/dev/null
(
  cd "$WORKTREE"
  git checkout --orphan gh-pages >/dev/null
  git rm -rf --cached . >/dev/null
  find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
)

cp -r "$REPO_ROOT/dist/." "$WORKTREE/"

(
  cd "$WORKTREE"
  git add -A
  git commit -q -m "Build: production bundle from main@${MAIN_SHA}

Mechanical rebuild, no new LLM-authored work in this commit.

Tokens-Burned: 0"
)

echo "Force-pushing gh-pages..."
git -C "$WORKTREE" push --force origin gh-pages:gh-pages

echo "Deployed main@${MAIN_SHA} to gh-pages and force-pushed."
