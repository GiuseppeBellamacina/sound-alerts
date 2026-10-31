# Contributing

## Layout

- `hooks/register.tsx`: the hooks module: the events, the `/alert` command, Claude's `play` tool, and the runner that calls the player.
- `hooks/sounds.ts`: pure functions: the cases of sound, the settings, how a test command is told, when a limit sounds, the player's command line. No engine in it, so it is tested alone.
- `scripts/play.ps1`: the Windows player (`System.Media.SoundPlayer`). One line out, `ok:played` or `error:<why>`.
- `scripts/mode.ps1`, `scripts/mode.sh`: read the permission mode a session transcript last recorded (the engine tells a plugin none): `ok:<mode>`, `ok:` or `error:<why>`.
- `scripts/limit.ps1`, `scripts/limit.sh`: read whether the last reply of a transcript was a usage limit that rejected the request (`ok:<window>|<resets at, epoch seconds>`, `ok:` or `error:<why>`): what tells a limit from an error at the end of a turn.
- `scripts/play.sh`: the macOS and Linux player (`afplay`, else the first of `paplay`, `pw-play`, `aplay`, `ffplay`), the same contract.
- `presets/<name>/<sound>.wav`: the bundled presets, written by `tools/make-sounds.py`. A user's preset may hold `.mp3` too and several files for a sound (`success-01.mp3`): `variantsOf` and `pickVariant` in `hooks/sounds.ts` find and choose them.
- `tests/sounds.test.ts` (the rules) and `tests/hooks.test.tsx` (the events, with a mock engine).
- `tests/windows/play.test.ps1`, `tests/unix/play.test.sh` (the players, the second against stand-ins) and `tests/presets.test.py` (the bundled presets are complete and valid).

## Ground rules

- **Only the plugin hooks of the mod API, never `classic.*`.** Some security setups (for example `cc-plugin-sec-default`) skip the classic hooks without a word. `grep -rn "classic\." hooks/` must print nothing.
- **A plugin name cannot start with `claude-`** and some command names are Claude Code's own: `claude plugin validate` says so, and CI fails on it.
- **No shell.** The player gets one argument. Sound and preset names are checked against a list and a pattern before they become part of a path.
- **Never block a hook.** A hook that waits delays Claude's permission prompt. Sounds start from `later()` (a timer).
- **A new case of sound** goes in `SOUNDS` in `hooks/sounds.ts`, in `tools/make-sounds.py` (then run it), in the README table and in `tests/`. `tests/presets.test.py` fails while a preset lacks a file.
- **The engine says nothing when you answer a permission**, and a test command's result is `isError` on the call: do not look for an exit code in the text.

## Develop

```bash
claude plugin validate .
claude plugin test .
python tests/presets.test.py
bash tests/unix/play.test.sh
claude --plugin-dir .          # try it in a session
```

Changes go in a pull request that closes an issue; CI runs on Windows, Ubuntu and macOS.
