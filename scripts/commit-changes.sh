#!/usr/bin/env bash
# Commits the current working-tree changes in phases, one commit per part of the project.
#
#   ./scripts/commit-changes.sh           run every phase
#   ./scripts/commit-changes.sh 2 3       run only phases 2 and 3
#   ./scripts/commit-changes.sh --list    print the phases and their commit titles
#
# This round: the Gmail error reason, categories from imports, the carried-over balance, the
# month picker and the new summary card. Safe to re-run: a phase with nothing new to commit is
# skipped.
set -euo pipefail
cd "$(dirname "$0")/.."

TITLES=(
  "fix(server): log Google's reason when a Gmail request fails"
  "feat(shared): add the import category field and carry-over to the contract"
  "feat(server): create categories from imports and carry the balance over"
  "feat(web): add month picker, carry-over and a livelier summary card"
  "chore: update the commit script"
)

paths_for() {
  case "$1" in
    1) echo "server/src/intake/gmail.ts" ;;
    2) echo "shared" ;;
    3) echo "server" ;;
    4) echo "web" ;;
    5) echo "scripts" ;;
    *) echo "Unknown phase: $1 (there are ${#TITLES[@]})" >&2; exit 1 ;;
  esac
}

run_phase() {
  local number=$1
  local paths
  paths=$(paths_for "$number")
  local title=${TITLES[$((number - 1))]}
  # shellcheck disable=SC2086 # the paths are a space-separated list with no spaces inside them
  git add --all -- $paths
  if git diff --cached --quiet; then
    echo "phase $number: nothing to commit, skipped"
    return
  fi
  git commit --quiet -m "$title"
  echo "phase $number: $title"
}

if [ "${1:-}" = "--list" ]; then
  for i in "${!TITLES[@]}"; do printf '%2d  %s\n' "$((i + 1))" "${TITLES[$i]}"; done
  exit 0
fi

if ! git diff --cached --quiet; then
  echo "There are already staged changes. Commit or unstage them first." >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  set -- $(seq 1 "${#TITLES[@]}")
fi
for number in "$@"; do run_phase "$number"; done

leftover=$(git status --short)
if [ -n "$leftover" ]; then
  echo
  echo "Not committed by any phase:"
  echo "$leftover"
fi
