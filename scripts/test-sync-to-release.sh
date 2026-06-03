#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${PROJECT_ROOT}/tmp/sync-script-test.XXXXXX")"
SOURCE_DIR="${TEST_ROOT}/source"
TARGET_DIR="${TEST_ROOT}/target"

mkdir -p \
  "${SOURCE_DIR}/frontend/.next" \
  "${SOURCE_DIR}/backend/dist" \
  "${SOURCE_DIR}/node_modules/pkg" \
  "${SOURCE_DIR}/scripts" \
  "${TARGET_DIR}"

cat > "${SOURCE_DIR}/package.json" <<'EOF'
{"name":"fixture"}
EOF

cat > "${SOURCE_DIR}/frontend/package.json" <<'EOF'
{"name":"frontend-fixture"}
EOF

cat > "${SOURCE_DIR}/frontend/.next/should-skip.txt" <<'EOF'
skip me
EOF

cat > "${SOURCE_DIR}/backend/dist/should-skip.txt" <<'EOF'
skip me
EOF

cat > "${SOURCE_DIR}/node_modules/pkg/index.js" <<'EOF'
module.exports = {}
EOF

cat > "${SOURCE_DIR}/.env.example" <<'EOF'
API_URL=http://example.test
EOF

cat > "${SOURCE_DIR}/.env.local" <<'EOF'
SECRET=skip
EOF

cat > "${SOURCE_DIR}/scripts/custom.js" <<'EOF'
console.log("sync me");
EOF

cat > "${TARGET_DIR}/package.json" <<'EOF'
{"name":"old-target"}
EOF

cat > "${TARGET_DIR}/keep.txt" <<'EOF'
keep me
EOF

OUTPUT="$(
  SOURCE_DIR="${SOURCE_DIR}" TARGET_DIR="${TARGET_DIR}" \
    "${PROJECT_ROOT}/scripts/sync-to-release.sh" 2>&1
)"

assert_file_exists() {
  local path="$1"
  if [[ ! -e "${path}" ]]; then
    echo "Expected file to exist: ${path}" >&2
    exit 1
  fi
}

assert_file_missing() {
  local path="$1"
  if [[ -e "${path}" ]]; then
    echo "Expected file to be missing: ${path}" >&2
    exit 1
  fi
}

assert_file_contains() {
  local path="$1"
  local expected="$2"
  if ! grep -Fq "${expected}" "${path}"; then
    echo "Expected ${path} to contain: ${expected}" >&2
    exit 1
  fi
}

assert_output_contains() {
  local expected="$1"
  if [[ "${OUTPUT}" != *"${expected}"* ]]; then
    echo "Expected output to contain: ${expected}" >&2
    echo "--- output start ---" >&2
    printf '%s\n' "${OUTPUT}" >&2
    echo "--- output end ---" >&2
    exit 1
  fi
}

assert_output_contains "[sync] checking rsync"
assert_output_contains "[sync] checking source directory"
assert_output_contains "[sync] preparing target directory"
assert_output_contains "[sync] starting sync"
assert_output_contains "[sync] sync completed"

assert_file_exists "${TARGET_DIR}/package.json"
assert_file_exists "${TARGET_DIR}/frontend/package.json"
assert_file_exists "${TARGET_DIR}/scripts/custom.js"
assert_file_exists "${TARGET_DIR}/keep.txt"
assert_file_exists "${TARGET_DIR}/.env.example"

assert_file_contains "${TARGET_DIR}/package.json" '"name":"fixture"'
assert_file_contains "${TARGET_DIR}/keep.txt" 'keep me'

assert_file_missing "${TARGET_DIR}/frontend/.next/should-skip.txt"
assert_file_missing "${TARGET_DIR}/backend/dist/should-skip.txt"
assert_file_missing "${TARGET_DIR}/node_modules/pkg/index.js"
assert_file_missing "${TARGET_DIR}/.env.local"

echo "sync-to-release test passed"
