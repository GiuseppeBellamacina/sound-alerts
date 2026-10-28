# Changelog

## 0.3.0

- **`/alert remove <name>`**: deletes a preset of yours, after saying what goes (`/alert remove <name> yes` does it). The bundled presets stay. If the preset was in use, `soft` takes its place.

## 0.2.0

- **`/alert test [preset]`**: plays every sound of a preset one after the other, saying which one is playing, and lists them at the end (the ones the preset has no file for too).

## 0.1.0

The first version.

- Sixteen cases of sound: `done`, `question`, `permission`, `plan`, `task-done`, `agent-done`, `tests-pass`, `tests-fail`, `error`, `limit-warning`, `limit`, `context-full`, `start`, and `success`, `warning`, `attention` for Claude to use.
- Two bundled presets, `soft` and `retro`, and presets of your own: a folder of `.wav` files in `~/.claude/sound-alerts/presets/<name>/`.
- `/alert`: on and off, presets, `new`, `sounds`, `play`, `mute` and `unmute`, `claude on|off`, `log`.
- Claude's `play` tool, limited to the list, switchable off, never twice within two seconds.
- Windows, macOS (`afplay`) and Linux (`paplay`, `pw-play`, `aplay`, `ffplay`). macOS and Linux are tested against stand-ins for the players, not yet on real machines.
