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
  /** Seconds a permission prompt must have waited before its sound plays (0: at once). Auto mode answers at once and never gets there. */
  permissionAfter: number
}

export const DEFAULTS: AlertSettings = { enabled: true, preset: 'soft', muted: ['start', 'task-done', 'agent-done'], claude: true, permissionAfter: 3 }

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
    permissionAfter: typeof s.permissionAfter === 'number' && s.permissionAfter >= 0 && s.permissionAfter <= 60 ? s.permissionAfter : DEFAULTS.permissionAfter,
  }
}

/** A command that runs a project's tests. Looked for by the program's name, never by the word "test" alone. */
const BARE = 'py\\.?test|pytest|unittest|tox|nox|vitest|jest|mocha|ava|karma|rspec|phpunit|ctest|bats|pester|invoke-pester'
// A program that runs tests counts as the word a command starts with: not `npm install jest`.
const AS_COMMAND = `(?:^|[;&|(]\\s*|\\b(?:npx|bunx|dlx|exec|run|python3?\\s+-m)\\s+(?:-{1,2}[\\w=.-]+\\s+)*)(?:${BARE})\\b`

const RUNNERS = [
  new RegExp(AS_COMMAND),
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|t)\b/,
  /\b(?:bun|deno)\s+test\b/,
  /\b(?:go|dotnet|cargo)\s+(?:test|nextest)\b/,
  /\b(?:mvn|mvnw|gradle|gradlew)\b[^|;&\n]*\s(?:test|check)\b/,
  /\bmake\s+(?:test|check)\b/,
  /\b(?:playwright|cypress)\s+(?:test|run)\b/,
  /\bclaude\s+plugin\s+test\b/,
]

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

export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

/** From where on a usage window is said to be running out. Anthropic documents no number ("Approaching 5-hour limit"): 75 is the one the third-party sources give. */
export const WARN_AT = 75

/** The sound of a window running out: the 5-hour one, the 7-day one; none for any other (a spend limit has only its 100). */
const warning = (kind: string) => (kind === 'five_hour' ? 'limit-5h' : kind.startsWith('seven_day') ? 'limit-week' : '')

/**
 * Which limit sounds a measurement calls for, each once: a window past 75% (the 5-hour and the 7-day each have theirs) and
 * a window used up, once for each time it resets; the context window past 90%, again only after it fell under 70% (a compaction).
 * `fired` is what was already said, and comes back changed.
 */
export function limitSounds(fired: Set<string>, rateLimits: RateLimit[], contextPercent: number | undefined): string[] {
  const out: string[] = []
  for (const w of rateLimits) {
    const at = `${w.kind}|${w.resetsAt ?? ''}`
    for (const [level, sound] of [[100, 'limit'], [WARN_AT, warning(w.kind)]] as const) {
      if (sound && w.percentUsed >= level && !fired.has(`${at}|${level}`)) {
        fired.add(`${at}|${level}`)
        // Both levels are marked: reaching 100 at once does not play the warning after the limit.
        if (level === 100) fired.add(`${at}|${WARN_AT}`)
        out.push(sound)
        break
      }
    }
  }
  if (contextPercent !== undefined) {
    if (contextPercent >= 90 && !fired.has('context')) {
      fired.add('context')
      out.push('context-full')
    } else if (contextPercent < 70) fired.delete('context')
  }
  return out
}

/** The command line that plays one file: a script of ours, one argument, no shell. */
export function playerArgv(system: System, root: string, file: string): string[] {
  return system === 'windows'
    ? ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${root}/scripts/play.ps1`, '-Path', file]
    : ['bash', `${root}/scripts/play.sh`, file]
}
