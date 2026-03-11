#!/usr/bin/env bash

set -euo pipefail

kill_port_listeners() {
	local port="$1"

	if command -v lsof >/dev/null 2>&1; then
		local pids
		pids="$(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)"
		if [[ -n "${pids}" ]]; then
			# shellcheck disable=SC2086
			kill ${pids} >/dev/null 2>&1 || true
		fi
		return 0
	fi

	if command -v fuser >/dev/null 2>&1; then
		fuser -k "${port}/tcp" >/dev/null 2>&1 || true
	fi

	return 0
}

cleanup() {
	if [[ -n "${BACKEND_PID:-}" ]]; then
		kill "${BACKEND_PID}" >/dev/null 2>&1 || true
	fi
	if [[ -n "${FRONTEND_PID:-}" ]]; then
		kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
	fi
}

trap cleanup EXIT INT TERM

# Ensure stale web-mode instances don't keep serving old bundles.
kill_port_listeners 3210
kill_port_listeners 3211
kill_port_listeners 3212

bun run dev:web:backend &
BACKEND_PID=$!

bun run dev:web:frontend &
FRONTEND_PID=$!

while true; do
	if ! kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
		wait "${BACKEND_PID}"
		exit $?
	fi
	if ! kill -0 "${FRONTEND_PID}" >/dev/null 2>&1; then
		wait "${FRONTEND_PID}"
		exit $?
	fi
	sleep 1
done
