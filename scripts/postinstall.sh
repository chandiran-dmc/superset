#!/bin/bash
# Prevent infinite recursion during postinstall
# electron-builder install-app-deps can trigger nested bun installs
# which would re-run postinstall, spawning hundreds of processes

if [ -n "$SUPERSET_POSTINSTALL_RUNNING" ]; then
  exit 0
fi

export SUPERSET_POSTINSTALL_RUNNING=1

# Allow lightweight installs (for low-memory VMs / web-mode only setups).
# When this is set, native desktop rebuild is skipped during install.
if [ "${SUPERSET_SKIP_DESKTOP_INSTALL_DEPS:-0}" = "1" ]; then
  echo "[postinstall] SUPERSET_SKIP_DESKTOP_INSTALL_DEPS=1, skipping desktop native deps rebuild"
  # Keep workspace validation unless explicitly disabled.
  if [ "${SUPERSET_SKIP_SHERIF:-0}" != "1" ]; then
    sherif
  fi
  exit 0
fi

# Run sherif for workspace validation
if [ "${SUPERSET_SKIP_SHERIF:-0}" != "1" ]; then
  sherif
fi

# Install native dependencies for desktop app
bun run --filter=@superset/desktop install:deps
