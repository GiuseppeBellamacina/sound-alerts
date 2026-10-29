import type { EngineInterface, Register } from 'claude-code'

import { DEFAULTS, NAMES, SOUNDS, isPresetName, isSound, isTestCommand, limitSounds, playerArgv, readSettings } from './sounds'
import type { AlertSettings, System } from './sounds'

// The guidance lives in the tool's description: it reaches the model whatever other plugins do to the prompt.
const TOOL_SPEC = {
  name: 'play',
  description: `Plays a short notification sound for the user, chosen from the preset they use. The plugin already plays sounds by itself when you finish, ask a question, need a permission, finish a background task or a subagent, run out of context or hit a usage limit: do not repeat those. Use this tool only to mark what the plugin cannot see: "tests-pass" or "tests-fail" after you ran the project's tests in a way the plugin may not have noticed (a script, a CI watch), "success" when a long job you were asked for worked, "warning" when something needs a look, "attention" when you need the user now. Never for routine replies, and at most once for the same thing.`,
  inputSchema: {
    type: 'object',
    properties: {
      sound: { type: 'string', enum: NAMES.filter(n => n !== 'start'), description: 'The case to play.' },
    },
    required: ['sound'],
  },
  isDeferred: false,
}

let toolName = ''
let queue: Promise<unknown> = Promise.resolve()
const fired = new Set<string>()
const lastAt = new Map<string, number>()
let lastByClaude = 0
let testing = false

const home = async ($: EngineInterface) => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'
/** Where the user's own presets live: outside the plugin's folder, which an update replaces. */
const userBase = async ($: EngineInterface) => `${await home($)}/.claude/sound-alerts/presets`
const bundledBase = ($: EngineInterface) => `${$.plugin.root}/presets`

/** What the plugin saw lately, for `/alert log`: a sound that did not play leaves no other trace. */
const trace: string[] = []
const note = (text: string) => {
  trace.push(`${new Date().toTimeString().slice(0, 8)} ${text}`)
  if (trace.length > 60) trace.shift()
}

/** Work that must not hold up a hook (a permission prompt waits for hooks): started from a timer, it outlives the dispatch. */
const later = ($: EngineInterface, ms: number, fn: () => Promise<unknown>) => $.clock.after(ms, () => void fn().catch(err => note(`failed: ${String(err)}`)))

// ---- settings and presets ----------------------------------------------------------------------

const load = async ($: EngineInterface) => readSettings(await $.store.get('settings'))
const save = ($: EngineInterface, s: AlertSettings) => $.store.set('settings', s)

async function presetFolders($: EngineInterface, base: string): Promise<string[]> {
  const list = await $.fs.list(base).catch(() => [])
  return list.filter(e => e.kind === 'dir' && isPresetName(e.name)).map(e => e.name)
}

async function presets($: EngineInterface): Promise<{ name: string; yours: boolean; bundled: boolean }[]> {
  const yours = await presetFolders($, await userBase($))
  const bundled = await presetFolders($, bundledBase($))
  return [...new Set([...bundled, ...yours])].sort().map(name => ({ name, yours: yours.includes(name), bundled: bundled.includes(name) }))
}

/** The file for one sound in a preset: the user's own first, the bundled one of the same name after it. */
async function fileFor($: EngineInterface, preset: string, sound: string): Promise<string | undefined> {
  for (const base of [await userBase($), bundledBase($)]) {
    const file = `${base}/${preset}/${sound}.wav`
    if (await $.fs.exists(file).catch(() => false)) return file
  }
  return undefined
}

/** Deletes one folder of the user's own presets: our path only, and one a command line cannot misread. */
async function removeFolder($: EngineInterface, folder: string): Promise<boolean> {
  if (!/\/\.claude\/sound-alerts\/presets\/[A-Za-z0-9][A-Za-z0-9_-]*$/.test(folder.replaceAll('\\', '/')) || /[&|<>^%"]/.test(folder)) return false
  const argv = (await systemOf($)) === 'windows' ? ['cmd', '/c', 'rmdir', '/s', '/q', folder.replaceAll('/', '\\')] : ['rm', '-rf', folder]
  const run = await $.process.run(argv, { timeoutMs: 15_000 }).catch(() => ({ exitCode: 1 }))
  return run.exitCode === 0 && !(await $.fs.exists(folder).catch(() => true))
}

// ---- playing ------------------------------------------------------------------------------------

/** Windows says so in its environment; the others are told by `uname`. */
async function systemOf($: EngineInterface): Promise<System> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'windows'
  const uname = (await $.process.run(['uname']).catch(() => ({ stdout: '' }))).stdout.trim()
  return uname === 'Darwin' ? 'macos' : 'linux'
}

/** Plays one file with the system's player and answers its one line. Two sounds may overlap: they are not queued. */
async function runPlayer($: EngineInterface, file: string): Promise<string> {
  const argv = playerArgv(await systemOf($), $.plugin.root, file)
  const run = await $.process.run(argv, { timeoutMs: 15_000 }).catch(err => ({ exitCode: 1, stdout: '', stderr: String(err) }))
  const line = run.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? ''
  return line || run.stderr.trim().slice(0, 160) || 'the player gave no answer'
}

/**
 * Plays a case of sound if the user wants it: the switch is on, it is not muted, it did not just play.
 * Answers why not, or `played`. `force` is for the user's own tests: no switch, no mute.
 */
async function sound($: EngineInterface, name: string, why: string, force = false): Promise<string> {
  const s = await load($)
  if (!force) {
    if (!s.enabled) return 'off'
    if (s.muted.includes(name)) return 'muted'
    const now = await $.clock.now()
    // Several things can end together (subagents): one sound is enough.
    if (now - (lastAt.get(name) ?? -Infinity) < 1500) return 'too soon'
    lastAt.set(name, now)
  }
  const file = await fileFor($, s.preset, name)
  if (!file) {
    note(`${name}: no ${name}.wav in ${s.preset}`)
    return `the preset ${s.preset} has no ${name}.wav`
  }
  if (force) {
    const line = await runPlayer($, file)
    note(`${name} (${why}): ${line}`)
    return line.startsWith('ok:') ? 'played' : line.replace(/^error:/, '')
  }
  later($, 0, async () => {
    const line = await runPlayer($, file)
    note(`${name} (${why}): ${line}`)
  })
  return 'played'
}

// ---- the command and Claude's tool -----------------------------------------------------------

const describe = (s: AlertSettings) =>
  `sound-alerts is ${s.enabled ? 'on' : 'off'}; preset ${s.preset}; muted: ${s.muted.join(', ') || 'none'}; Claude may play sounds itself: ${s.claude ? 'yes' : 'no'}.`

const HELP = [
  '/alert                          how it is set',
  '/alert on | off                 the master switch',
  '/alert presets                  the presets you can use',
  '/alert preset <name>            use a preset',
  '/alert new <name>               make a folder for a preset of yours and say where it is',
  '/alert remove <name> [yes]      delete a preset of yours (it says what goes first; the bundled ones stay)',
  '/alert sounds                   every case of sound, whether it is on and the preset has its file',
  '/alert play <sound>             hear one now (even if it is muted)',
  '/alert test [preset]            hear all of them one after the other, saying which one is playing (muted ones too)',
  '/alert mute <sound>... | unmute <sound>... | unmute all',
  '/alert claude on | off          whether Claude may play sounds itself',
  '/alert log                      what the plugin saw lately (when a sound does not play)',
].join('\n')

async function command($: EngineInterface, args: string): Promise<string> {
  const [verb = '', ...rest] = args.trim().split(/\s+/).filter(Boolean)
  const s = await load($)
  switch (verb.toLowerCase()) {
    case '':
      return describe(s)
    case 'on':
    case 'off':
      await save($, { ...s, enabled: verb.toLowerCase() === 'on' })
      return `Sounds ${verb.toLowerCase()}.`
    case 'presets': {
      const list = await presets($)
      return list.map(p => `${p.name === s.preset ? '*' : ' '} ${p.name}  (${p.yours && p.bundled ? 'bundled, with files of yours' : p.yours ? 'yours' : 'bundled'})`).join('\n') + `\nYours go in ${await userBase($)}/<name>/ : /alert new <name>`
    }
    case 'preset': {
      const name = rest[0] ?? ''
      const found = (await presets($)).find(p => p.name.toLowerCase() === name.toLowerCase())
      if (!found) return `No preset "${name}". /alert presets lists them.`
      await save($, { ...s, preset: found.name })
      return `Preset ${found.name}.`
    }
    case 'new': {
      const name = rest[0] ?? ''
      if (!isPresetName(name)) return 'Usage: /alert new <name>: letters, digits, dash or underscore, up to 32.'
      const folder = `${await userBase($)}/${name}`
      if ((await $.fs.exists(folder).catch(() => false)) || (await presets($)).some(p => p.name.toLowerCase() === name.toLowerCase())) return `A preset called ${name} exists already: /alert presets.`
      const files = SOUNDS.map(x => `${x.name}.wav   ${x.when}`).join('\n')
      await $.fs.write(`${folder}/README.txt`, `Put .wav files here, named like these. A sound with no file stays silent.\nThen: /alert preset ${name}\n\n${files}\n`)
      return `Made ${folder}\nPut your .wav files there (see README.txt), then /alert preset ${name}`
    }
    case 'remove': {
      const found = (await presets($)).find(p => p.name.toLowerCase() === (rest[0] ?? '').toLowerCase())
      if (!found) return `No preset "${rest[0] ?? ''}". /alert presets lists them.`
      if (!found.yours) return `${found.name} comes with the plugin: it cannot be removed. Yours are the ones marked so in /alert presets.`
      const folder = `${await userBase($)}/${found.name}`
      const count = (await $.fs.list(folder).catch(() => [])).length
      if (rest[1]?.toLowerCase() !== 'yes') return `This deletes the folder ${folder} (${count} files).${found.bundled ? ` The bundled ${found.name} stays.` : ''}\nTo go on: /alert remove ${found.name} yes`
      if (!(await removeFolder($, folder))) return `Could not delete ${folder}: delete it yourself.`
      // The preset in use is gone: the default takes its place.
      if (s.preset === found.name && !found.bundled) await save($, { ...s, preset: DEFAULTS.preset })
      return `Removed ${folder}.${s.preset === found.name && !found.bundled ? ` Preset ${DEFAULTS.preset} is in use now.` : ''}`
    }
    case 'sounds': {
      const lines: string[] = []
      for (const x of SOUNDS) {
        const has = !!(await fileFor($, s.preset, x.name))
        lines.push(`${s.muted.includes(x.name) ? '[muted]' : '[on]   '} ${x.name.padEnd(14)} ${has ? '' : '(no file) '}${x.when}`)
      }
      return `Preset ${s.preset}:\n${lines.join('\n')}`
    }
    case 'test': {
      const wanted = rest[0] ?? s.preset
      const preset = (await presets($)).find(p => p.name.toLowerCase() === wanted.toLowerCase())
      if (!preset) return `No preset "${wanted}". /alert presets lists them.`
      if (testing) return 'A test is already running.'
      testing = true
      try {
        const lines: string[] = []
        for (const [i, x] of SOUNDS.entries()) {
          const head = `${i + 1}/${SOUNDS.length} ${x.name}`
          const file = await fileFor($, preset.name, x.name)
          if (!file) {
            lines.push(`${head}: (no file)`)
            continue
          }
          // Each one is said while it plays: the status line, and a notice that stays a moment.
          $.ui.status(`sound-alerts: ${head}`)
          $.ui.toast(`${head}: ${x.when}`)
          const line = await runPlayer($, file)
          note(`${x.name} (test): ${line}`)
          lines.push(`${head}: ${line.startsWith('ok:') ? 'played' : line.replace(/^error:/, 'not played: ')}  (${x.when})`)
        }
        return `Preset ${preset.name}:\n${lines.join('\n')}`
      } finally {
        testing = false
        $.ui.status(undefined)
      }
    }
    case 'play': {
      const name = rest[0] ?? ''
      if (!isSound(name)) return `No sound "${name}". /alert sounds lists them.`
      const out = await sound($, name, 'by hand', true)
      return out === 'played' ? `Played ${name}.` : `Not played: ${out}`
    }
    case 'mute':
    case 'unmute': {
      const names = rest[0]?.toLowerCase() === 'all' && verb.toLowerCase() === 'unmute' ? [...s.muted] : rest
      const bad = names.filter(n => !isSound(n))
      if (!names.length || bad.length) return bad.length ? `No sound "${bad[0]}". /alert sounds lists them.` : `Usage: /alert ${verb.toLowerCase()} <sound>...`
      const muted = verb.toLowerCase() === 'mute' ? [...new Set([...s.muted, ...names])] : s.muted.filter(m => !names.includes(m))
      await save($, { ...s, muted })
      return `Muted: ${muted.join(', ') || 'none'}.`
    }
    case 'claude': {
      const v = rest[0]?.toLowerCase()
      if (v !== 'on' && v !== 'off') return `Claude may play sounds itself: ${s.claude ? 'yes' : 'no'}. /alert claude on | off`
      await save($, { ...s, claude: v === 'on' })
      return `Claude ${v === 'on' ? 'may' : 'may not'} play sounds itself.`
    }
    case 'log':
      return trace.join('\n') || 'Nothing yet.'
    default:
      return HELP
  }
}

/** Claude asked for a sound: only from the list, only if the user allows it, never in a burst. */
async function answerTool($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  const name = String(input.sound ?? '')
  if (!isSound(name) || name === 'start') return `Not played: "${name}" is not one of: ${NAMES.filter(n => n !== 'start').join(', ')}.`
  const s = await load($)
  if (!s.claude) return 'Not played: the user switched off the sounds Claude plays itself.'
  const now = await $.clock.now()
  if (now - lastByClaude < 2000) return 'Not played: too soon after the last one.'
  lastByClaude = now
  const out = await sound($, name, 'Claude')
  return out === 'played' ? `Played ${name}.` : `Not played: ${out}.`
}

// ---- the module ----------------------------------------------------------------------------------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const reg = (await $.tool.register(TOOL_SPEC).catch(() => undefined)) as { tool?: string } | undefined
    toolName = reg?.tool ?? `mcp__${$.plugin.name}__${TOOL_SPEC.name}`
    await $.command.register({ name: 'alert', description: 'sound-alerts: notification sounds, in presets you can make yourself' })
    void sound($, 'start', 'session start')
    return next(e)
  })

  on('command.run', { command: 'alert' }, async ($, e) => ({ text: await command($, e.args) }))

  // A permission, a question and a plan wait for the user: only a real call counts, not a query.
  on('tool.check', async ($, e, next) => {
    if (e.tool === toolName) return { decision: 'allow' as const }
    const out = await next(e)
    if (e.tool_use_id !== undefined) {
      const name = e.tool === 'AskUserQuestion' ? 'question' : e.tool === 'ExitPlanMode' ? 'plan' : out.decision === 'ask' ? 'permission' : ''
      // The approver says who can be asked: logged, to see whether it tells a person's prompt from the auto mode's classifier.
      const approver = (e as { approver?: string }).approver
      if (name) {
        note(`${name} asked by ${e.tool}: approver ${approver ?? 'none'}, decision ${out.decision}`)
        later($, 0, () => sound($, name, e.tool))
      }
    }
    return out
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === toolName) return { result: await answerTool($, e as unknown as Record<string, unknown>) }
    const ran = await next(e)
    const command = (e as unknown as { command?: unknown }).command
    if ((e.tool === 'Bash' || e.tool === 'PowerShell') && typeof command === 'string' && ran.deny === undefined && isTestCommand(command)) {
      const result = (ran as { result?: Record<string, unknown> }).result
      // A command sent to the background has not finished: its end is a task-done.
      if (typeof result?.backgroundTaskId !== 'string') later($, 0, () => sound($, ran.isError ? 'tests-fail' : 'tests-pass', command.slice(0, 40)))
    }
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') later($, 0, () => sound($, 'task-done', 'background task'))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const reason = (e as { reason?: string }).reason
    const name = e.agentId !== undefined ? (reason === 'answer' ? 'agent-done' : '') : reason === 'answer' ? 'done' : reason === 'error' ? 'error' : reason === 'refusal' ? 'attention' : ''
    if (name) later($, 0, () => sound($, name, e.agentId !== undefined ? `agent ${e.agentId}` : 'turn'))
    return next(e)
  })

  // The usage limits and the context window, measured after each turn.
  on('session.measure', async ($, e, next) => {
    for (const name of limitSounds(fired, e.rateLimits, e.context.percent)) later($, 0, () => sound($, name, 'measure'))
    return next(e)
  })
}

