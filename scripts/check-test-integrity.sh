#!/usr/bin/env bash
# Fails when the branch changes an existing test outside a commit whose message starts "Test change:".
# Judged per commit since merge-base(BASE, HEAD), plus uncommitted edits: added lines pass, removed or
# changed lines in a protected file fail, and an added skip/only marker fails even in an addition.
# Rule: hive/test-integrity-rule.txt (items 1 and 7). Env: BASE (default origin/main). Waivers: .test-integrity-waivers on BASE.
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

# A test that no longer runs, or makes the others not run. Added lines only; built per language.
DISABLES='(pytest\.mark\.(skip|skipif|xfail)|pytest\.(skip|xfail)\(|unittest\.skip|XCTSkip|(^|[^A-Za-z0-9_])(it|test|describe|suite|context)\.(skip|only|todo)([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_.])(xit|xtest|xdescribe|fit|fdescribe)\(|\.disabled\(|@(skip|wip|ignore)([^A-Za-z0-9_]|$))'

is_protected() {
  local glob
  for glob in "${PROTECTED[@]}"; do
    # shellcheck disable=SC2254
    case "$1" in $glob) return 0 ;; esac
  done
  return 1
}

violations=()

# Judge one change set: "$@" is the git diff range, $label names it in the message.
judge() {
  local label=$1 allowed=$2; shift 2
  local added removed path
  while IFS=$'\t' read -r added removed path; do
    is_protected "$path" || continue
    [ "$allowed" = yes ] && continue
    if [ "$added" != 0 ] && [ "$added" != - ]; then
      local line
      line="$(git diff --no-renames -U0 "$@" -- "$path" | grep '^+' | grep -v '^+++' | grep -E -m1 "$DISABLES" || true)"
      [ -z "$line" ] || violations+=("$label $path: adds a skip/only marker: ${line:1:120}")
    fi
    # Only a test that exists on the base is locked; the branch may reshape the tests it adds.
    git cat-file -e "$mb:$path" 2>/dev/null || continue
    # "-" is a binary file (a snapshot image): any change to one counts.
    if [ "$removed" = - ]; then
      violations+=("$label $path: changes an existing binary recording")
    elif [ "$removed" != 0 ]; then
      local gone
      gone="$(removed_lines "$@" -- "$path" | spend_own "$path")"
      [ "$gone" = 0 ] || violations+=("$label $path: changes or removes $gone existing line(s)")
    fi
  done < <(git diff --no-renames --numstat "$@")
  [ "$allowed" = yes ] && return 0
  # What this commit added becomes the branch's own: a later commit may reshape it.
  while IFS=$'\t' read -r added removed path; do
    is_protected "$path" && [ "$added" != 0 ] && [ "$added" != - ] || continue
    git diff --no-renames -U0 "$@" -- "$path" | grep '^+' | grep -v '^+++' | cut -c2- >> "$(own_file "$path")" || true
  done < <(git diff --no-renames --numstat "$@")
}

# Lines the branch added in its own ordinary commits, per protected file, kept as a multiset so a
# copy of an existing line added on the branch cannot pay for deleting the original.
own_dir="$(mktemp -d)"
trap 'rm -rf "$own_dir"' EXIT
own_file() { local f="$own_dir/$(printf '%s' "$1" | tr '/' '%')"; touch "$f"; printf '%s' "$f"; }
removed_lines() { git diff --no-renames -U0 "$@" | grep '^-' | grep -v '^---' | cut -c2- || true; }
# Reads removed lines on stdin; spends matching own lines; prints how many were not the branch's own.
spend_own() {
  local own; own="$(own_file "$1")"
  # FILENAME, not NR == FNR: the own file is often empty, and then every removed line would count as own.
  awk -v keep="$own.next" -v ownf="$own" 'FILENAME == ownf { n[$0]++; next } { if (n[$0] > 0) n[$0]--; else bad++ }
    END { for (k in n) for (i = 0; i < n[k]; i++) print k > keep; close(keep); print bad + 0 }' "$own" - 
  touch "$own.next"; mv "$own.next" "$own"
}

# Commits made before the rule, waived one by one: `<full sha> <reason> (approved: god)`. Read from
# the base, never the branch, so a pull request cannot waive its own commits.
WAIVERS=.test-integrity-waivers
waivers="$(git show "$base:$WAIVERS" 2>/dev/null || true)"
waived=""
while IFS= read -r entry; do
  case "$entry" in "" | "#"*) continue ;; esac
  if ! printf '%s\n' "$entry" | grep -Eq '^[0-9a-f]{40} [^ ].* \(approved: god\)$'; then
    echo "check-test-integrity: FAILED. Malformed line in $WAIVERS on $base (want '<full sha> <reason> (approved: god)'):" >&2
    echo "  $entry" >&2
    exit 1
  fi
  waived="$waived ${entry%% *}"
done <<< "$waivers"

# Per commit, so a "Test change:" commit covers only itself, never the code commits beside it.
# Merges are skipped: what they bring in was judged on its own branch.
for commit in $(git rev-list --no-merges --reverse "$mb..HEAD"); do
  case " $waived " in *" $commit "*)
    echo "check-test-integrity: waived $(git rev-parse --short "$commit"): $(git show "$base:$WAIVERS" | grep "^$commit " | cut -d' ' -f2-)"
    continue ;;
  esac
  allowed=no
  case "$(git log -1 --format=%s "$commit")" in "Test change:"*) allowed=yes ;; esac
  judge "$(git rev-parse --short "$commit")" "$allowed" "$commit^" "$commit"
done
# Uncommitted edits have no message, so they are never a test change.
judge "uncommitted" no HEAD

if [ ${#violations[@]} -eq 0 ]; then
  echo "check-test-integrity: ok, no existing test changed since $base outside a 'Test change:' commit"
  exit 0
fi
echo "check-test-integrity: FAILED. Existing tests are locked (hive test-integrity rule); only a commit" >&2
echo "whose message starts 'Test change: <why>' may change one, in its own reviewed PR:" >&2
printf '  %s\n' "${violations[@]}" >&2
exit 1
