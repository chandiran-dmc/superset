#!/usr/bin/env bash

set -euo pipefail

cleanup() {
	if [[ -n "${BACKEND_PID:-}" ]]; then
		kill "${BACKEND_PID}" >/dev/null 2>&1 || true
	fi
	if [[ -n "${FRONTEND_PID:-}" ]]; then
		kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
	fi
}

trap cleanup EXIT INT TERM

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
