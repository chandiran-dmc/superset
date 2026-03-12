#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# VM-friendly install path:
# - skips heavy desktop native rebuild during postinstall
# - lowers install concurrency to reduce memory pressure
export SUPERSET_SKIP_DESKTOP_INSTALL_DEPS="${SUPERSET_SKIP_DESKTOP_INSTALL_DEPS:-1}"

NETWORK_CONCURRENCY="${BUN_NETWORK_CONCURRENCY:-16}"
SCRIPT_CONCURRENCY="${BUN_SCRIPT_CONCURRENCY:-1}"

bun install \
  --filter=@superset/desktop \
  --network-concurrency="${NETWORK_CONCURRENCY}" \
  --concurrent-scripts="${SCRIPT_CONCURRENCY}"

echo
echo "Install complete."
echo "To run web mode:"
echo "  cd apps/desktop && bun run start:web"
