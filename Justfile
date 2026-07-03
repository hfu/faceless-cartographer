# faceless-cartographer -- static SPA built with Vite, output to docs/ for
# GitHub Pages (DECISIONS.md D18).

default:
    @just --list

install:
    npm install

# Local development server with hot reload.
dev:
    npm run dev

# Refreshes the bundled Staff prompt snapshot, then builds the static site
# into docs/.
build:
    npm run build

preview: build
    npm run preview

typecheck:
    npm run typecheck

test:
    npm test

# Run both checks used in CI.
check: typecheck test
