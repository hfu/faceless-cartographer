# faceless-cartographer
#
# First-time setup on a fresh clone:
#   cp .env.example .env   # adjust PORT etc. if needed
#   just serve
#
# `serve` installs dependencies automatically on first run (when
# node_modules doesn't exist yet) but skips that step on subsequent runs,
# so restarts (e.g. via systemd) don't depend on network/npm being
# reachable just to come back up.

default:
    @just --list

# Install/refresh dependencies. Run this after `git pull` to pick up
# dependency changes.
install:
    npm install

# Local development: restarts on file changes, loads .env if present.
dev:
    npx tsx watch --env-file-if-exists=.env src/server.ts

# Start the server. This is what systemd's ExecStart runs in production
# (see deploy/faceless-cartographer.service).
serve:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d node_modules ]; then
      npm install
    fi
    exec npx tsx --env-file-if-exists=.env src/server.ts

typecheck:
    npm run typecheck

test:
    npm test

# Run both checks used in CI.
check: typecheck test
