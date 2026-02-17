#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCOPE_FILE="${REPO_ROOT}/.context/issue_scope.json"
LOCK_DIR="${REPO_ROOT}/.context/.issue_scope.lock"
OWNER_ID="${ISSUE_SCOPE_OWNER:-codex:${USER:-unknown}}"

usage() {
  cat <<'USAGE'
Issueスコープを .context/issue_scope.json に設定する。

Usage:
  scripts/pick_issue_scope.sh [options] [primary_issue] [related_issue ...]

Behavior:
  - 引数あり: 指定Issueを primary/related として設定
  - 引数なし: Open Issue から priority:P0 -> P1 -> P2 -> P3 の順で最古Issueを自動選定
  - 優先度ラベル付きIssueが無い場合: Open Issue 全体の最古Issueを選定

Options:
  --force             既存 issue_scope を上書きする（replaceモード時）
  --append-related    既存 primary を維持し、指定Issue（または自動選定Issue）を related に追加
  --repo OWNER/REPO   対象リポジトリを明示（デフォルト: 現在のrepo）
  --dry-run           issue_scopeを書き込まず、結果JSONのみ出力
  -h, --help          ヘルプを表示
USAGE
}

GITHUB_CLI_BIN="$(command -v gh 2>/dev/null || true)"
if [[ -z "$GITHUB_CLI_BIN" ]]; then
  echo "error: GitHub CLI が必要です" >&2
  exit 127
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 が必要です" >&2
  exit 127
fi

normalize_issue_number() {
  local raw="$1"
  raw="${raw#\#}"
  if [[ ! "$raw" =~ ^[0-9]+$ ]]; then
    echo "error: Issue番号の形式が不正です: $1" >&2
    exit 1
  fi
  printf '%s' "$raw"
}

extract_first_issue() {
  local issue_json="$1"
  python3 - "$issue_json" <<'PY'
import json
import sys

data = json.loads(sys.argv[1])
if not data:
    sys.exit(1)
issue = data[0]
num = issue.get("number")
if num is None:
    sys.exit(1)
print(f"{num}\t{issue.get('url','')}\t{issue.get('title','')}\t{issue.get('createdAt','')}")
PY
}

extract_issue_overview() {
  local issue_json="$1"
  python3 - "$issue_json" <<'PY'
import json
import re
import sys

issue = json.loads(sys.argv[1])
title = re.sub(r"\s+", " ", issue.get("title", "")).strip()
body = re.sub(r"\s+", " ", issue.get("body", "")).strip()
if len(body) > 140:
    body = body[:137].rstrip() + "..."
print(f"{issue.get('url','')}\t{title}\t{body}\t{issue.get('createdAt','')}")
PY
}

view_issue_overview() {
  local issue_number="$1"
  local repo="$2"

  local -a cmd=("$GITHUB_CLI_BIN" issue view "$issue_number" --json url,title,body,createdAt)
  if [[ -n "$repo" ]]; then
    cmd+=(--repo "$repo")
  fi

  local json
  json="$("${cmd[@]}")"
  extract_issue_overview "$json"
}

list_first_issue() {
  local label="$1"
  local repo="$2"

  local -a cmd=("$GITHUB_CLI_BIN" issue list --state open --limit 1 --search "sort:created-asc" --json number,url,title,createdAt)
  if [[ -n "$label" ]]; then
    cmd+=(--label "$label")
  fi
  if [[ -n "$repo" ]]; then
    cmd+=(--repo "$repo")
  fi

  local json
  json="$("${cmd[@]}")"
  extract_first_issue "$json"
}

acquire_lock() {
  local retries=50
  local attempt=0
  while (( attempt < retries )); do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
      return 0
    fi
    sleep 0.1
    attempt=$((attempt + 1))
  done

  echo "error: issue_scope のロック取得に失敗しました: ${LOCK_DIR}" >&2
  exit 1
}

mode="replace"
force=0
dry_run=0
repo=""
declare -a issue_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      force=1
      ;;
    --append-related)
      mode="append"
      ;;
    --repo)
      if [[ $# -lt 2 ]]; then
        echo "error: --repo には値が必要です" >&2
        exit 1
      fi
      repo="$2"
      shift
      ;;
    --dry-run)
      dry_run=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        issue_args+=("$1")
        shift
      done
      break
      ;;
    -* )
      echo "error: 未知のオプションです: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      issue_args+=("$1")
      ;;
  esac
  shift
done

scope_exists=0
if [[ -s "$SCOPE_FILE" ]]; then
  scope_exists=1
fi

if (( scope_exists == 1 && force == 0 )) && [[ "$mode" == "replace" ]]; then
  echo "error: 既存の $SCOPE_FILE を検出しました。上書きする場合は --force を指定してください。" >&2
  echo "hint: related に追加する場合は --append-related を使ってください。" >&2
  exit 1
fi

if [[ "$mode" == "append" && $scope_exists -eq 0 ]]; then
  echo "error: --append-related は既存の $SCOPE_FILE が必要です。" >&2
  exit 1
fi

declare -a normalized_issues=()
if ((${#issue_args[@]})); then
  for raw in "${issue_args[@]}"; do
    normalized_issues+=("$(normalize_issue_number "$raw")")
  done
fi

selected_issue=""
selected_issue_url=""
selection_reason="explicit"
if ((${#normalized_issues[@]})); then
  selected_issue="${normalized_issues[0]}"
else
  selection_reason=""
  for priority in priority:P0 priority:P1 priority:P2 priority:P3; do
    if picked="$(list_first_issue "$priority" "$repo")"; then
      IFS=$'\t' read -r selected_issue selected_issue_url _ _ <<<"$picked"
      selection_reason="$priority"
      break
    fi
  done

  if [[ -z "$selected_issue" ]]; then
    if picked="$(list_first_issue "" "$repo")"; then
      IFS=$'\t' read -r selected_issue selected_issue_url _ _ <<<"$picked"
      selection_reason="fallback:oldest-open"
    else
      echo "error: OpenなIssueが見つかりませんでした。" >&2
      exit 1
    fi
  fi
fi

if [[ -z "$selection_reason" ]]; then
  selection_reason="explicit"
fi

branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
normalized_csv=""
if ((${#normalized_issues[@]})); then
  normalized_csv="$(IFS=,; echo "${normalized_issues[*]}")"
fi

json_payload="$(python3 - "$mode" "$SCOPE_FILE" "$scope_exists" "$selected_issue" "$normalized_csv" "$branch" "$now" "$OWNER_ID" <<'PY'
import json
import sys

mode = sys.argv[1]
scope_path = sys.argv[2]
scope_exists = sys.argv[3] == "1"
selected_issue = int(sys.argv[4])
normalized_csv = sys.argv[5]
branch = sys.argv[6]
now = sys.argv[7]
owner_id = sys.argv[8]

provided = [int(x) for x in normalized_csv.split(",") if x]

existing = {}
if scope_exists:
    with open(scope_path, encoding="utf-8") as f:
        existing = json.load(f)

existing_primary = existing.get("primary_issue")
try:
    existing_primary = int(existing_primary) if existing_primary is not None else None
except Exception:
    existing_primary = None

existing_related_raw = existing.get("related_issues")
if not isinstance(existing_related_raw, list):
    existing_related_raw = []

existing_related = []
for item in existing_related_raw:
    try:
        existing_related.append(int(item))
    except Exception:
        pass

existing_active = existing.get("active_related_issues")
if not isinstance(existing_active, dict):
    existing_active = {}

existing_pr_number = existing.get("pr_number")
existing_pr_url = existing.get("pr_url")
existing_picked_at = existing.get("picked_at")


def dedup_keep_order(values):
    out = []
    seen = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out

if mode == "append":
    if existing_primary is None:
        print("error: 既存 issue_scope に primary_issue がないため --append-related を実行できません。", file=sys.stderr)
        sys.exit(1)

    new_primary = existing_primary
    append_targets = provided if provided else [selected_issue]
    merged = existing_related + append_targets
    new_related = [x for x in dedup_keep_order(merged) if x != new_primary]
    pr_number = existing_pr_number
    pr_url = existing_pr_url
    picked_at = existing_picked_at or now
else:
    if provided:
        new_primary = provided[0]
        provided_related = provided[1:]
    else:
        new_primary = selected_issue
        provided_related = []

    new_related = [x for x in dedup_keep_order(provided_related) if x != new_primary]

    if existing_primary == new_primary:
        pr_number = existing_pr_number
        pr_url = existing_pr_url
    else:
        pr_number = None
        pr_url = None
    picked_at = now

allowed_states = {"reserved", "in_progress", "ready_for_close", "closed"}
active_related = {}
for issue in new_related:
    key = str(issue)
    raw = existing_active.get(key, {})
    if not isinstance(raw, dict):
        raw = {}

    state = raw.get("state")
    if state not in allowed_states:
        state = "reserved"

    entry = {
        "state": state,
        "owner": str(raw.get("owner") or owner_id),
        "reserved_at": str(raw.get("reserved_at") or now),
        "updated_at": now,
    }

    expires_at = raw.get("expires_at")
    if expires_at:
        entry["expires_at"] = str(expires_at)

    active_related[key] = entry

payload = {
    "schema_version": 2,
    "primary_issue": new_primary,
    "related_issues": new_related,
    "active_related_issues": active_related,
    "branch": branch,
    "pr_number": pr_number,
    "pr_url": pr_url,
    "picked_at": picked_at,
    "updated_at": now,
}

print(json.dumps(payload, ensure_ascii=False, indent=2))
PY
)"

if (( dry_run == 1 )); then
  printf '%s\n' "$json_payload"
else
  mkdir -p "$(dirname "$SCOPE_FILE")"
  acquire_lock
  tmp_file="${SCOPE_FILE}.tmp.$$"
  printf '%s\n' "$json_payload" > "$tmp_file"
  mv "$tmp_file" "$SCOPE_FILE"
fi

IFS=$'\t' read -r new_primary related_display active_display <<<"$(python3 - "$json_payload" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
related = payload.get("related_issues", [])
active = payload.get("active_related_issues", {})
related_display = "[]" if not related else "[" + ", ".join(str(x) for x in related) + "]"
if not active:
    active_display = "{}"
else:
    parts = []
    for key in sorted(active, key=lambda x: int(x)):
        state = active.get(key, {}).get("state", "")
        parts.append(f"{key}:{state}")
    active_display = "{" + ", ".join(parts) + "}"
print(f"{payload.get('primary_issue')}\t{related_display}\t{active_display}")
PY
)"

primary_issue_url=""
primary_issue_title=""
primary_issue_summary=""
primary_issue_created_at=""
if primary_overview="$(view_issue_overview "$new_primary" "$repo" 2>/dev/null)"; then
  IFS=$'\t' read -r primary_issue_url primary_issue_title primary_issue_summary primary_issue_created_at <<<"$primary_overview"
fi
if [[ -z "$primary_issue_url" && -n "$selected_issue_url" && "$selected_issue" == "$new_primary" ]]; then
  primary_issue_url="$selected_issue_url"
fi

echo "issue_scope updated: ${SCOPE_FILE}"
echo "mode: ${mode}"
echo "schema_version: 2"
echo "primary_issue: #${new_primary}"
if [[ -n "$primary_issue_title" ]]; then
  echo "primary_issue_title: ${primary_issue_title}"
fi
if [[ -n "$primary_issue_summary" ]]; then
  echo "primary_issue_summary: ${primary_issue_summary}"
fi
if [[ -n "$primary_issue_created_at" ]]; then
  echo "primary_issue_created_at: ${primary_issue_created_at}"
fi
if [[ -n "$primary_issue_url" ]]; then
  echo "primary_issue_url: ${primary_issue_url}"
fi
echo "related_issues: ${related_display}"
echo "active_related_issues: ${active_display}"
echo "branch: ${branch}"
echo "selection_reason: ${selection_reason}"
if [[ -n "$selected_issue_url" ]]; then
  echo "selected_issue_url: ${selected_issue_url}"
fi
