#!/usr/bin/env bash
# Railway releaseCommand: aplica migrations somente se houver pendências.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Verificando migrations pendentes..."

STATUS="$(pnpm --filter @gas-erp/database exec prisma migrate status 2>&1 || true)"

if echo "$STATUS" | grep -q "Database schema is up to date"; then
  echo "==> Schema atual — pulando prisma migrate deploy"
  exit 0
fi

if echo "$STATUS" | grep -q "Following migration"; then
  echo "==> Migrations pendentes — aplicando..."
  pnpm --filter @gas-erp/database exec prisma migrate deploy
  exit 0
fi

echo "==> Status inesperado do Prisma migrate status:"
echo "$STATUS"
exit 1
