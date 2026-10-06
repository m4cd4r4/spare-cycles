// The mod: wiring, file I/O and the lock. The timer's logic is in reducer.ts; this file
// reads the clock, the store and the files, feeds them through it and writes back what
// changed.

import type { EngineInterface, Register } from 'claude-code'
import {
  claimLock, configFrom, parseAction, parseLock, parseTimer, reduce, start, stateFile, taskAt,
  type Action, type Config, type Lock, type Timer,
} from './reducer.ts'

const TICK_MS = 2_000
// A lock not renewed for three ticks is taken over.
const STALE_MS = 3 * TICK_MS
const TIMER_KEY = 'timer'

// What one run of the timer needs between ticks. Module variables start over on a
// reload, as the engine's pending timers are cancelled with the old module.
type Run = {
  config: Config
  owner: string
  statePath: string
  actionPath: string
  lockPath: string
  // This process held the lock on its last tick.
  isHolding: boolean
  isTicking: boolean
}

let isStarted = false

// Identifies this process, not the session: set once per process and inherited by
// what it starts, so it survives a hot reload and /clear.
async function ownerId($: EngineInterface): Promise<string> {
  const held = await $.env.get('SPARE_CYCLES_OWNER')
  if (held !== undefined && held !== '') return held
  const minted = crypto.randomUUID()
  await $.env.set('SPARE_CYCLES_OWNER', minted)
  return minted
}

async function folder($: EngineInterface): Promise<string | null> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home === undefined || home === '' ? null : `${home.replace(/[\\/]+$/, '')}/.spare-cycles`
}

async function readAction($: EngineInterface, path: string): Promise<Action | null> {
  if (!(await $.fs.exists(path))) return null
  const text = await $.fs.read(path).catch(() => null)
  return typeof text === 'string' ? parseAction(text) : null
}

async function readLock($: EngineInterface, path: string): Promise<Lock | null> {
  if (!(await $.fs.exists(path))) return null
  const text = await $.fs.read(path).catch(() => null)
  return typeof text === 'string' ? parseLock(text) : null
}

async function tick($: EngineInterface, run: Run): Promise<void> {
  const { config } = run
  const now = await $.clock.now()

  // Only the lock's holder runs the timer; the others check again next tick.
  const claim = claimLock(await readLock($, run.lockPath), run.owner, now, STALE_MS)
  if (!claim.isHeld) {
    run.isHolding = false
    return
  }
  await $.fs.write(run.lockPath, `${JSON.stringify(claim.lock)}\n`)
  const isTakingOver = !run.isHolding
  run.isHolding = true

  const stored = parseTimer(await $.store.get(TIMER_KEY))
  let timer: Timer = stored ?? start(config, now)
  let isChanged = stored === null

  const action = await readAction($, run.actionPath)
  if (action !== null) {
    const step = reduce(timer, { type: 'action', action, now }, config)
    timer = step.timer
    isChanged ||= step.isChanged
  }
  const step = reduce(timer, { type: 'tick', now }, config)
  timer = step.timer
  isChanged ||= step.isChanged

  if (isChanged) await $.store.set(TIMER_KEY, timer)
  if (isChanged || isTakingOver) {
    const state = stateFile(timer, config, run.owner, now)
    await $.fs.write(run.statePath, `${JSON.stringify(state, null, 2)}\n`)
  }
  if (step.isComingDue) $.ui.toast(`Spare cycles: ${taskAt(config, timer.taskIndex)}`)
}

// One tick at a time: a slow one makes the next period skip rather than overlap.
async function guardedTick($: EngineInterface, run: Run): Promise<void> {
  if (run.isTicking) return
  run.isTicking = true
  try {
    await tick($, run)
  } catch (error) {
    $.ui.log(`spare-cycles: tick failed: ${String(error)}`, { to: 'debug' })
  } finally {
    run.isTicking = false
  }
}

async function begin($: EngineInterface, config: Config): Promise<void> {
  const dir = await folder($)
  if (dir === null) {
    $.ui.log('spare-cycles: neither USERPROFILE nor HOME is set; the timer is off.', { to: 'debug' })
    return
  }
  const run: Run = {
    config,
    owner: await ownerId($),
    statePath: `${dir}/state.json`,
    actionPath: `${dir}/action.json`,
    lockPath: `${dir}/lock.json`,
    isHolding: false,
    isTicking: false,
  }
  await guardedTick($, run)
  $.clock.every(TICK_MS, () => void guardedTick($, run))
}

// Start on the first event the mod sees. session.start fires once per process and
// on each reload, never on /clear; the interval runs on through a /clear.
function ensureStarted($: EngineInterface, config: Config): void {
  if (isStarted) return
  isStarted = true
  void begin($, config).catch(error => {
    isStarted = false
    $.ui.log(`spare-cycles: could not start: ${String(error)}`, { to: 'debug' })
  })
}

export const register: Register = (on, options) => {
  const config = configFrom(options)

  on('session.start', ($, e, next) => {
    ensureStarted($, config)
    return next(e)
  })
  on('prompt.submit', ($, e, next) => {
    ensureStarted($, config)
    return next(e)
  })
}
