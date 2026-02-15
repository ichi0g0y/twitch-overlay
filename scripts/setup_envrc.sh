#!/usr/bin/env bash
set -euo pipefail

REPO_URL="$(git remote get-url origin 2>/dev/null || true)"
if [ -n "$REPO_URL" ]; then
  REPO_NAME="$(basename -s .git "$REPO_URL")"
else
  REPO_NAME="$(basename "$(git rev-parse --show-toplevel)")"
fi

SOURCE_DIR="$HOME/.envs/$REPO_NAME"
SOURCE_ENVRC="$SOURCE_DIR/.envrc"

if [ -f "$SOURCE_ENVRC" ]; then
  cp "$SOURCE_ENVRC" .envrc
  chmod 600 .envrc
  echo "Generated .envrc from $SOURCE_ENVRC"
else
  echo "Skipped: $SOURCE_ENVRC not found"
fi

if command -v direnv >/dev/null 2>&1 && [ -f .envrc ]; then
  direnv allow .
  echo "Applied: direnv allow ."
fi
