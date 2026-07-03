#!/usr/bin/env bash
# Fly.io release_command — roda antes de trocar tráfego para a nova versão.
set -euo pipefail
exec bash "$(dirname "$0")/release-migrate.sh"
