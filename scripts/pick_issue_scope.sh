#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCOPE_FILE="${REPO_ROOT}/.context/issue_scope.json"

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

GITHUB_CLI_BIN="$(command -v g"h" 2>/dev/null || true)"
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

branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
picked_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

existing_primary=""
existing_related_csv=""
existing_pr_number=""
existing_pr_url=""

if (( scope_exists == 1 )); then
  mapfile -t scope_lines < <(python3 - "$SCOPE_FILE" <<'PY'
import json
import sys

path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
except Exception as e:
    print(f"error: issue_scope の読み込みに失敗しました: {e}", file=sys.stderr)
    sys.exit(2)

primary = data.get("primary_issue")
related = data.get("related_issues")
if not isinstance(related, list):
    related = []

normalized_related = []
for item in related:
    try:
        normalized_related.append(str(int(item)))
    except Exception:
        continue

pr_number = data.get("pr_number")
pr_url = data.get("pr_url")

print("" if primary is None else str(int(primary)))
print(",".join(normalized_related))
print("" if pr_number is None else str(pr_number))
print("" if pr_url is None else str(pr_url))
PY
)

  existing_primary="${scope_lines[0]:-}"
  existing_related_csv="${scope_lines[1]:-}"
  existing_pr_number="${scope_lines[2]:-}"
  existing_pr_url="${scope_lines[3]:-}"
fi

declare -a existing_related=()
if [[ -n "$existing_related_csv" ]]; then
  IFS=',' read -r -a existing_related <<<"$existing_related_csv"
fi

dedup_keep_order() {
  awk 'NF && !seen[$0]++'
}

declare -a new_related=()
new_primary=""
new_pr_number=""
new_pr_url=""

if [[ "$mode" == "append" ]]; then
  if [[ -z "$existing_primary" ]]; then
    echo "error: 既存 issue_scope に primary_issue がないため --append-related を実行できません。" >&2
    exit 1
  fi

  new_primary="$existing_primary"
  new_pr_number="$existing_pr_number"
  new_pr_url="$existing_pr_url"

  declare -a append_targets=()
  if ((${#normalized_issues[@]})); then
    append_targets=("${normalized_issues[@]}")
  else
    append_targets=("$selected_issue")
  fi

  declare -a merged=()
  merged=("${existing_related[@]}" "${append_targets[@]}")

  declare -a filtered=()
  for num in "${merged[@]}"; do
    if [[ "$num" != "$new_primary" ]]; then
      filtered+=("$num")
    fi
  done

  if ((${#filtered[@]})); then
    mapfile -t new_related < <(printf '%s\n' "${filtered[@]}" | dedup_keep_order)
  fi
else
  new_primary="$selected_issue"

  declare -a provided_related=()
  if ((${#normalized_issues[@]} > 1)); then
    provided_related=("${normalized_issues[@]:1}")
  fi

  declare -a filtered=()
  for num in "${provided_related[@]}"; do
    if [[ "$num" != "$new_primary" ]]; then
      filtered+=("$num")
    fi
  done

  if ((${#filtered[@]})); then
    mapfile -t new_related < <(printf '%s\n' "${filtered[@]}" | dedup_keep_order)
  fi
fi

related_csv=""
if ((${#new_related[@]})); then
  related_csv="$(IFS=,; echo "${new_related[*]}")"
fi

json_payload="$(python3 - "$new_primary" "$related_csv" "$branch" "$picked_at" "$new_pr_number" "$new_pr_url" <<'PY'
import json
import sys

primary = int(sys.argv[1])
related_csv = sys.argv[2]
branch = sys.argv[3]
picked_at = sys.argv[4]
pr_number_raw = sys.argv[5]
pr_url_raw = sys.argv[6]

related = [int(x) for x in related_csv.split(",") if x]

if pr_number_raw == "":
    pr_number = None
else:
    try:
        pr_number = int(pr_number_raw)
    except ValueError:
        pr_number = pr_number_raw

pr_url = pr_url_raw if pr_url_raw else None

payload = {
    "primary_issue": primary,
    "related_issues": related,
    "branch": branch,
    "pr_number": pr_number,
    "pr_url": pr_url,
    "picked_at": picked_at,
}

print(json.dumps(payload, ensure_ascii=False, indent=2))
PY
)"

if (( dry_run == 1 )); then
  printf '%s\n' "$json_payload"
else
  mkdir -p "$(dirname "$SCOPE_FILE")"
  printf '%s\n' "$json_payload" > "$SCOPE_FILE"
fi

related_display="[]"
if ((${#new_related[@]})); then
  related_display="[$(IFS=', '; echo "${new_related[*]}")]"
fi

if [[ "$mode" == "append" ]]; then
  selection_mode="append-related"
else
  selection_mode="replace"
fi

if [[ -z "$selection_reason" ]]; then
  selection_reason="explicit"
fi

echo "issue_scope updated: ${SCOPE_FILE}"
echo "mode: ${selection_mode}"
echo "primary_issue: #${new_primary}"
echo "related_issues: ${related_display}"
echo "branch: ${branch}"
echo "selection_reason: ${selection_reason}"
if [[ -n "$selected_issue_url" ]]; then
  echo "selected_issue_url: ${selected_issue_url}"
fi
