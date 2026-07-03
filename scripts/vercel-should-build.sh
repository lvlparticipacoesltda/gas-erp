#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = pular build; exit 1 = buildar.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CURRENT="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

# Redeploy do mesmo commit (ex.: só mudou env NEXT_PUBLIC_*) — sempre buildar.
if [[ -z "$PREV" || "$PREV" == "$CURRENT" ]]; then
  echo "Redeploy ou primeiro deploy — build necessário"
  exit 1
fi

PATHS=(
  apps/web
  packages/shared
  packages/database/prisma
  pnpm-lock.yaml
  turbo.json
  tsconfig.base.json
  scripts/vercel-should-build.sh
)

if git diff --quiet "$PREV" "$CURRENT" -- "${PATHS[@]}" 2>/dev/null; then
  echo "Sem mudanças em web/shared/schema — pulando build Vercel"
  exit 0
fi

echo "Mudanças detectadas em web — build necessário"
exit 1
