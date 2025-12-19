#!/usr/bin/env bash
set -euo pipefail

printf "Ready>\n"
while IFS= read -r line; do
  if [[ "$line" == "quit" ]]; then
    printf "Bye\n"
    exit 0
  fi
  printf "Echo: %s\n" "$line"
done
