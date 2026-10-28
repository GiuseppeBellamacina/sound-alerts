#!/usr/bin/env bash
# Plays one audio file on macOS or Linux and says so on one line: ok:played, or error:<why>.
# macOS has afplay; on Linux the first of paplay, pw-play, aplay, ffplay found is used.
set -u

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "error:no such file: $file"
  exit 0
fi

if [ "$(uname)" = "Darwin" ]; then
  if afplay "$file" > /dev/null 2>&1; then echo "ok:played"; else echo "error:afplay could not play it"; fi
  exit 0
fi

for player in paplay pw-play aplay ffplay; do
  command -v "$player" > /dev/null 2>&1 || continue
  case "$player" in
    ffplay) "$player" -nodisp -autoexit -loglevel quiet "$file" > /dev/null 2>&1 ;;
    *) "$player" "$file" > /dev/null 2>&1 ;;
  esac
  # A player that exists but fails (no sound server) leaves the next one a chance.
  if [ $? -eq 0 ]; then echo "ok:played"; exit 0; fi
done
echo "error:no working player (tried paplay, pw-play, aplay, ffplay)"
