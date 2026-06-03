#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${TARGET_DIR:-/mnt/hgfs/webstormProjects/xhsmedium_release}"
SOURCE_DIR="${SOURCE_DIR:-${PROJECT_ROOT}}"

log_step() {
  local message="$1"
  printf '[sync] %s\n' "${message}"
}

log_step "checking rsync"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required but was not found in PATH." >&2
  exit 1
fi

log_step "checking source directory"

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Source directory does not exist: ${SOURCE_DIR}" >&2
  exit 1
fi

log_step "preparing target directory"
mkdir -p "${TARGET_DIR}"

log_step "starting sync"

rsync \
  -a \
  --human-readable \
  --itemize-changes \
  --info=progress2,stats \
  --filter="+ /.env.example" \
  --filter="+ /.env.production.example" \
  --filter="+ /backend/.env.example" \
  --filter="- /.env*" \
  --filter="- /frontend/.env*" \
  --filter="- /backend/.env*" \
  --exclude=".git/" \
  --exclude=".idea/" \
  --exclude=".vscode/" \
  --exclude=".playwright-profiles/" \
  --exclude=".claude/worktrees/" \
  --exclude="node_modules/" \
  --exclude="frontend/node_modules/" \
  --exclude="backend/node_modules/" \
  --exclude="frontend/.next/" \
  --exclude="frontend/out/" \
  --exclude="backend/dist/" \
  --exclude="coverage/" \
  --exclude="frontend/coverage/" \
  --exclude="backend/coverage/" \
  --exclude="test-results/" \
  --exclude="frontend/test-results/" \
  --exclude="backend/test-results/" \
  --exclude="playwright-report/" \
  --exclude="backups/" \
  --exclude="debug-output/" \
  --exclude="screenshots/" \
  --exclude="versions/" \
  --exclude="tmp/" \
  --exclude="*.log" \
  --exclude="*.zip" \
  --exclude=".DS_Store" \
  --exclude="data.json" \
  --exclude="daily-snapshots.json" \
  --exclude="password_backup.txt" \
  --exclude="start.js" \
  --exclude="start-dev.cmd" \
  --exclude="start-dev.sh" \
  "${SOURCE_DIR}/" \
  "${TARGET_DIR}/"

log_step "sync completed"
printf 'Source: %s\n' "${SOURCE_DIR}"
printf 'Target: %s\n' "${TARGET_DIR}"
printf 'Completed at: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
