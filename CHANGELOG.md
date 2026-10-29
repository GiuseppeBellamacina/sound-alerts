# Changelog

## 0.7.0

- **The wait of `/alert permission` is gone**: the mode is read from the transcript, so the permission sound plays at once, and not at all in auto mode. The reading is kept for the prompt it was made on.
- **One limit sound at a time.** When several limits are crossed together (the 5-hour and the weekly window past 75%, a window used up with a warning, the context on top), one sound plays: a window used up, else the window further along (the week on a tie), else the context. The other windows count as said; the context waits for the next measure.

## 0.6.0

- **No permission sound in Claude's auto mode.** A plugin is told no permission mode, but the session's transcript records it on each prompt: when the permission sound is about to play, a small script (`scripts/mode.ps1`, `scripts/mode.sh`) reads the last 6 MB of the transcript for the last `permissionMode`, and `auto` stays silent. The 3-second wait of 0.4.0 stays as it was for the other modes, and is what is left when the mode cannot be read (a new session with no prompt yet). `/alert log` says which mode it saw.

## 0.5.1

- **Fixed**: a command that only *contains* the name of a test runner played `tests-pass`: a script that edits a README with `python - <<'EOF'`, a `sed` that changes a line saying `npm test`. A heredoc body and what is in quotes are now ignored when looking for a test run (a runner named only inside quotes, like `bash -c "pytest"`, is not seen: Claude can say it with `tests-pass`).

## 0.5.0

- **Limit sounds**: `limit-warning` is gone. `limit-5h` and `limit-week` play when the 5-hour or the 7-day window passes **75%**, and `limit` when any window is used up. A preset of yours with a `limit-warning.wav` should rename it to `limit-5h.wav` (and add `limit-week.wav`).
- A limit sound comes a moment after `done` instead of on top of it, once for each time the window resets. A limit already past its threshold when the session starts is said once, at the first prompt.
- Seventeen cases of sound now (the bundled presets have all of them).

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
