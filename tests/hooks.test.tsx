import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { NAMES } from '../hooks/sounds'

const TOOL = 'mcp__sound-alerts__play'
const USER = 'C:/Users/test/.claude/sound-alerts/presets'
const norm = (p: string) => p.replaceAll('\\', '/')

// The engine beneath the plugin: every player run lands in `runs`, and the bundled presets exist as files.
function engine(on: On, system: 'Windows_NT' | 'Darwin' | 'Linux' = 'Windows_NT') {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  mock.env(on, system === 'Windows_NT' ? { USERPROFILE: 'C:/Users/test', OS: 'Windows_NT' } : { HOME: '/home/test' })
  const files: Record<string, string> = {}
  const runs: string[][] = []
  const bundled = (path: string) => {
    const m = /\/presets(?:\/(soft|retro)(?:\/([a-z-]+)\.wav)?)?$/.exec(norm(path))
    return !!m && !norm(path).includes('/.claude/') && (m[2] === undefined || NAMES.includes(m[2]))
  }
  const notices: string[] = []
  on('ui.toast', (_, e) => (notices.push(JSON.stringify(e)), { value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__sound-alerts__${e.name}` } }))
  const registered: string[] = []
  on('command.register', (_, e) => (registered.push(e.name), { value: { command: e.name } }))
  on('process.run', (_, e) => {
    if (e.argv[0] === 'uname') return { value: { exitCode: 0, stdout: `${system}\n`, stderr: '' } } as never
    runs.push([...e.argv])
    // Removing a folder removes what is under it.
    if (e.argv[0] === 'cmd' || e.argv[0] === 'rm') {
      const dir = norm(e.argv.at(-1)!)
      for (const p of Object.keys(files)) if (norm(p).startsWith(dir)) delete files[p]
    }
    return { value: { exitCode: 0, stdout: 'ok:played\n', stderr: '' } } as never
  })
  on('tool.call', (_, e) => {
    const text = JSON.stringify(e)
    if (text.includes('FAILS')) return { isError: true, result: 'exit 1', text: 'Exit code 1' } as never
    if (text.includes('BACKGROUND')) return { result: { backgroundTaskId: 'b1' } } as never
    return { result: { ok: true } }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('fs.read', (_, e) => (e.path in files ? { value: files[e.path]! } : Promise.reject(new Error('missing'))))
  on('fs.write', (_, e) => ((files[e.path] = e.text), { value: undefined }))
  on('fs.exists', (_, e) => ({ value: bundled(e.path) || Object.keys(files).some(p => norm(p).startsWith(norm(e.path))) }) as never)
  on('fs.list', (_, e) => {
    const base = norm(e.path ?? '')
    if (bundled(base) && base.endsWith('/presets')) return { value: ['soft', 'retro'].map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })) } as never
    const names = new Set<string>()
    for (const p of Object.keys(files)) if (norm(p).startsWith(`${base}/`)) names.add(norm(p).slice(base.length + 1).split('/')[0]!)
    return { value: [...names].map(name => ({ name, kind: files[`${base}/${name}`] === undefined ? 'dir' : 'file', size: 0, mtimeMs: 0, isLink: false })) } as never
  })
  // What the player was asked to play, as `preset/sound`.
  const played = () => runs.map(argv => /presets\/([\w-]+)\/([\w-]+)\.wav$/.exec(norm(argv.at(-1)!))?.slice(1).join('/') ?? argv.join(' '))
  return { files, runs, clock, played, registered, notices }
}

const cmd = async ($: Engine, args: string) =>
  ((await $.command.run({ command: 'alert', args, origin: { kind: 'composer' } } as never)) as { text?: string }).text ?? ''
const start = ($: Engine) => $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
const done = ($: Engine, extra: Record<string, unknown> = {}) =>
  $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', ...extra } as never)
const call = ($: Engine, tool: string, fields: Record<string, unknown> = {}) => $.tool.call({ tool, ...fields } as never) as Promise<{ result?: unknown }>

// Claude Code ships commands with some names: registering one fails and the whole session.start hook is skipped.
test('the command is alert and the tool is registered, and nothing plays at the start of a session', async ($, on) => {
  const { registered, played, clock } = engine(on)
  await start($)
  await clock.advance(100)
  expect(registered).toEqual(['alert'])
  expect(played()).toEqual([])
  expect(await cmd($, '')).toBe('sound-alerts is on; preset soft; muted: start; Claude may play sounds itself: yes.')
})

test('the start sound plays once it is unmuted', async ($, on) => {
  const { played, clock } = engine(on)
  await start($)
  expect(await cmd($, 'unmute start')).toBe('Muted: none.')
  await start($)
  await clock.advance(100)
  expect(played()).toEqual(['soft/start'])
})

test('a turn that ended plays done, in the player of the system', async ($, on) => {
  const { runs, played, clock } = engine(on)
  await start($)
  await $.turn.start({ text: 'x', turnId: 't1' })
  await done($)
  await clock.advance(100)
  expect(played()).toEqual(['soft/done'])
  expect(runs[0]!.slice(0, 2)).toEqual(['powershell', '-NoProfile'])
  expect(runs[0]!.at(-4)).toBe('-File')
  expect(runs[0]!.at(-3)!.endsWith('/scripts/play.ps1')).toBe(true)
})

for (const system of ['Darwin', 'Linux'] as const) {
  test(`${system}: the player is play.sh with the file as its one argument`, async ($, on) => {
    const { runs, played, clock } = engine(on, system)
    await start($)
    await done($)
    await clock.advance(100)
    expect(played()).toEqual(['soft/done'])
    expect(runs[0]!.slice(0, 1)).toEqual(['bash'])
    expect(runs[0]!.length).toBe(3)
  })
}

test('an interrupted turn is silent, an error and a refusal are not', async ($, on) => {
  const { played, clock } = engine(on)
  await start($)
  await done($, { reason: 'aborted', isAborted: true })
  await clock.advance(100)
  expect(played()).toEqual([])
  await done($, { reason: 'error' })
  await clock.advance(2_000)
  await done($, { reason: 'refusal', refusal: { category: null, explanation: null } })
  await clock.advance(100)
  expect(played()).toEqual(['soft/error', 'soft/attention'])
})

test('a subagent that ended plays agent-done, and several at once play it once', async ($, on) => {
  const { played, clock } = engine(on)
  await start($)
  await done($, { agentId: 'a1' })
  await done($, { agentId: 'a2' })
  await done($, { agentId: 'a3' })
  await clock.advance(100)
  expect(played()).toEqual(['soft/agent-done'])
  await clock.advance(2_000)
  await done($, { agentId: 'a4' })
  await clock.advance(100)
  expect(played()).toEqual(['soft/agent-done', 'soft/agent-done'])
})

test('a question, a plan and a permission each have a sound, and an allowed call has none', async ($, on) => {
  const { played, clock } = engine(on)
  on('tool.check', (_, e) => ({ decision: JSON.stringify(e).includes('ASK') ? ('ask' as const) : ('allow' as const) }))
  await start($)
  await call($, 'AskUserQuestion', { questions: [] })
  await clock.advance(2_000)
  await call($, 'ExitPlanMode', { plan: 'p' })
  await clock.advance(2_000)
  await call($, 'Bash', { command: 'ASK me' })
  await clock.advance(2_000)
  await call($, 'Bash', { command: 'ls' })
  await clock.advance(2_000)
  expect(played()).toEqual(['soft/question', 'soft/plan', 'soft/permission'])
})

test('a test command that exits 0 plays tests-pass, one that fails plays tests-fail, other commands play nothing', async ($, on) => {
  const { played, clock } = engine(on)
  await start($)
  await call($, 'Bash', { command: 'npm test' })
  await clock.advance(2_000)
  await call($, 'PowerShell', { command: 'pytest FAILS' })
  await clock.advance(2_000)
  await call($, 'Bash', { command: 'git commit -m "add pytest"' })
  await call($, 'Bash', { command: 'ls FAILS' })
  await call($, 'Bash', { command: 'npm test BACKGROUND' })
  await clock.advance(2_000)
  expect(played()).toEqual(['soft/tests-pass', 'soft/tests-fail'])
})

test('a background task that finished plays task-done', async ($, on) => {
  const { played, clock } = engine(on)
  await start($)
  await $.prompt.submit({ text: '<task-notification><task-id>b1</task-id></task-notification>', origin: { kind: 'task-notification' } } as never)
  await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' } } as never)
  await clock.advance(100)
  expect(played()).toEqual(['soft/task-done'])
})

test('the usage limits and the context window play their sounds once', async ($, on) => {
  const { played, clock } = engine(on)
  await start($)
  const measure = (percentUsed: number, context: number) =>
    $.session.measure({ context: { window: 200_000, percent: context }, rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt: 'r1' }], changed: ['rateLimits'] } as never)
  await measure(50, 50)
  await measure(85, 50)
  await measure(86, 95)
  await clock.advance(2_000)
  await measure(100, 95)
  await clock.advance(100)
  expect(played()).toEqual(['soft/limit-warning', 'soft/context-full', 'soft/limit'])
})

test('off, a muted sound and /alert play', async ($, on) => {
  const { played, clock } = engine(on)
  await start($)
  expect(await cmd($, 'mute done question')).toBe('Muted: start, done, question.')
  await done($)
  await clock.advance(100)
  expect(played()).toEqual([])
  // Played by hand, a muted sound is heard: that is how it is tried.
  expect(await cmd($, 'play done')).toBe('Played done.')
  expect(played()).toEqual(['soft/done'])
  expect(await cmd($, 'unmute all')).toBe('Muted: none.')
  expect(await cmd($, 'off')).toBe('Sounds off.')
  await clock.advance(2_000)
  await done($)
  await clock.advance(100)
  expect(played()).toEqual(['soft/done'])
  expect(await cmd($, 'mute nope')).toMatch(/No sound "nope"/)
  expect(await cmd($, 'play ../x')).toMatch(/No sound/)
})

test('a preset is a folder: the bundled ones, yours, and the one you made override the bundled sounds file by file', async ($, on) => {
  const { files, runs, played, clock } = engine(on)
  await start($)
  expect(await cmd($, 'presets')).toMatch(/ {2}retro {2}\(bundled\)\n\* soft {2}\(bundled\)/)
  expect(await cmd($, 'preset nope')).toMatch(/No preset "nope"/)
  expect(await cmd($, 'preset ../retro')).toMatch(/No preset/)
  expect(await cmd($, 'preset retro')).toBe('Preset retro.')
  await done($)
  await clock.advance(100)
  expect(played()).toEqual(['retro/done'])

  // A preset of the user: a folder with the names of the sounds.
  files[`${USER}/pippo/done.wav`] = 'RIFF'
  expect(await cmd($, 'presets')).toMatch(/pippo {2}\(yours\)/)
  expect(await cmd($, 'preset pippo')).toBe('Preset pippo.')
  await clock.advance(2_000)
  await done($)
  await clock.advance(100)
  expect(played().at(-1)).toBe('pippo/done')
  // A sound it has no file for stays silent.
  await clock.advance(2_000)
  await call($, 'Bash', { command: 'npm test' })
  await clock.advance(100)
  expect(played().length).toBe(2)
  expect(await cmd($, 'play question')).toMatch(/Not played: the preset pippo has no question\.wav/)
  expect(await cmd($, 'sounds')).toMatch(/\[on\] {4}done\s+Claude finished[\s\S]*\[on\] {4}question\s+\(no file\)/)

  // A folder of the user with the name of a bundled preset overrides it file by file.
  files[`${USER}/soft/done.wav`] = 'RIFF'
  expect(await cmd($, 'preset soft')).toBe('Preset soft.')
  await clock.advance(2_000)
  await done($)
  await clock.advance(100)
  expect(norm(runs.at(-1)!.at(-1)!)).toBe(`${USER}/soft/done.wav`)
})

test('/alert test plays every sound of a preset in turn, muted ones too, and says which', async ($, on) => {
  const { files, played, notices } = engine(on)
  await start($)
  const out = await cmd($, 'test')
  expect(played()).toEqual(NAMES.map(n => `soft/${n}`))
  const lines = out.split('\n')
  expect(lines[0]).toBe('Preset soft:')
  expect(lines.length).toBe(NAMES.length + 1)
  expect(lines[1]).toBe('1/16 done: played  (Claude finished its turn)')
  expect(out).toMatch(/13\/16 start: played/)
  expect(notices.length).toBe(NAMES.length)
  expect(notices[0]).toContain('1/16 done')

  // Another preset, named: only what it has.
  files[`${USER}/pippo/done.wav`] = 'RIFF'
  files[`${USER}/pippo/error.wav`] = 'RIFF'
  const pippo = await cmd($, 'test pippo')
  expect(played().slice(NAMES.length)).toEqual(['pippo/done', 'pippo/error'])
  expect(pippo).toMatch(/2\/16 question: \(no file\)/)
  expect(pippo).toMatch(/9\/16 error: played/)
  expect(await cmd($, 'test nope')).toMatch(/No preset "nope"/)
})

test('/alert remove deletes a preset of yours after saying what goes, and never a bundled one', async ($, on) => {
  const { files, runs, played, clock } = engine(on)
  await start($)
  files[`${USER}/pippo/done.wav`] = 'RIFF'
  files[`${USER}/pippo/error.wav`] = 'RIFF'
  await cmd($, 'preset pippo')

  expect(await cmd($, 'remove soft')).toMatch(/comes with the plugin: it cannot be removed/)
  expect(await cmd($, 'remove retro yes')).toMatch(/comes with the plugin/)
  expect(await cmd($, 'remove ../x yes')).toMatch(/No preset/)
  expect(await cmd($, 'remove nope')).toMatch(/No preset "nope"/)
  const preview = await cmd($, 'remove pippo')
  expect(preview).toContain(`${USER}/pippo (2 files)`)
  expect(preview).toContain('/alert remove pippo yes')
  // Saying what goes deletes nothing.
  expect(runs.filter(a => a[0] === 'cmd' || a[0] === 'rm').length).toBe(0)
  expect(Object.keys(files).length).toBe(2)

  expect(await cmd($, 'remove pippo yes')).toBe(`Removed ${USER}/pippo. Preset soft is in use now.`)
  const gone = runs.find(a => a[0] === 'cmd')!
  expect(gone.slice(0, 5)).toEqual(['cmd', '/c', 'rmdir', '/s', '/q'])
  expect(gone[5]!.endsWith('.claude\\sound-alerts\\presets\\pippo')).toBe(true)
  expect(Object.keys(files).length).toBe(0)
  expect(await cmd($, 'presets')).not.toMatch(/pippo/)
  expect(await cmd($, '')).toMatch(/preset soft;/)
  await done($)
  await clock.advance(100)
  expect(played().at(-1)).toBe('soft/done')

  // A folder of yours with the name of a bundled preset: only its files go, the bundled one stays in use.
  files[`${USER}/soft/done.wav`] = 'RIFF'
  expect(await cmd($, 'remove soft')).toMatch(/\(1 files\)\. The bundled soft stays/)
  expect(await cmd($, 'remove soft yes')).toBe(`Removed ${USER}/soft.`)
  expect(await cmd($, '')).toMatch(/preset soft;/)
})

test('/alert new makes the folder for a preset of yours and says where', async ($, on) => {
  const { files } = engine(on)
  await start($)
  expect(await cmd($, 'new ../x')).toMatch(/Usage/)
  expect(await cmd($, 'new soft')).toMatch(/exists already/)
  const out = await cmd($, 'new pippo')
  expect(out).toContain(`${USER}/pippo`)
  const readme = Object.entries(files).find(([k]) => norm(k) === `${USER}/pippo/README.txt`)![1]
  for (const name of NAMES) expect(readme).toContain(`${name}.wav`)
  expect(await cmd($, 'new pippo')).toMatch(/exists already/)
  expect(await cmd($, 'presets')).toMatch(/pippo/)
})

test('Claude plays a sound with its tool only from the list, only if allowed, and not in a burst', async ($, on) => {
  const { played, clock } = engine(on)
  await start($)
  const play = (sound: string) => call($, TOOL, { sound }).then(r => String(r.result))
  expect(await play('success')).toBe('Played success.')
  await clock.advance(100)
  expect(played()).toEqual(['soft/success'])
  expect(await play('warning')).toMatch(/too soon/)
  await clock.advance(2_500)
  expect(await play('../../x')).toMatch(/is not one of/)
  expect(await play('start')).toMatch(/is not one of/)
  expect(await cmd($, 'mute attention')).toMatch(/attention/)
  expect(await play('attention')).toBe('Not played: muted.')
  await clock.advance(2_500)
  expect(await cmd($, 'claude off')).toMatch(/may not/)
  expect(await play('warning')).toMatch(/switched off/)
  expect(played()).toEqual(['soft/success'])
})

test('the log tells what played and what did not', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await done($)
  await clock.advance(100)
  expect(await cmd($, 'play question')).toBe('Played question.')
  expect(await cmd($, 'log')).toMatch(/done \(turn\): ok:played[\s\S]*question \(by hand\): ok:played/)
  expect(await cmd($, 'wat')).toMatch(/\/alert on \| off/)
})
