#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
export ELECTRON_RUN_AS_NODE="${ELECTRON_RUN_AS_NODE:-1}"

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

check_native_modules_compatible() {
	local check_output

	set +e
	check_output="$(
		"${ELECTRON_BIN}" -e '
const requiredModules = ["better-sqlite3", "node-pty"];
for (const mod of requiredModules) {
	try {
		require(mod);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[native-check] ${mod}: ${message}`);
		process.exit(64);
	}
}
process.exit(0);
' 2>&1
	)"
	local status=$?
	set -e

	if [[ ${status} -eq 0 ]]; then
		return 0
	fi

	echo "${check_output}" >&2
	return ${status}
}

rebuild_native_modules() {
	echo "[run-web-backend] Rebuilding Electron native modules (better-sqlite3/node-pty)..." >&2
	if (cd "${APP_DIR}" && bun run install:deps); then
		return 0
	fi

	echo "[run-web-backend] Native rebuild failed." >&2
	echo "[run-web-backend] On low-memory VMs, enable swap and retry:" >&2
	echo "  sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096" >&2
	echo "  sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile" >&2
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

if ! check_native_modules_compatible; then
	if ! rebuild_native_modules; then
		exit 1
	fi

	if ! check_native_modules_compatible; then
		echo "[run-web-backend] Native modules are still incompatible after rebuild." >&2
		exit 1
	fi
fi

exec "${ELECTRON_BIN}" --import tsx src/main/web-backend/index.ts
