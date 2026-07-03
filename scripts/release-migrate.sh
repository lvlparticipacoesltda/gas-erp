#!/usr/bin/env bash
# Aplica prisma migrate deploy somente se houver migrations pendentes.
# Usado no Railway, Fly.io release_command e deploy manual.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL não definida"
  exit 1
fi

run_prisma() {
  if [[ -f "$ROOT/package.json" ]] && command -v pnpm >/dev/null 2>&1; then
    pnpm --filter @gas-erp/database exec prisma "$@"
  else
    cd "$ROOT/packages/database"
    npx prisma "$@"
  fi
}

echo "==> Verificando migrations pendentes..."

STATUS="$(run_prisma migrate status 2>&1 || true)"

if echo "$STATUS" | grep -q "Database schema is up to date"; then
  echo "==> Schema atual — pulando prisma migrate deploy"
  exit 0
fi

if echo "$STATUS" | grep -q "Following migration"; then
  echo "==> Migrations pendentes — aplicando..."
  run_prisma migrate deploy
  exit 0
fi

echo "==> Status inesperado do prisma migrate status:"
echo "$STATUS"
exit 1
