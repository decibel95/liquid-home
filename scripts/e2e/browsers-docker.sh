#!/usr/bin/env bash
# Runs the cross-browser smoke subset (test/e2e/smoke.spec.ts) in Firefox and WebKit inside the official Playwright image,
# for a host that lacks their system libraries (D-10). CI does not need this: it runs
#   npx playwright install --with-deps firefox webkit && LH_E2E_BROWSERS=firefox,webkit npm run e2e
# Usage: scripts/e2e/browsers-docker.sh [extra playwright args]      (needs docker and a built dist/, `npm run build`)
# The worktree is mounted read-write (test output goes to node_modules/.cache/lh-e2e); the container runs as the calling user.
set -euo pipefail
cd "$(dirname "$0")/../.."
IMAGE="${LH_E2E_IMAGE:-mcr.microsoft.com/playwright:v1.65.1-noble}"
exec docker run --rm --init --ipc=host \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e CI="${CI:-}" \
  -e LH_E2E_BROWSERS="${LH_E2E_BROWSERS:-firefox,webkit}" \
  -e LH_E2E_CACHE=/tmp/lh-e2e-cache \
  -v "$PWD":/work -w /work \
  "$IMAGE" \
  npx playwright test -c test/e2e/playwright.config.ts "$@"
