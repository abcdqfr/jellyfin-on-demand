#!/usr/bin/env bash
set -u

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
shopt -s nullglob

for script in "$root"/scripts/offline_*; do
  case "$script" in
    *.mjs) command=(node "$script") ;;
    *.py) command=(python3 "$script") ;;
    *) continue ;;
  esac

  if "${command[@]}"; then
    printf 'PASS: %s\n' "${script#"$root"/}"
  else
    printf 'FAIL: %s\n' "${script#"$root"/}" >&2
    exit 1
  fi
done
