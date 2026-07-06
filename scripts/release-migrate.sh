#!/usr/bin/env bash
# Aplica prisma migrate deploy (idempotente — OK se schema já estiver atualizado).
# Usado no Railway, Fly.io release_command e deploy manual.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_DIR="$ROOT/packages/database"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL não definida."
  echo "Fly: fly secrets set DATABASE_URL='...' DIRECT_URL='...'"
  exit 1
fi

if [[ ! -f "$DB_DIR/prisma/schema.prisma" ]]; then
  echo "ERROR: schema Prisma não encontrado em $DB_DIR/prisma"
  exit 1
fi

cd "$DB_DIR"

echo "==> Prisma migrate deploy"
echo "==> DATABASE_URL host: $(node -pe "try{new URL(process.env.DATABASE_URL).hostname}catch{''}" 2>/dev/null || echo '?')"
if [[ -n "${DIRECT_URL:-}" ]]; then
  echo "==> DIRECT_URL: definida (recomendado para Neon)"
else
  echo "==> AVISO: DIRECT_URL não definida — migrations no Neon podem falhar sem host directo"
fi

# migrate deploy é idempotente; evita fragilidade do migrate status + grep no Fly
npx prisma migrate deploy

echo "==> Migrations OK"
