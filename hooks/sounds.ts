export type System = 'windows' | 'macos' | 'linux'

export type Sound = {
  name: string
  /** What makes it play, in the words of `/alert sounds` and the README. */
  when: string
  /** Who plays it: the plugin on its own, or Claude through its tool as well. */
  by: 'plugin' | 'both' | 'claude'
}

/** Every case of sound. A preset is a folder with one `<name>.wav` for each it wants to play. */
export const SOUNDS: Sound[] = [
  { name: 'done', by: 'plugin', when: 'Claude finished its turn' },
  { name: 'question', by: 'plugin', when: 'Claude asks you a question (AskUserQuestion)' },
  { name: 'permission', by: 'plugin', when: 'a permission prompt waits for you' },
  { name: 'plan', by: 'plugin', when: 'a plan waits for your approval' },
  { name: 'task-done', by: 'plugin', when: 'a background task finished (muted at first)' },
  { name: 'agent-done', by: 'plugin', when: 'a subagent finished (muted at first)' },
  { name: 'tests-pass', by: 'both', when: 'a test command exited 0, or Claude says the tests passed' },
  { name: 'tests-fail', by: 'both', when: 'a test command failed, or Claude says so' },
  { name: 'error', by: 'plugin', when: 'a turn ended on an error (API error, retries run out, context limit)' },
  { name: 'limit-5h', by: 'plugin', when: 'the 5-hour usage limit passed 75%' },
  { name: 'limit-week', by: 'plugin', when: 'the 7-day usage limit passed 75%' },
  { name: 'limit', by: 'plugin', when: 'a usage limit is used up (100%)' },
  { name: 'context-full', by: 'plugin', when: 'the context window passed 90%' },
  { name: 'start', by: 'plugin', when: 'a session starts (muted at first)' },
  { name: 'success', by: 'claude', when: 'Claude says something it did worked' },
  { name: 'warning', by: 'claude', when: 'Claude says something needs a look' },
  { name: 'attention', by: 'claude', when: 'Claude needs you now' },
]

export const NAMES = SOUNDS.map(s => s.name)
export const isSound = (name: string) => NAMES.includes(name)

export type AlertSettings = {
  enabled: boolean
  preset: string
  /** Sounds that stay silent. */
  muted: string[]
  /** Whether Claude may play sounds itself, with its tool. */
  claude: boolean
  /** Show a small notice with what played: `meme: success-02.mp3 played`. */
  notice: boolean
}

export const DEFAULTS: AlertSettings = { enabled: true, preset: 'soft', muted: ['start', 'task-done', 'agent-done'], claude: true, notice: true }

/** A preset name is a folder name: letters, digits, dash and underscore, so no path can come out of it. */
export const isPresetName = (name: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(name)

/** Reads what the store gave back, keeping only what is valid. */
export function readSettings(stored: unknown): AlertSettings {
  const s = stored && typeof stored === 'object' ? (stored as Partial<AlertSettings>) : {}
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULTS.enabled,
    preset: typeof s.preset === 'string' && isPresetName(s.preset) ? s.preset : DEFAULTS.preset,
    muted: Array.isArray(s.muted) ? s.muted.filter((x): x is string => typeof x === 'string' && isSound(x)) : DEFAULTS.muted,
    claude: typeof s.claude === 'boolean' ? s.claude : DEFAULTS.claude,
    notice: typeof s.notice === 'boolean' ? s.notice : DEFAULTS.notice,
  }
}

/** Where a command starts: the beginning of a line, after `;` `&` `|` `(`, or after a runner that wraps it (`npx`, `uv run`). */
const COMMAND_START = '(?:^|[;&|(\\n]\\s*|\\b(?:npx|bunx|dlx|exec|run|python3?\\s+-m|uv\\s+run|poetry\\s+run)\\s+(?:-{1,2}[\\w=.-]+\\s+)*)'

/** A command that runs a project's tests, named where the command starts: not `npm install jest`, not `echo pytest`. */
const RUNNERS = [
  'py\\.?test|pytest|unittest|tox|nox|vitest|jest|mocha|ava|karma|rspec|phpunit|ctest|bats|pester|invoke-pester',
  '(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:test|t)',
  'bun\\s+test|deno\\s+test',
  'go\\s+test|dotnet\\s+test|cargo\\s+(?:test|nextest)',
  '(?:\\./)?(?:mvn|mvnw|gradle|gradlew)\\b[^|;&\\n]*\\s(?:test|check)',
  'make\\s+(?:test|check)',
  'playwright\\s+(?:test|run)|cypress\\s+run',
  'claude\\s+plugin\\s+test',
].map(runner => new RegExp(COMMAND_START + '(?:' + runner + ')\\b'))

/** A command that only talks about tests (a commit message, a search) is not a test run. */
const TALKS = /^\s*(?:git|gh|echo|grep|rg|cat|ls|type|findstr|select-string|write-output|write-host)\b/i

/** What a command runs, without the text it carries: a heredoc body and what is in quotes are data (a script that edits a README says "npm test"). */
const withoutText = (command: string) =>
  command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$)/g, ' ')
    .replace(/"[^"\n]*"|'[^'\n]*'/g, '""')

// shortcut: a runner named only inside quotes (bash -c "pytest") is not seen; Claude can say tests-pass itself.
export function isTestCommand(command: string): boolean {
  if (TALKS.test(command)) return false
  const run = withoutText(command).toLowerCase()
  return RUNNERS.some(r => r.test(run))
}

/** A pipe, `||`, `;` or a new line: the exit status of the whole is the last command's, not the test's. */
const MASKED = /\|\||\||;|\n/

/** Failure lines a runner prints, whatever its exit status says: "3 failed", "FAILED test_x", jest's "FAIL file". */
const FAILED = [/\b[1-9]\d* (?:failed|failing|errors?)\b/i, /\bFAILED\b|^FAIL\b|\bFAILURES\b|failures=[1-9]|^not ok\b/m]
/** A summary that passed: "5 passed", jest's "PASS file". */
const PASSED = [/\b[1-9]\d* passed\b/, /^PASS\b/m]

/**
 * Whether a test run passed or failed, or cannot be told. A failure in the output wins over the exit status, since a
 * pipe hides the test's. Behind a pipe with no failure, only a passing summary counts; a clean run with no mask is a pass.
 */
export function testOutcome(command: string, output: string, isError: boolean): 'pass' | 'fail' | undefined {
  if (isError || FAILED.some(r => r.test(output))) return 'fail'
  if (!MASKED.test(withoutText(command))) return 'pass'
  return PASSED.some(r => r.test(output)) ? 'pass' : undefined
}

/** The audio formats a preset may hold. */
export const FORMATS = ['wav', 'mp3']

/**
 * The files of one sound among the names in a preset's folder: `success.wav`, `success.mp3`, and variants
 * `success-01.mp3`, `success-2.wav`... (a dash and digits before the dot). Another sound's file never matches
 * (`limit-5h.wav` is not a variant of `limit`).
 */
export function variantsOf(names: string[], sound: string): string[] {
  const own = new RegExp('^' + sound + '(-[0-9]+)?[.](' + FORMATS.join('|') + ')$', 'i')
  return names.filter(n => own.test(n)).sort()
}

/** One of the files, at random and not the one that played last when there is another. */
export function pickVariant(files: string[], last?: string, random: () => number = Math.random): string | undefined {
  const pool = files.length > 1 ? files.filter(f => f !== last) : files
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}

export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

/** One window in one period: its kind and when it resets, in epoch seconds (the measure says it in ISO, the transcript in seconds). */
export const windowKey = (kind: string, resetsAt: string | number | undefined): string => {
  const ms = typeof resetsAt === 'number' ? resetsAt * 1000 : Date.parse(resetsAt ?? '')
  return `${kind}|${Number.isNaN(ms) ? (resetsAt ?? '') : Math.round(ms / 1000)}`
}

/** What a transcript's last reply says of the limit (limit.ps1 / limit.sh): `five_hour|1792619400`, or none. */
export function parseLimitRow(line: string): string | undefined {
  const m = /ok:([A-Za-z_]+)[|]([0-9]+)/.exec(line)
  return m ? windowKey(m[1]!, Number(m[2])) : undefined
}

/** From where on a usage window is said to be running out. Anthropic documents no number ("Approaching 5-hour limit"): 75 is the one the third-party sources give. */
export const WARN_AT = 75

/** The sound of a window running out: the 5-hour one, the 7-day one; none for any other (a spend limit has only its 100). */
const warning = (kind: string) => (kind === 'five_hour' ? 'limit-5h' : kind.startsWith('seven_day') ? 'limit-week' : '')

/**
 * The limit sound a measurement calls for: at most one, however many things were crossed together.
 *
 * A window used up (`limit`) comes before a window running out; of two windows running out the one further along speaks
 * (the week on a tie), and the other counts as said. Each is said once for each time its window resets. The context window
 * past 90% comes last, and waits for a measure with nothing else to say; it is said again only after it fell under 70%
 * (a compaction). `fired` is what was already said, and comes back changed.
 */
export function limitSounds(fired: Set<string>, rateLimits: RateLimit[], contextPercent: number | undefined): string[] {
  const picks: { sound: string; marks: string[]; rank: number; percent: number }[] = []
  for (const w of rateLimits) {
    const at = windowKey(w.kind, w.resetsAt)
    if (w.percentUsed >= 100 && !fired.has(`${at}|100`)) {
      // Both levels are marked: reaching 100 at once does not play the warning after the limit.
      picks.push({ sound: 'limit', marks: [`${at}|100`, `${at}|${WARN_AT}`], rank: 0, percent: w.percentUsed })
    } else if (w.percentUsed >= WARN_AT && w.percentUsed < 100 && warning(w.kind) && !fired.has(`${at}|${WARN_AT}`)) {
      picks.push({ sound: warning(w.kind), marks: [`${at}|${WARN_AT}`], rank: 1, percent: w.percentUsed })
    }
  }
  picks.sort((x, y) => x.rank - y.rank || y.percent - x.percent || (y.sound === 'limit-week' ? 1 : -1))
  for (const pick of picks) for (const mark of pick.marks) fired.add(mark)

  const out: string[] = picks.length ? [picks[0]!.sound] : []
  if (contextPercent !== undefined) {
    if (contextPercent >= 90 && !fired.has('context') && out.length === 0) {
      fired.add('context')
      out.push('context-full')
    } else if (contextPercent < 70) fired.delete('context')
  }
  return out
}

/** The command line that reads the permission mode a transcript last recorded: a script of ours, one argument. */
export function limitArgv(system: System, root: string, file: string): string[] {
  return system === 'windows'
    ? ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${root}/scripts/limit.ps1`, '-Path', file]
    : ['bash', `${root}/scripts/limit.sh`, file]
}

export function modeArgv(system: System, root: string, file: string): string[] {
  return system === 'windows'
    ? ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${root}/scripts/mode.ps1`, '-Path', file]
    : ['bash', `${root}/scripts/mode.sh`, file]
}

/** The command line that plays one file: a script of ours, one argument, no shell. */
export function playerArgv(system: System, root: string, file: string): string[] {
  return system === 'windows'
    ? ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${root}/scripts/play.ps1`, '-Path', file]
    : ['bash', `${root}/scripts/play.sh`, file]
}
