#!/usr/bin/env bash
set -euo pipefail

# Hard-fail guardrail:
# If a PR changes src/lib/** it must also change tests (src/**/__tests__/** or **/*.test.*)
# unless a maintainer applies the label: no-tests-ok

BASE_SHA="${GITHUB_BASE_SHA:-}"
HEAD_SHA="${GITHUB_SHA:-}"

if [[ -z "$BASE_SHA" || -z "$HEAD_SHA" ]]; then
  echo "[require-tests] Missing BASE_SHA/HEAD_SHA; skipping."
  exit 0
fi

CHANGED=$(git diff --name-only "$BASE_SHA" "$HEAD_SHA" || true)

if [[ -z "$CHANGED" ]]; then
  echo "[require-tests] No changed files."
  exit 0
fi

HAS_LIB_CHANGE=0
HAS_TEST_CHANGE=0

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if [[ "$f" == src/lib/* || "$f" == src/lib/** ]]; then
    HAS_LIB_CHANGE=1
  fi
  if [[ "$f" == src/**/__tests__/* || "$f" == src/**/__tests__/** || "$f" == *".test."* || "$f" == *".spec."* ]]; then
    HAS_TEST_CHANGE=1
  fi
done <<< "$CHANGED"

if [[ "$HAS_LIB_CHANGE" -eq 1 && "$HAS_TEST_CHANGE" -eq 0 ]]; then
  echo "[require-tests] FAIL: src/lib changed but no tests changed."
  echo "[require-tests] Add/modify tests under src/**/__tests__/** or add *.test.* files."
  echo "[require-tests] If truly not needed, apply label: no-tests-ok (maintainers only)."
  exit 1
fi

echo "[require-tests] OK"
