#!/usr/bin/env bash
# Reads what the last reply of a session transcript was: a usage limit that rejected the request, or anything else. Says so on one line:
# ok:<window>|<resetsAt as epoch seconds> for a limit (the window is five_hour, seven_day, ...), ok: for any other last reply, or
# error:<why>. Reads the last 1 MB of the file; writes nothing.
set -u

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "error:no such file"
  exit 0
fi

last=$(tail -c 1000000 "$file" | grep -a '"type":"assistant"' | tail -n 1)
case "$last" in
  *'"error":"rate_limit"'*)
    kind=$(printf '%s' "$last" | grep -ao '"rateLimitType":"[A-Za-z_]*"' | head -n 1 | sed 's/.*:"\(.*\)"/\1/')
    reset=$(printf '%s' "$last" | grep -ao '"resetsAt":[0-9]*' | head -n 1 | sed 's/.*://')
    if [ -n "$kind" ] && [ -n "$reset" ]; then echo "ok:$kind|$reset"; else echo "ok:"; fi
    ;;
  *) echo "ok:" ;;
esac
