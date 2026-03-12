# Superset (Local Web + Backend)

This fork runs Superset as:
- a local web frontend
- a local backend exposed on ports
- single-user mode with auth removed for local use

## Requirements

- Bun
- Git
- macOS or Linux
- Optional: `gh` (GitHub CLI) for GitHub metadata/PR features
- Linux only: `zenity` or `kdialog` for native folder/file picker dialogs

## Install

Standard install:

```bash
bun install
```

Low-memory VM install (recommended on small Linux VMs):

```bash
./scripts/install-web-vm.sh
```

This skips the expensive desktop native rebuild during install and lowers Bun concurrency.

## Run Locally

From repo root:

```bash
cd apps/desktop
bun run dev:web
```

Then open:

- Frontend: `http://localhost:3210`
- Backend HTTP: `http://127.0.0.1:3211`
- Backend WS: `ws://127.0.0.1:3212`

Stop with `Ctrl + C`.

## Run on Custom Ports

```bash
cd apps/desktop
DESKTOP_WEB_FRONTEND_PORT=4000 \
DESKTOP_WEB_BACKEND_PORT=4001 \
DESKTOP_WEB_BACKEND_WS_PORT=4002 \
bun run dev:web
```

Open `http://localhost:4000`.

## Expected Capabilities

This web mode is intended to keep desktop parity for local workflows:

- Manage projects/repositories
- Create and switch workspaces/worktrees
- Use terminal panes
- Use agent panes (`claude` / `codex` / `opencode`)
- Browse/open files from file tree
- View and manage git changes

## Troubleshooting

- If a login page appears:
  - start with `bun run dev:web` (it enables local no-auth mode)

- If `Open project` does nothing on Linux:
  - install `zenity` or `kdialog`

- If `bun install` gets `Killed` on a VM:
  - use the VM install script: `./scripts/install-web-vm.sh`
  - if still failing, add swap and retry:
    ```bash
    sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    ```
  - after install, start with:
    ```bash
    cd apps/desktop
    bun run start:web
    ```

- If GitHub avatar/PR metadata is missing:
  - install and authenticate `gh` (optional feature)

- If ports are busy:
  - use custom ports (see section above)

- To reset local Superset state:
  - remove `~/.superset` and restart

## Helpful Commands

From repo root:

```bash
bun run lint
bun run typecheck
bun run test
```

Desktop package only:

```bash
cd apps/desktop
bun run typecheck
```
