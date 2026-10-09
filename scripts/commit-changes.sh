#!/usr/bin/env bash
# Commits the current working-tree changes in phases, one commit per part of the project.
#
#   ./scripts/commit-changes.sh           run every phase
#   ./scripts/commit-changes.sh 2 3       run only phases 2 and 3
#   ./scripts/commit-changes.sh --list    print the phases and their commit titles
#
# This round: editing a transaction's title, amount, date and payee, renaming accounts, and the
# month picker, carry-over and new summary card on Mac and iPhone. Safe to re-run: a phase with
# nothing new to commit is skipped.
set -euo pipefail
cd "$(dirname "$0")/.."

TITLES=(
  "feat(shared): add editable transaction fields to the contract"
  "feat(server): let a transaction's title, amount, date and payee be edited"
  "feat(web): edit transaction details and rename accounts"
  "feat(apple): add month picker, carry-over, new summary card and editing"
  "chore: update the commit script"
)

paths_for() {
  case "$1" in
    1) echo "shared" ;;
    2) echo "server" ;;
    3) echo "web" ;;
    4) echo "apple" ;;
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
