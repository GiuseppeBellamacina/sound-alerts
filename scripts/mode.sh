#!/usr/bin/env bash
# Reads the permission mode a session transcript last recorded (default, auto, acceptEdits, plan, ...) and says so on one line:
# ok:<mode>, ok: when none is recorded in the tail, or error:<why>. Reads the last 6 MB of the file; writes nothing.
set -u

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "error:no such file"
  exit 0
fi

mode=$(tail -c 6000000 "$file" | grep -ao '"permissionMode":"[A-Za-z]*"' | tail -n 1 | sed 's/.*:"\(.*\)"/\1/')
echo "ok:$mode"
