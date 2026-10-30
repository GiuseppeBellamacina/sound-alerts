import { expect, test } from 'claude-code/testing'

import { DEFAULTS, NAMES, SOUNDS, isPresetName, isSound, isTestCommand, limitSounds, pickVariant, playerArgv, readSettings, testOutcome, variantsOf } from '../hooks/sounds'

test('every case of sound is listed once, with who plays it', async () => {
  expect(new Set(NAMES).size).toBe(NAMES.length)
  expect(NAMES).toContain('done')
  expect(NAMES).toContain('tests-pass')
  expect(SOUNDS.filter(s => s.by === 'claude').map(s => s.name)).toEqual(['success', 'warning', 'attention'])
  expect(isSound('done')).toBe(true)
  expect(isSound('../done')).toBe(false)
})

test('a preset name is a folder name and nothing else', async () => {
  for (const ok of ['soft', 'pippo', 'my-sounds_2', 'A1']) expect(isPresetName(ok)).toBe(true)
  for (const bad of ['', '.', '..', '../x', 'a/b', 'a\\b', 'a b', '-x', 'x'.repeat(33), 'C:']) expect(isPresetName(bad)).toBe(false)
})

test('the settings read back keep only what is valid', async () => {
  expect(readSettings(undefined)).toEqual(DEFAULTS)
  expect(readSettings({ enabled: false, preset: 'pippo', muted: ['done', 'nope', 3], claude: false })).toEqual({ enabled: false, preset: 'pippo', muted: ['done'], claude: false, notice: true })
  expect(readSettings({ preset: '../evil', enabled: 'yes' }).preset).toBe('soft')
  expect(DEFAULTS.muted).toEqual(['start', 'task-done', 'agent-done'])
})

test('a test run is told by the runner, not by the word test', async () => {
  for (const yes of [
    'pytest -q',
    'python -m pytest tests/',
    'python3 -m unittest',
    'npm test',
    'npm run test -- --watch=false',
    'pnpm test',
    'yarn t',
    'bun test',
    'npx vitest run',
    'jest --ci',
    'go test ./...',
    'cargo test --all',
    'cargo nextest run',
    'dotnet test',
    'mvn -q test',
    './gradlew check',
    'make test',
    'cd app && npx playwright test',
    'claude plugin test .',
    'Invoke-Pester -Path .',
    'ctest --output-on-failure',
  ]) expect(isTestCommand(yes)).toBe(true)
  for (const no of [
    'git commit -m "add pytest"',
    'echo pytest',
    'grep -r jest src',
    'ls tests',
    'cat test.go',
    'go build test.go',
    'npm install jest',
    'rg "npm test" docs',
    'node build.js',
    'cd tests && ls',
  ]) expect(isTestCommand(no)).toBe(false)
})

test('text a command carries is not a command: a heredoc body and what is in quotes', async () => {
  const heredoc = (body: string, after = '') => `python - <<'PYEOF'
${body}
PYEOF${after}`
  // A script that edits a README or a test file says "npm test" and "claude plugin test" without running them.
  expect(isTestCommand(heredoc("print('claude plugin test')"))).toBe(false)
  expect(isTestCommand(heredoc('npm test\npytest -q'))).toBe(false)
  expect(isTestCommand(heredoc('x = 1', '\nnpm test'))).toBe(true)
  expect(isTestCommand(`sed -i 's/pytest/jest/' package.json && claude plugin test .`)).toBe(true)
  expect(isTestCommand(`sed -i 's/a/npm test/' README.md`)).toBe(false)
  expect(isTestCommand('python -c "import pytest"')).toBe(false)
  expect(isTestCommand('pytest -k "name with spaces" -q')).toBe(true)
  expect(isTestCommand('npm test -- -t "a name"')).toBe(true)
  expect(isTestCommand(`cd app && npx vitest run --reporter='dot'`)).toBe(true)
})

test('a limit is said once for each level and each time it resets', async () => {
  const fired = new Set<string>()
  const w = (percentUsed: number, resetsAt = 'r1') => [{ kind: 'five_hour', percentUsed, resetsAt }]
  expect(limitSounds(fired, w(50), 10)).toEqual([])
  expect(limitSounds(fired, w(74), 10)).toEqual([])
  expect(limitSounds(fired, w(75), 10)).toEqual(['limit-5h'])
  expect(limitSounds(fired, w(85), 10)).toEqual([])
  expect(limitSounds(fired, w(100), 10)).toEqual(['limit'])
  expect(limitSounds(fired, w(100.0), 10)).toEqual([])
  // The window reset: it is a new one.
  expect(limitSounds(fired, w(82, 'r2'), 10)).toEqual(['limit-5h'])
  // Reaching 100 at once is the limit, not a warning after it.
  expect(limitSounds(fired, w(100, 'r3'), 10)).toEqual(['limit'])
  expect(limitSounds(fired, w(101, 'r3'), 10)).toEqual([])
  // Each window has its own sound, and any window used up is the limit.
  expect(limitSounds(new Set(), [{ kind: 'five_hour', percentUsed: 80 }], undefined)).toEqual(['limit-5h'])
  expect(limitSounds(new Set(), [{ kind: 'seven_day', percentUsed: 80 }], undefined)).toEqual(['limit-week'])
  expect(limitSounds(new Set(), [{ kind: 'seven_day', percentUsed: 100 }], undefined)).toEqual(['limit'])
  expect(limitSounds(new Set(), [{ kind: 'seven_day_opus', percentUsed: 80 }], undefined)).toEqual(['limit-week'])
  // A spend limit has no warning, only its end.
  expect(limitSounds(new Set(), [{ kind: 'spend_limit', percentUsed: 90 }], undefined)).toEqual([])
  expect(limitSounds(new Set(), [{ kind: 'spend_limit', percentUsed: 101 }], undefined)).toEqual(['limit'])
})

test('limits crossed together make one sound, the most urgent, and the others count as said', async () => {
  const both = (five: number, week: number) => [
    { kind: 'five_hour', percentUsed: five, resetsAt: 'f' },
    { kind: 'seven_day', percentUsed: week, resetsAt: 'w' },
  ]
  // Two windows past 75 together: the one further along speaks, the other does not speak after it.
  let fired = new Set<string>()
  expect(limitSounds(fired, both(80, 90), 10)).toEqual(['limit-week'])
  expect(limitSounds(fired, both(82, 91), 10)).toEqual([])
  fired = new Set<string>()
  expect(limitSounds(fired, both(95, 76), 10)).toEqual(['limit-5h'])
  expect(limitSounds(fired, both(96, 77), 10)).toEqual([])
  // A tie goes to the week.
  expect(limitSounds(new Set(), both(80, 80), 10)).toEqual(['limit-week'])
  // A window used up comes before one running out, and the warning is not said after it.
  fired = new Set<string>()
  expect(limitSounds(fired, both(100, 90), 10)).toEqual(['limit'])
  expect(limitSounds(fired, both(100, 91), 10)).toEqual([])
  // One that crosses later has its own sound: it was not part of the first.
  fired = new Set<string>()
  expect(limitSounds(fired, both(80, 10), 10)).toEqual(['limit-5h'])
  expect(limitSounds(fired, both(81, 76), 10)).toEqual(['limit-week'])
  // Both used up: one limit.
  expect(limitSounds(new Set(), both(100, 100), 10)).toEqual(['limit'])
  // The context waits for a measure with nothing else to say.
  fired = new Set<string>()
  expect(limitSounds(fired, both(80, 10), 95)).toEqual(['limit-5h'])
  expect(limitSounds(fired, both(80, 10), 95)).toEqual(['context-full'])
  expect(limitSounds(fired, both(80, 10), 95)).toEqual([])
})

test('the context window is said once, and again only after it was emptied', async () => {
  const fired = new Set<string>()
  expect(limitSounds(fired, [], 89)).toEqual([])
  expect(limitSounds(fired, [], 91)).toEqual(['context-full'])
  expect(limitSounds(fired, [], 95)).toEqual([])
  expect(limitSounds(fired, [], 80)).toEqual([])
  expect(limitSounds(fired, [], 40)).toEqual([])
  expect(limitSounds(fired, [], 92)).toEqual(['context-full'])
})

test('the files of a sound: its own name, a dash and digits, wav or mp3, and no other sound', async () => {
  const names = ['success.wav', 'success-01.mp3', 'Success-2.WAV', 'success-final.mp3', 'success-01.ogg', 'success.txt', 'limit-5h.wav', 'limit.mp3', 'limit-02.wav', 'xsuccess.wav', 'done.wav']
  expect(variantsOf(names, 'success')).toEqual(['Success-2.WAV', 'success-01.mp3', 'success.wav'])
  // limit-5h is a sound of its own, not variant 5h of limit.
  expect(variantsOf(names, 'limit')).toEqual(['limit-02.wav', 'limit.mp3'])
  expect(variantsOf(names, 'limit-5h')).toEqual(['limit-5h.wav'])
  expect(variantsOf(names, 'attention')).toEqual([])
})

test('one of the files is picked at random, not the one that played last', async () => {
  const files = ['a.wav', 'b.mp3', 'c.wav']
  expect(pickVariant([])).toBeUndefined()
  expect(pickVariant(['a.wav'], 'a.wav')).toBe('a.wav')
  // The random number picks inside what is left after the last one.
  expect(pickVariant(files, undefined, () => 0)).toBe('a.wav')
  expect(pickVariant(files, undefined, () => 0.99)).toBe('c.wav')
  expect(pickVariant(files, 'a.wav', () => 0)).toBe('b.mp3')
  expect(pickVariant(files, 'c.wav', () => 0.99)).toBe('b.mp3')
  // A random number of exactly 1 does not run off the end.
  expect(pickVariant(files, undefined, () => 1)).toBe('c.wav')
  for (let i = 0; i < 50; i++) expect(pickVariant(files, 'b.mp3')).not.toBe('b.mp3')
})

test('the player is one of our scripts with one argument, never a shell line', async () => {
  const win = playerArgv('windows', 'C:/p', 'C:/s/done.wav')
  expect(win.slice(0, 4)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy'])
  expect(win.slice(-4)).toEqual(['-File', 'C:/p/scripts/play.ps1', '-Path', 'C:/s/done.wav'])
  expect(playerArgv('macos', '/p', '/s/done.wav')).toEqual(['bash', '/p/scripts/play.sh', '/s/done.wav'])
  expect(playerArgv('linux', '/p', '/s/done.wav')).toEqual(['bash', '/p/scripts/play.sh', '/s/done.wav'])
})

test('a test run behind a pipe or || is judged by its output, since the status is the last command of the chain', async () => {
  expect(testOutcome('pytest test -v 2>&1 | tail -n 100', '3 failed, 1 passed in 0.2s', false)).toBe('fail')
  expect(testOutcome('pytest -q 2>&1 | tail', '5 passed in 0.1s', false)).toBe('pass')
  expect(testOutcome('pytest -q 2>&1 | tail', 'collected 0 items', false)).toBe(undefined)
  expect(testOutcome('npm test || true', '', false)).toBe(undefined)
  expect(testOutcome('npm test || true', 'Tests: 1 failed', false)).toBe('fail')
  expect(testOutcome('cd app; npm test', 'Tests: 4 passed', false)).toBe('pass')
  // Without a mask the exit status is the test's own.
  expect(testOutcome('npm test', '', false)).toBe('pass')
  expect(testOutcome('npm test', '', true)).toBe('fail')
  // Words that are not failures do not fail a run: "0 failed", "failed to connect" on the way to a pass.
  expect(testOutcome('pytest', '0 failed, 4 passed', false)).toBe('pass')
  expect(testOutcome('npm test', 'failed to connect to the cache, retrying\nTests: 3 passed', false)).toBe('pass')
  expect(testOutcome('jest', 'FAIL src/a.test.js', false)).toBe('fail')
})

test('a test runner is named where a command starts, not anywhere in the line', async () => {
  for (const no of ['echo pytest', 'pip install pytest', 'npm install jest', 'ls | grep pytest', 'python -c "import pytest"']) expect(isTestCommand(no)).toBe(false)
  for (const yes of ['cd app && pytest', 'uv run pytest -q', 'npx vitest run', 'python -m pytest']) expect(isTestCommand(yes)).toBe(true)
})
