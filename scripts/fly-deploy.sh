#!/usr/bin/env bash
# Deploy da API no Fly.io (região GRU). Requer flyctl instalado e fly auth login.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v fly >/dev/null 2>&1; then
  echo "Instale flyctl: https://fly.io/docs/flyctl/install/"
  exit 1
fi

echo "==> Deploy Fly.io (app: gas-erp-api, região: gru)"
fly deploy "$@"

echo ""
echo "Health: fly open /api/v1/health"
echo "Logs:   fly logs"
