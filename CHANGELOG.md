# Changelog

## 0.4.0

- **The permission sound plays only if the prompt is still waiting after 3 seconds** (`/alert permission <seconds>`, 0 for at once). Claude's auto mode answers an ask at once and the command ends within moments, so it no longer sounds; a prompt that waits for you does. The wait stops when the command ends. Questions and plans keep their immediate sound.

## 0.3.2

- `/alert log` now notes each question, plan and permission with the check's `approver`, even when the sound is muted. In Claude's auto mode the classifier answers the asks and the permission sound still plays: `/alert mute permission` stops it, and the log is there to tell the two cases apart.

## 0.3.1

- `task-done` and `agent-done` are muted at first, like `start` (they fire often during a long job). `/alert unmute task-done agent-done` brings them back. Settings you already saved are kept as they are: mute them with `/alert mute task-done agent-done`.

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
