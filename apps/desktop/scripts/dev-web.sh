#!/usr/bin/env bash

set -euo pipefail

# Defaults (can be overridden by caller env)
: "${DESKTOP_WEB_FRONTEND_PORT:=3210}"
: "${DESKTOP_WEB_BACKEND_PORT:=3211}"
: "${DESKTOP_WEB_BACKEND_WS_PORT:=3212}"
: "${DESKTOP_WEB_FRONTEND_ORIGIN:=http://127.0.0.1:${DESKTOP_WEB_FRONTEND_PORT}}"
: "${DESKTOP_BACKEND_URL:=http://127.0.0.1:${DESKTOP_WEB_BACKEND_PORT}}"
: "${DESKTOP_BACKEND_WS_URL:=ws://127.0.0.1:${DESKTOP_WEB_BACKEND_WS_PORT}}"

export DESKTOP_WEB_FRONTEND_PORT
export DESKTOP_WEB_BACKEND_PORT
export DESKTOP_WEB_BACKEND_WS_PORT
export DESKTOP_WEB_FRONTEND_ORIGIN
export DESKTOP_BACKEND_URL
export DESKTOP_BACKEND_WS_URL

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
		return 0
	fi

	if command -v ss >/dev/null 2>&1; then
		local pids
		pids="$(
			ss -ltnp "sport = :${port}" 2>/dev/null \
				| awk -F "pid=" 'NR>1 { split($2, parts, ","); if (parts[1] != \"\") print parts[1] }' \
				| sort -u
		)"
		if [[ -n "${pids}" ]]; then
			# shellcheck disable=SC2086
			kill ${pids} >/dev/null 2>&1 || true
		fi
	fi

	return 0
}

wait_for_backend() {
	local url="$1"
	local retries=60

	for ((i = 1; i <= retries; i++)); do
		if command -v curl >/dev/null 2>&1; then
			if curl -fsS "${url}" >/dev/null 2>&1; then
				return 0
			fi
		elif command -v wget >/dev/null 2>&1; then
			if wget -q -O - "${url}" >/dev/null 2>&1; then
				return 0
			fi
		fi

		if ! kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
			wait "${BACKEND_PID}"
			return 1
		fi

		sleep 0.5
	done

	echo "[dev-web] Timed out waiting for backend health at ${url}" >&2
	return 1
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
kill_port_listeners "${DESKTOP_WEB_FRONTEND_PORT}"
kill_port_listeners "${DESKTOP_WEB_BACKEND_PORT}"
kill_port_listeners "${DESKTOP_WEB_BACKEND_WS_PORT}"

bun run dev:web:backend &
BACKEND_PID=$!

wait_for_backend "http://127.0.0.1:${DESKTOP_WEB_BACKEND_PORT}/healthz"

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
