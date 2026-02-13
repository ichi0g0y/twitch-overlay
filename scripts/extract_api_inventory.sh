#!/usr/bin/env bash
set -euo pipefail

OUT_FILE="${1:-docs/TAURI_API_CALLS.md}"
TMP_FILE="$(mktemp)"

{
  (rg -o "buildApiUrl\('/[^']+'\)" frontend/src web/src -S || true) \
    | sed -E "s/.*buildApiUrl\('([^']+)'\).*/\1/"
  (rg -o 'buildApiUrl\("/[^"]+"\)' frontend/src web/src -S || true) \
    | sed -E 's/.*buildApiUrl\("([^"]+)"\).*/\1/'
  (rg -o 'buildApiUrl\(`/[^`$]+`\)' frontend/src web/src -S || true) \
    | sed -E 's/.*buildApiUrl\(`([^`]+)`\).*/\1/'
  (rg -o 'window\.open\("/[^"]+"|window\.open\('\''/[^'\'']+'\''' frontend/src web/src -S || true) \
    | sed -E "s/.*window\.open\(['\"]([^'\"]+)['\"].*/\1/"
} | sed '/^$/d' | sort | uniq -c | sort -k2,2 > "$TMP_FILE"

{
  echo "# フロントエンドAPI実呼び出し一覧"
  echo
  echo "- 生成日: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo '- 対象: `frontend/src`, `web/src`'
  echo
  echo "| Count | Path |"
  echo "|------:|------|"
  awk '{count=$1; $1=""; sub(/^ +/, ""); printf("| %s | `%s` |\n", count, $0)}' "$TMP_FILE"
} > "$OUT_FILE"

rm -f "$TMP_FILE"
echo "wrote: $OUT_FILE"
