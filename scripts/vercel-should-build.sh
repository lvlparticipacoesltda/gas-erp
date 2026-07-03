#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = pular build; exit 1 = buildar.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CURRENT="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [[ -z "$PREV" ]]; then
  echo "Primeiro deploy ou SHA anterior ausente — build necessário"
  exit 1
fi

PATHS=(
  apps/web
  packages/shared
  packages/database/prisma
  pnpm-lock.yaml
  turbo.json
  tsconfig.base.json
)

if git diff --quiet "$PREV" "$CURRENT" -- "${PATHS[@]}" 2>/dev/null; then
  echo "Sem mudanças em web/shared/schema — pulando build Vercel"
  exit 0
fi

echo "Mudanças detectadas em web — build necessário"
exit 1
