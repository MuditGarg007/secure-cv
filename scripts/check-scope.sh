#!/usr/bin/env bash
# Usage: scripts/check-scope.sh <agent> [base=main] [head=HEAD]
# Fails if <head> (plus uncommitted + untracked changes when head=HEAD) touches any file
# outside <agent>'s globs in scripts/owners.txt. Shared files (config.ts) are allowed
# but listed so the reviewer checks you stayed inside your own section.
set -euo pipefail
agent="${1:?usage: check-scope.sh <agent> [base] [head]}"
base="${2:-main}"
head="${3:-HEAD}"
root="$(git rev-parse --show-toplevel)"
owners="$root/scripts/owners.txt"

mapfile -t mine < <(awk -v a="$agent" '$1==a {print $2}' "$owners")
mapfile -t shared < <(awk '$1=="shared" {print $2}' "$owners")
if [[ ${#mine[@]} -eq 0 ]]; then echo "unknown agent '$agent'"; exit 2; fi

files=$(
  {
    git -C "$root" diff --name-only "$(git -C "$root" merge-base "$base" "$head")" "$head"
    if [[ "$head" == "HEAD" ]]; then
      git -C "$root" diff --name-only HEAD
      git -C "$root" ls-files --others --exclude-standard
    fi
  } | sort -u
)

bad=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  ok=0
  for g in "${mine[@]}"; do [[ "$f" == $g ]] && ok=1 && break; done
  if [[ $ok -eq 0 ]]; then
    for g in "${shared[@]}"; do
      if [[ "$f" == $g ]]; then ok=1; echo "SHARED  $f  (edit only your own section)"; break; fi
    done
  fi
  if [[ $ok -eq 0 ]]; then echo "OUT OF SCOPE  $f"; bad=1; fi
done <<< "$files"

if [[ $bad -eq 1 ]]; then
  echo "FAIL: files outside agent '$agent' scope. Revert them (git restore / git rm) or ask the master." >&2
  exit 1
fi
echo "OK: all changes within '$agent' scope."
