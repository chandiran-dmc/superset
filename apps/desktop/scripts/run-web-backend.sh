#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

resolve_electron_bin() {
	local candidates=(
		"${APP_DIR}/node_modules/.bin/electron"
		"${APP_DIR}/../../node_modules/.bin/electron"
	)

	local bin
	for bin in "${candidates[@]}"; do
		if [[ -x "${bin}" ]]; then
			echo "${bin}"
			return 0
		fi
	done

	if command -v electron >/dev/null 2>&1; then
		command -v electron
		return 0
	fi

	return 1
}

ELECTRON_BIN="$(resolve_electron_bin || true)"

if [[ -z "${ELECTRON_BIN}" ]]; then
	echo "[run-web-backend] Unable to find Electron binary." >&2
	echo "[run-web-backend] Checked:" >&2
	echo "  - ${APP_DIR}/node_modules/.bin/electron" >&2
	echo "  - ${APP_DIR}/../../node_modules/.bin/electron" >&2
	echo "  - electron on PATH" >&2
	echo "[run-web-backend] Re-run install: bun run install:web:vm" >&2
	exit 1
fi

cd "${APP_DIR}"
exec "${ELECTRON_BIN}" --import tsx src/main/web-backend/index.ts
