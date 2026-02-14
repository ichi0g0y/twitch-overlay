#!/usr/bin/env bash
set -euo pipefail

resolve_server_port() {
  if [[ -n "${SERVER_PORT:-}" ]]; then
    echo "${SERVER_PORT}"
    return
  fi

  local data_dir="${TWITCH_OVERLAY_DATA_DIR:-$HOME/.twitch-overlay}"
  local db_path="${data_dir}/local.db"

  if command -v sqlite3 >/dev/null 2>&1 && [[ -f "$db_path" ]]; then
    local db_port
    db_port="$(sqlite3 "$db_path" "select value from settings where key='SERVER_PORT' limit 1;" 2>/dev/null || true)"
    if [[ "$db_port" =~ ^[0-9]+$ ]]; then
      echo "$db_port"
      return
    fi
  fi

  echo "8080"
}

DEFAULT_PORT="$(resolve_server_port)"
BASE_URL="${BASE_URL:-http://127.0.0.1:${DEFAULT_PORT}}"
PASS=0
FAIL=0

say() {
  printf '%s\n' "$*"
}

check_endpoint() {
  local method="$1"
  local path="$2"
  local expected_codes="$3"
  local expect_json="$4"
  local body="${5:-}"

  local tmp_file
  tmp_file="$(mktemp)"

  local code
  if [[ -n "$body" ]]; then
    code=$(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "${BASE_URL}${path}" || true)
  else
    code=$(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" \
      "${BASE_URL}${path}" || true)
  fi

  local ok_code="false"
  IFS=',' read -r -a allowed <<< "$expected_codes"
  for c in "${allowed[@]}"; do
    if [[ "$code" == "$c" ]]; then
      ok_code="true"
      break
    fi
  done

  local ok_json="true"
  if [[ "$expect_json" == "json" ]]; then
    if ! grep -Eq '^[[:space:]]*[{\[]' "$tmp_file"; then
      ok_json="false"
    fi
  fi

  if [[ "$ok_code" == "true" && "$ok_json" == "true" ]]; then
    PASS=$((PASS + 1))
    say "[PASS] ${method} ${path} -> ${code}"
  else
    FAIL=$((FAIL + 1))
    say "[FAIL] ${method} ${path} -> ${code} (expected: ${expected_codes}, body: ${expect_json})"
    say "       response: $(head -c 200 "$tmp_file" | tr '\n' ' ')"
  fi

  rm -f "$tmp_file"
}

say "API smoke test against: ${BASE_URL}"

# Core/settings
check_endpoint GET  "/status"                               "200"     json
check_endpoint GET  "/api/settings/v2"                      "200"     json
check_endpoint GET  "/api/settings"                         "200"     json
check_endpoint GET  "/api/settings/status"                  "200"     json
check_endpoint GET  "/api/settings/auth/status"             "200"     json
check_endpoint GET  "/api/settings/overlay"                 "200"     json
check_endpoint GET  "/api/settings/font/file"               "200,404" text
check_endpoint POST "/api/settings/font/preview"            "200,400" json "{\"text\":\"hello\"}"

# Music/cache/chat/logs
check_endpoint GET  "/api/music/state"                      "200,404" json
check_endpoint GET  "/api/music/state/get"                  "200,404" json
check_endpoint GET  "/api/cache/stats"                      "200"     json
check_endpoint GET  "/api/chat/messages"                    "200"     json
check_endpoint GET  "/api/chat/history?days=7"              "200"     json
check_endpoint GET  "/api/logs?limit=10"                    "200"     json
check_endpoint POST "/api/logs/clear"                       "200"     json
check_endpoint GET  "/api/logs/download?format=json"        "200"     json

# Present compatibility
check_endpoint POST "/api/present/test"                     "200"     json
check_endpoint GET  "/api/present/participants"             "200"     json
check_endpoint POST "/api/present/lock"                     "200"     json
check_endpoint POST "/api/present/unlock"                   "200"     json
check_endpoint POST "/api/present/clear"                    "200"     json

# Printer (hardware/environment dependent)
check_endpoint GET  "/api/printer/status"                   "200"     json
check_endpoint POST "/api/printer/scan"                     "200,500" json
check_endpoint GET  "/api/printer/system-printers"          "200,500" json
check_endpoint GET  "/api/stream/status"                    "200"     json
check_endpoint GET  "/api/twitch/custom-rewards"            "200,401" json

# Debug compatibility (DEBUG_MODE/DEBUG_OUTPUT disabled時は403)
check_endpoint POST "/debug/clock"                          "200,403" json "{\"withStats\":true}"

say ""
say "Summary: PASS=${PASS}, FAIL=${FAIL}, TOTAL=$((PASS + FAIL))"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
