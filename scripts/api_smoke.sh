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
SMOKE_WORD="smoke-word-$(date +%s)"

say() {
  printf '%s\n' "$*"
}

check_endpoint() {
  local method="$1"
  local path="$2"
  local expected_codes="$3"
  local expect_kind="$4"
  local body="${5:-}"

  local body_file header_file
  body_file="$(mktemp)"
  header_file="$(mktemp)"

  local code
  if [[ -n "$body" ]]; then
    code=$(curl -sS -D "$header_file" -o "$body_file" -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "${BASE_URL}${path}" || true)
  else
    code=$(curl -sS -D "$header_file" -o "$body_file" -w "%{http_code}" -X "$method" \
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

  local ok_content_type="true"
  local ok_json="true"
  if [[ "$expect_kind" == "json" ]]; then
    local content_type
    content_type="$(grep -i '^content-type:' "$header_file" | tail -n1 | cut -d: -f2- | tr -d '\r' | xargs)"
    local content_type_lc
    content_type_lc="$(printf '%s' "$content_type" | tr '[:upper:]' '[:lower:]')"
    if [[ "$content_type_lc" != application/json* ]]; then
      ok_content_type="false"
    fi

    if command -v jq >/dev/null 2>&1; then
      if ! jq -e . "$body_file" >/dev/null 2>&1; then
        ok_json="false"
      fi
    else
      if ! python3 -c 'import json,sys; json.load(open(sys.argv[1], "r", encoding="utf-8"))' "$body_file" >/dev/null 2>&1; then
        ok_json="false"
      fi
    fi
  fi

  if [[ "$ok_code" == "true" && "$ok_content_type" == "true" && "$ok_json" == "true" ]]; then
    PASS=$((PASS + 1))
    say "[PASS] ${method} ${path} -> ${code} (${expect_kind})"
  else
    FAIL=$((FAIL + 1))
    say "[FAIL] ${method} ${path} -> ${code} (expected: ${expected_codes}, kind: ${expect_kind})"
    say "       content-type-ok=${ok_content_type}, json-parse-ok=${ok_json}"
    say "       response: $(head -c 200 "$body_file" | LC_ALL=C tr '\n' ' ')"
  fi

  rm -f "$body_file" "$header_file"
}

say "API smoke test against: ${BASE_URL}"

# Core/settings
check_endpoint GET  "/status"                               "200"     json
check_endpoint GET  "/api/settings/v2"                      "200"     json
check_endpoint GET  "/api/settings"                         "200"     json
check_endpoint GET  "/api/settings/status"                  "200"     json
check_endpoint GET  "/api/settings/auth/status"             "200"     json
check_endpoint GET  "/api/settings/overlay"                 "200"     json
check_endpoint POST "/api/settings/v2/reset"                "200"     json "{}"
check_endpoint POST "/api/overlay/refresh"                  "200"     json
check_endpoint GET  "/api/settings/font/file"               "200,404" text
check_endpoint GET  "/api/font/data"                        "200,404" text
check_endpoint POST "/api/settings/font/preview"            "200,400" json "{\"text\":\"hello\"}"

# Music/cache/chat/logs
check_endpoint GET  "/api/music/state"                      "200,404" json
check_endpoint GET  "/api/music/state/get"                  "200,404" json
check_endpoint GET  "/api/music/status"                     "200"     json
check_endpoint GET  "/api/music/tracks"                     "200"     json
check_endpoint GET  "/api/music/playlists"                  "200"     json
check_endpoint POST "/api/music/control/play"               "200"     json "{}"
check_endpoint GET  "/api/cache/stats"                      "200"     json
check_endpoint GET  "/api/cache/settings"                   "200"     json
check_endpoint PUT  "/api/cache/settings"                   "200"     json "{\"expiry_days\":7,\"max_size_mb\":100,\"cleanup_enabled\":true,\"cleanup_on_start\":true}"
check_endpoint POST "/api/cache/cleanup"                    "200"     json
check_endpoint DELETE "/api/cache/clear"                    "200"     json
check_endpoint GET  "/api/chat/messages"                    "200"     json
check_endpoint GET  "/api/chat/history?days=7"              "200"     json
check_endpoint POST "/api/chat/cleanup"                     "200"     json "{\"hours\":24}"
check_endpoint GET  "/api/logs?limit=10"                    "200"     json
check_endpoint POST "/api/logs/clear"                       "200"     json
check_endpoint GET  "/api/logs/download?format=json"        "200"     json
check_endpoint GET  "/api/nonexistent"                      "404"     json

# Lottery
check_endpoint GET  "/api/lottery"                          "200"     json
check_endpoint GET  "/api/lottery/settings"                 "200"     json
check_endpoint PUT  "/api/lottery/settings"                 "200,400" json "{\"base_tickets_limit\":3,\"final_tickets_limit\":0}"
check_endpoint POST "/api/lottery/add-participant"          "200"     json "{\"user_id\":\"smoke-user\",\"username\":\"smoke_user\",\"display_name\":\"Smoke User\"}"
check_endpoint POST "/api/lottery/draw"                     "200,400" json
check_endpoint GET  "/api/lottery/history?limit=5"          "200"     json
check_endpoint DELETE "/api/lottery/history/999999"         "200,500" json
check_endpoint POST "/api/lottery/reset-winner"             "200"     json
check_endpoint DELETE "/api/lottery/smoke-user"             "200"     json
check_endpoint POST "/api/lottery/clear"                    "200"     json

# Present compatibility
check_endpoint POST "/api/present/test"                     "200"     json
check_endpoint GET  "/api/present/participants"             "200"     json
check_endpoint POST "/api/present/start"                    "200,400" json
check_endpoint POST "/api/present/stop"                     "200"     json
check_endpoint POST "/api/present/lock"                     "200"     json
check_endpoint POST "/api/present/unlock"                   "200"     json
check_endpoint POST "/api/present/refresh-subscribers"      "200,400,401" json
check_endpoint DELETE "/api/present/participants/smoke-user" "200,404" json
check_endpoint POST "/api/present/clear"                    "200"     json

# Word filter / rewards / fax
check_endpoint GET  "/api/word-filter?lang=en"              "200"     json
check_endpoint GET  "/api/word-filter/languages"            "200"     json
check_endpoint POST "/api/word-filter"                      "200"     json "{\"language\":\"en\",\"word\":\"${SMOKE_WORD}\",\"type\":\"bad\"}"
check_endpoint GET  "/api/twitch/reward-groups"             "200"     json
check_endpoint GET  "/api/twitch/reward-counts"             "200"     json
check_endpoint GET  "/api/fax/recent"                       "200"     json

# Printer (hardware/environment dependent)
check_endpoint GET  "/api/printer/status"                   "200"     json
check_endpoint POST "/api/printer/scan"                     "200,500" json
check_endpoint GET  "/api/printer/system-printers"          "200,500" json
check_endpoint GET  "/api/stream/status"                    "200"     json
check_endpoint GET  "/api/twitch/custom-rewards"            "200,401" json

# Debug compatibility (DEBUG_MODE/DEBUG_OUTPUT disabled時は403)
check_endpoint POST "/debug/clock"                          "200,403" json "{\"withStats\":true}"
check_endpoint POST "/debug/follow"                         "200,403" json "{}"
check_endpoint POST "/debug/cheer"                          "200,403" json "{}"

say ""
say "Summary: PASS=${PASS}, FAIL=${FAIL}, TOTAL=$((PASS + FAIL))"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
