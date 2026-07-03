#!/usr/bin/env bash
# Valida se o projeto está pronto para deploy em produção.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Verificando Node..."
node -v | grep -E '^v([2-9][0-9])\.' >/dev/null || { echo "Node 20+ necessário"; exit 1; }

echo "==> Verificando pnpm..."
pnpm -v >/dev/null

echo "==> Build monorepo (turbo)..."
pnpm install --frozen-lockfile
pnpm db:generate
pnpm turbo build --filter=@gas-erp/api --filter=@gas-erp/web

echo "==> Verificando arquivos de deploy..."
test -f railway.toml
test -f apps/web/vercel.json
test -f packages/database/prisma/migrations/20250624000000_init/migration.sql

echo ""
echo "OK — projeto pronto para deploy."
echo ""
echo "Próximos passos manuais (ver docs/deployment.md):"
echo "  1. Neon: criar DB e rodar  pnpm db:deploy  +  pnpm db:seed"
echo "  2. Railway: conectar GitHub, configurar env vars, deploy API"
echo "  3. Vercel: importar repo (root apps/web), NEXT_PUBLIC_API_URL"
echo "  4. DNS: app.SEUDOMINIO → Vercel, api.SEUDOMINIO → Railway"
echo "  5. Validar login em https://app.SEUDOMINIO/login"
