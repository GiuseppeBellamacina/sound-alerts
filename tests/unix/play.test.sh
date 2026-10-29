#!/usr/bin/env bash
# Tries scripts/play.sh against stand-ins for the system's players: each records its name and arguments.
# Whether a real player makes a sound is for a real machine to say.
# Runs anywhere with bash:  bash tests/unix/play.test.sh
# shellcheck disable=SC2016  # the stand-ins are written in single quotes on purpose
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
STUBS=$WORK/bin
mkdir -p "$STUBS"
export STUB_LOG=$WORK/calls.log
passed=0
failed=0
SAFE_PATH="/usr/bin:/bin"

stub() { printf '#!/bin/sh\n{ printf "%%s" "$(basename "$0")"; for a in "$@"; do printf " [%%s]" "$a"; done; echo; } >> "$STUB_LOG"\n%s\n' "$2" > "$STUBS/$1"; chmod +x "$STUBS/$1"; }
check() { if [ "$2" = "$3" ]; then passed=$((passed + 1)); else failed=$((failed + 1)); printf 'FAIL %s\n   want: %s\n   got:  %s\n' "$1" "$3" "$2"; fi; }
run() { : > "$STUB_LOG"; PATH="$STUBS:$SAFE_PATH" bash "$ROOT/scripts/play.sh" "$@"; }
calls() { tr '\n' ';' < "$STUB_LOG"; }

SOUND=$WORK/done.wav
cp "$ROOT/presets/soft/done.wav" "$SOUND"

check 'no argument' "$(run)" 'error:no such file: '
check 'a file that is not there' "$(run "$WORK/none.wav")" "error:no such file: $WORK/none.wav"

# macOS: afplay, and only afplay.
stub uname 'echo Darwin'
stub afplay ':'
stub paplay ':'
check 'macOS says played' "$(run "$SOUND")" 'ok:played'
check 'macOS uses afplay with the file' "$(calls)" "uname;afplay [$SOUND];"
stub afplay 'exit 1'
check 'macOS says why when afplay fails' "$(run "$SOUND")" 'error:afplay could not play it'

# Linux: the first player found, in order.
stub uname 'echo Linux'
rm -f "$STUBS/afplay"
check 'Linux uses paplay first' "$(run "$SOUND")" 'ok:played'
check 'and only it' "$(calls)" "uname;paplay [$SOUND];"
stub paplay 'exit 1'
stub aplay ':'
check 'a player that fails leaves the next one a chance' "$(run "$SOUND")" 'ok:played'
check 'paplay was tried, then aplay' "$(calls)" "uname;paplay [$SOUND];aplay [$SOUND];"
rm -f "$STUBS/paplay" "$STUBS/aplay"
stub ffplay ':'
check 'ffplay works' "$(run "$SOUND")" 'ok:played'
check 'ffplay arguments' "$(calls)" "uname;ffplay [-nodisp] [-autoexit] [-loglevel] [quiet] [$SOUND];"
rm -f "$STUBS/ffplay"
check 'no player at all says so' "$(run "$SOUND")" 'error:no working player (tried paplay, pw-play, ffplay, mpv, mpg123, aplay)'
# An mp3: the players that cannot play it fail, the next one gets its chance.
cp "$SOUND" "$WORK/clip.mp3"
stub paplay 'exit 1'
stub aplay 'exit 1'
stub mpg123 ':'
check 'an mp3 reaches the first player that can play it' "$(run "$WORK/clip.mp3")" 'ok:played'
check 'in the order paplay, aplay, mpg123' "$(calls)" "uname;paplay [$WORK/clip.mp3];mpg123 [-q] [$WORK/clip.mp3];"
rm -f "$STUBS/paplay" "$STUBS/aplay" "$STUBS/mpg123"
stub mpv ':'
check 'mpv works' "$(run "$WORK/clip.mp3")" 'ok:played'
check 'mpv arguments' "$(calls)" "uname;mpv [--no-video] [--really-quiet] [$WORK/clip.mp3];"
rm -f "$STUBS/mpv"
stub aplay 'exit 1'
check 'only players that fail: none worked' "$(run "$WORK/clip.mp3")" 'error:no working player (tried paplay, pw-play, ffplay, mpv, mpg123, aplay)'
rm -f "$STUBS/aplay"

# A path with spaces reaches the player whole.
mkdir -p "$WORK/a folder"
cp "$SOUND" "$WORK/a folder/my sound.wav"
stub uname 'echo Darwin'
stub afplay ':'
check 'spaces' "$(run "$WORK/a folder/my sound.wav")" 'ok:played'
check 'one argument' "$(calls)" "uname;afplay [$WORK/a folder/my sound.wav];"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
