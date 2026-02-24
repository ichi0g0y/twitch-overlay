#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel)"

bash "$PROJECT_ROOT/scripts/setup_envrc.sh"

if ! command -v task >/dev/null 2>&1; then
  echo "WARNING: 'task' command is not installed." >&2
  echo "ERROR: Setup failed because 'task install' cannot be executed." >&2
  exit 1
fi

(cd "$PROJECT_ROOT" && task install)
