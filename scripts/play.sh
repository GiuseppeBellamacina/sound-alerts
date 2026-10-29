#!/usr/bin/env bash
# Plays one .wav or .mp3 file on macOS or Linux and says so on one line: ok:played, or error:<why>.
# macOS has afplay; on Linux the first of paplay, pw-play, ffplay, mpv, mpg123, aplay that works is used
# (a player that cannot play the format, aplay with an mp3 for one, fails and leaves the next a chance).
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

play() {
  case "$1" in
    ffplay) ffplay -nodisp -autoexit -loglevel quiet "$file" > /dev/null 2>&1 ;;
    mpv) mpv --no-video --really-quiet "$file" > /dev/null 2>&1 ;;
    mpg123) mpg123 -q "$file" > /dev/null 2>&1 ;;
    *) "$1" "$file" > /dev/null 2>&1 ;;
  esac
}

for player in paplay pw-play ffplay mpv mpg123 aplay; do
  command -v "$player" > /dev/null 2>&1 || continue
  # A player that exists but fails (no sound server, a format it does not know) leaves the next one a chance.
  if play "$player"; then echo "ok:played"; exit 0; fi
done
echo "error:no working player (tried paplay, pw-play, ffplay, mpv, mpg123, aplay)"
