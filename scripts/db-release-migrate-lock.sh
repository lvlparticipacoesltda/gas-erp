#!/usr/bin/env bash
# Libera advisory lock preso do Prisma (ex.: migrate antigo via pooler Neon) e aplica migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql não encontrado. Rode: pnpm db:deploy:force"
  exit 1
fi

echo "==> Sessões com advisory lock (Prisma migrate):"
pnpm --filter @gas-erp/database exec dotenv -e ../../.env -- sh -c \
  'psql "$DIRECT_URL" -c "SELECT l.pid, l.granted, a.application_name, a.state, left(a.query,80) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='"'"'advisory'"'"';"'

echo ""
echo "==> Encerrando sessões idle que seguram o lock..."
pnpm --filter @gas-erp/database exec dotenv -e ../../.env -- sh -c \
  'psql "$DIRECT_URL" -t -A -c "SELECT pg_terminate_backend(l.pid) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='"'"'advisory'"'"' AND a.state='"'"'idle'"'"';"'

sleep 2
echo ""
echo "==> Aplicando migrations..."
pnpm db:deploy
