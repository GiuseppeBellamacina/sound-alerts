#!/usr/bin/env bash
# Tries scripts/mode.sh on made-up transcripts: the last mode recorded wins, nothing recorded says so, a missing file is an error.
# Runs anywhere with bash:  bash tests/unix/mode.test.sh
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
passed=0
failed=0

check() { if [ "$2" = "$3" ]; then passed=$((passed + 1)); else failed=$((failed + 1)); printf 'FAIL %s\n   want: %s\n   got:  %s\n' "$1" "$3" "$2"; fi; }
row() { printf '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"%s"}]},"permissionMode":"%s","origin":{"kind":"human"}}\n' "$2" "$1"; }
run() { bash "$ROOT/scripts/mode.sh" "$@"; }

{ row default ciao; row auto "à è ì ò ù"; echo '{"type":"assistant"}'; } > "$WORK/one.jsonl"
check 'the last mode recorded wins' "$(run "$WORK/one.jsonl")" 'ok:auto'

{ row auto a; row acceptEdits b; } > "$WORK/two.jsonl"
check 'another mode' "$(run "$WORK/two.jsonl")" 'ok:acceptEdits'

printf '%s\n' '{"type":"assistant"}' '{"type":"system"}' > "$WORK/none.jsonl"
check 'no mode recorded' "$(run "$WORK/none.jsonl")" 'ok:'

check 'a file that is not there' "$(run "$WORK/missing.jsonl")" 'error:no such file'
check 'no argument' "$(run)" 'error:no such file'

# Only the last 6 MB are read: a mode further back is not seen, one inside the tail is.
{ row auto old; head -c 7000000 /dev/zero | tr '\0' 'x'; echo; } > "$WORK/big.jsonl"
check 'a mode beyond the tail is not seen' "$(run "$WORK/big.jsonl")" 'ok:'
row default new >> "$WORK/big.jsonl"
check 'a mode inside the tail is' "$(run "$WORK/big.jsonl")" 'ok:default'

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
