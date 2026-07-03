#!/usr/bin/env bash
# Mede latência de endpoints críticos (tipo B — request latency).
set -euo pipefail

API_BASE="${API_BASE:-https://gas-erpapi-production.up.railway.app/api/v1}"
EMAIL="${BENCH_EMAIL:-master@gas.com}"
PASSWORD="${BENCH_PASSWORD:-admin123}"

time_request() {
  local label="$1"
  local method="$2"
  local url="$3"
  local body="${4:-}"
  local auth="${5:-}"

  local curl_args=(-s -o /dev/null -w "%{http_code} %{time_total}" -X "$method" "$url")
  if [[ -n "$auth" ]]; then
    curl_args+=(-H "Authorization: Bearer $auth")
  fi
  if [[ -n "$body" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi

  local result
  result="$(curl "${curl_args[@]}")"
  local code="${result%% *}"
  local seconds="${result##* }"
  local ms
  ms="$(awk "BEGIN { printf \"%.0f\", $seconds * 1000 }")"
  printf "%-28s %4s  %5sms\n" "$label" "$code" "$ms"
}

echo "API: $API_BASE"
echo ""
printf "%-28s %4s  %5s\n" "Endpoint" "HTTP" "Time"
printf "%-28s %4s  %5s\n" "--------" "----" "----"

time_request "GET /health" GET "$API_BASE/health"

LOGIN_JSON="$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"

TOKEN="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.accessToken||j.token||'');" "$LOGIN_JSON" 2>/dev/null || true)"

if [[ -z "$TOKEN" ]]; then
  echo ""
  echo "Login falhou — defina BENCH_EMAIL/BENCH_PASSWORD para medir endpoints autenticados."
  exit 0
fi

time_request "POST /auth/login" POST "$API_BASE/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
time_request "GET /auth/me" GET "$API_BASE/auth/me" "" "$TOKEN"

STORE_ID="$(node -e "
const j=JSON.parse(process.argv[1]);
const ids=j.user?.storeIds||[];
process.stdout.write(ids[0]||'');
" "$LOGIN_JSON")"

if [[ -n "$STORE_ID" ]]; then
  time_request "GET /dashboard/store" GET "$API_BASE/dashboard/store?storeId=$STORE_ID" "" "$TOKEN"
fi

time_request "GET /dashboard/master" GET "$API_BASE/dashboard/master" "" "$TOKEN"

echo ""
echo "Metas de referência (Brasil): health <200ms, login <500ms, dashboard store <800ms, master <1500ms"
