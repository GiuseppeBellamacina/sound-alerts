# sound-alerts

Notification sounds for [Claude Code](https://code.claude.com). You hear it when Claude is done, when it asks you something, when it needs a permission, when your tests pass or fail, and when you are running out of usage or context. Claude can also play a sound itself to mark something the plugin cannot see.

It plays sounds and nothing else: no network, no notification windows, no files read except the sounds you chose.

- Two presets come with it: **soft** (warm bell tones) and **retro** (8-bit blips).
- A preset of your own is a folder of `.wav` or `.mp3` files named like the ones below. Make a folder called `pippo`, put sounds in it, `/alert preset pippo`. Give a sound several files and one is picked at random each time.
- Windows is the system it was built and tried on. macOS and Linux are written and tested against stand-ins for the system's players, not yet on real machines.

## Install

```text
/plugin marketplace add GiuseppeBellamacina/sound-alerts
/plugin install sound-alerts@sound-alerts
```

Where `/plugin` is not available (the VS Code extension), use a terminal:

```bash
claude plugin marketplace add GiuseppeBellamacina/sound-alerts
claude plugin install sound-alerts@sound-alerts
```

Then `/reload-plugins` (or start a new session). Try it: `/alert play done`.

## When a sound plays

| Sound | When | Who plays it |
| --- | --- | --- |
| `done` | Claude finished its turn (not when you interrupt it) | the plugin |
| `question` | Claude asks you a question (`AskUserQuestion`) | the plugin |
| `permission` | a permission prompt waits for you; **silent in Claude's auto mode**, where the classifier answers (the mode is read from the session's transcript) | the plugin |
| `plan` | a plan waits for your approval | the plugin |
| `task-done` | a background task finished (**muted** at first: `/alert unmute task-done`) | the plugin |
| `agent-done` | a subagent finished (**muted** at first: `/alert unmute agent-done`) | the plugin |
| `tests-pass` | a test command exited 0 (`pytest`, `npm test`, `go test`, `cargo test`, `dotnet test`, `make test`, `claude plugin test`, and the like), or Claude says so | the plugin and Claude |
| `tests-fail` | a test command failed, or Claude says so | the plugin and Claude |
| `error` | a turn ended on an error: an API error, retries run out, the context limit | the plugin |
| `limit-5h` | the 5-hour usage limit passed 75% | the plugin |
| `limit-week` | the 7-day usage limit passed 75% | the plugin |
| `limit` | a usage limit is used up (100%) | the plugin |
| `context-full` | the context window passed 90% | the plugin |
| `start` | a session starts (**muted** at first: `/alert unmute start`) | the plugin |
| `success` | Claude says something it did worked | Claude |
| `warning` | Claude says something needs a look | Claude |
| `attention` | Claude needs you now | Claude |

Notes:

- A test run is told by the program's name at the start of the command (or after `&&`, `;`, `npx`, `run`), never by the word "test": `git commit -m "add pytest"` plays nothing, and neither does `npm install jest`. Pass or fail is the command's exit code, and the output of the run wins over it: a line like `3 failed` or `FAILED test_x` plays `tests-fail` even if the exit status says 0. A pipe, `||`, `;` or a new line after the test hides the exit status (`pytest | tail` is tail's), so there a passing summary plays `tests-pass` and anything else plays nothing: run the tests without the pipe to hear the result. A test sent to the background plays `task-done` when it ends, not before.
- Each limit sounds once for each level, and again after it resets. The context sound comes again only after the context was emptied (a compaction).
- The same sound does not repeat within a second and a half: five subagents ending together play `agent-done` once.
- `limit-5h`, `limit-week`, `limit` and `context-full` depend on what your account reports: off a subscription, the limit sounds never play. The 75% is a number I took from third-party sources: Anthropic's own pages say "approaching the limit" without one. When several things are crossed together only one sound plays: a window used up first, then the window further along (the week on a tie), then the context; the other windows count as said, and the context waits for the next measure. A limit sounds when the turn that crossed it ends, a moment after `done` so that they do not overlap, and once for each time its window resets. If a limit is already past 75% when you open a session, it is said once, at the first prompt.

## Presets

A preset is a folder: for each case it wants to play, a `<sound>.wav` or `<sound>.mp3`, named as in the table. A sound with no file stays silent, so a preset can be as small as one file.

**Several files for one sound.** `success.mp3`, or `success-01.mp3`, `success-02.wav`, `success-03.mp3`: a dash and digits before the extension, wav and mp3 mixed as you like. Each time the sound plays, one of its files is picked at random, never the one that just played. `success-final.mp3` is not a variant (the part after the dash must be digits), and `limit-5h.wav` belongs to `limit-5h`, not to `limit`.

**Make your own.**

```text
/alert new pippo
```

makes `~/.claude/sound-alerts/presets/pippo/` (on Windows `C:\Users\<you>\.claude\sound-alerts\presets\pippo\`) with a `README.txt` listing the file names. Put `.wav` or `.mp3` files in it, then:

```text
/alert preset pippo
/alert sounds          which sounds the preset has
/alert play done       hear one
```

Your folder lives outside the plugin's own folder on purpose: the plugin's folder (inside `~/.claude/plugins/`) is replaced when the plugin is updated, and anything you put there is lost. Putting a preset there by hand works until the next update.

A folder of yours with the name of a bundled preset (`soft`, `retro`) replaces only the files it has: add a `done.mp3` to your own `soft/` and `done` plays that instead of the bundled files for it (all of them: a sound of yours replaces that sound as a whole), while every other sound stays as it was.

**Formats.** `.wav` and `.mp3`, on every system. On Windows an `.mp3` goes through the system's media player and a `.wav` through its sound player; macOS has `afplay`; on Linux an mp3 needs a player that knows it (`ffplay`, `mpv`, `mpg123`, or `paplay`/`pw-play` with a recent libsndfile): `aplay` plays wav only. Keep them short: a sound plays to its end (an mp3 for at most 30 seconds on Windows).

## Commands

| Command | What it does |
| --- | --- |
| `/alert` | How it is set: on or off, the preset, what is muted. |
| `/alert on` · `off` | The master switch. |
| `/alert presets` | The presets you can use (`*` marks the one in use). |
| `/alert preset <name>` | Use a preset. |
| `/alert new <name>` | Makes the folder for a preset of yours and says where it is. |
| `/alert remove <name>` | Deletes a preset of yours: it says what goes first, and `/alert remove <name> yes` does it. The bundled presets cannot be removed; for one you added files to, only your files go. |
| `/alert sounds` | Every case of sound: on or muted, and whether the preset has its file. |
| `/alert play <sound>` | Plays one now, even if it is muted. |
| `/alert test [preset]` | Plays every file of the seventeen sounds one after the other, variants too, muted ones too, saying which file is playing (status line and a notice) and listing them at the end. Takes about half a minute. |
| `/alert mute <sound>...` · `unmute <sound>...` · `unmute all` | Silences some sounds. `start` is muted at first. |
| `/alert notice on` · `notice off` | The small notice that shows for a moment when a sound plays, with the preset and the file (`meme: success-02.mp3 played`). On by default; not shown for a muted sound. |
| `/alert claude on` · `off` | Whether Claude may play sounds itself. |
| `/alert log` | The last things the plugin saw. Read it when a sound does not play. |

## What Claude can do

Claude has one tool, `play`, with a sound from the list above (never `start`). Its description tells Claude to use it only for what the plugin cannot see: `tests-pass` or `tests-fail` after tests it ran in a way the plugin did not notice (a script, a watch on CI), `success` after a long job you asked for, `warning` and `attention`. It must not repeat what the plugin does by itself, and it cannot play twice within two seconds. It cannot play anything outside the list, choose a file or run a command. `/alert claude off` takes it away.

## Safety

- The player is one of two short scripts of the plugin (`scripts/play.ps1`, `scripts/play.sh`), started with the file as its only argument. No shell line is ever built.
- A preset name is a folder name (letters, digits, `-`, `_`): no path can come out of it. A sound name is one of the seventeen above.
- No network and no writes, except `/alert new`, which writes one `README.txt` in the folder it makes.
- Only the plugin hooks of the Claude Code mod API, never `classic.*`: some security setups skip those hooks without a word.

## When a sound does not play

1. `/alert` says whether it is on, which preset, what is muted.
2. `/alert sounds` says whether the preset has a file for it (`(no file)`).
3. `/alert play done` plays by hand and says why not (`/alert log` keeps the answer of the player).
4. Windows plays `.wav` and `.mp3`. Linux needs one of `paplay`, `pw-play`, `ffplay`, `mpv`, `mpg123`, `aplay` (the last for wav only). macOS has `afplay`.
5. Over SSH or in a container there is no sound card: nothing can play there.

## Develop

```bash
git clone https://github.com/GiuseppeBellamacina/sound-alerts
claude plugin validate ./sound-alerts
claude plugin test ./sound-alerts
python sound-alerts/tests/presets.test.py          # the bundled presets are complete and valid
python sound-alerts/tools/make-sounds.py           # writes the bundled presets again
claude --plugin-dir ./sound-alerts                 # try it in a session
```

See [CONTRIBUTING.md](CONTRIBUTING.md). The bundled sounds are synthesized by `tools/make-sounds.py`, so they carry no third-party licence.

## License

[MIT](LICENSE)
