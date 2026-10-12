#!/usr/bin/env bash
# Fails when the branch modifies, deletes or renames a protected test file. Added files are fine.
# A PR titled "Test change: <why>" (PR_TITLE) may touch them, alone in that PR.
# Rule: hive/test-integrity-rule.txt. Env: BASE (default origin/main), PR_TITLE (absent = fail closed).
set -euo pipefail

# Shell `case` globs: `*` crosses slashes. The tests and the recordings they compare against are the judge.
PROTECTED=(
    'tests/*'
    'features/*'
    '*.feature'
    'scripts/guard_cases/*'
    '*/fixtures/*'
    '*__snapshots__/*'
)

base="${BASE:-origin/main}"
mb="$(git merge-base "$base" HEAD)" || { echo "check-test-integrity: no merge-base with $base" >&2; exit 2; }

is_protected() {
  local glob
  for glob in "${PROTECTED[@]}"; do
    # shellcheck disable=SC2254
    case "$1" in $glob) return 0 ;; esac
  done
  return 1
}

# --no-renames: a rename reads as D(old)+A(new), so moving a test out of its place is a deletion.
# Working tree vs merge-base, so an uncommitted edit is caught locally as well as a committed one.
violations=()
while IFS= read -r -d '' status && IFS= read -r -d '' path; do
  [ "$status" = A ] && continue
  if is_protected "$path"; then violations+=("$status $path"); fi
done < <(git diff --no-renames --name-status -z "$mb")

if [ ${#violations[@]} -eq 0 ]; then
  echo "check-test-integrity: ok, no protected file changed since $base"
  exit 0
fi
case "${PR_TITLE:-}" in
  "Test change:"*) echo "check-test-integrity: ${#violations[@]} protected file(s) changed, allowed by the PR title"; exit 0 ;;
esac
echo "check-test-integrity: FAILED. Existing tests are locked; only a PR titled \"Test change: <why>\" may change them:" >&2
printf '  %s\n' "${violations[@]}" >&2
[ -n "${PR_TITLE:-}" ] || echo "(PR_TITLE is not set, so this fails closed)" >&2
exit 1
