// The timer's logic: pure functions of state, config and time. No I/O, no clock.
// core.ts reads the clock and the files and feeds what it finds through here.

export const MINUTE = 60_000

export const DEFAULT_TASKS = ['10 push-ups', 'Wash the dishes', 'Stretch for 2 minutes']

export type Config = {
  intervalMs: number
  snoozeMs: number
  tasks: readonly string[]
}

// What the core keeps in $.store, so a new owner carries on where the last stopped.
export type Timer = {
  taskIndex: number
  dueAt: number
  isDue: boolean
  lastAction: string | null
  // The `at` of the last action applied; an action not newer than this does nothing.
  lastActionAt: number
}

export type ActionName = 'done' | 'skip' | 'snooze'

export type Action = { action: ActionName; at: number }

export type Event =
  | { type: 'tick'; now: number }
  | { type: 'action'; action: Action; now: number }

export type Step = {
  timer: Timer
  // The timer changed and state.json should be rewritten.
  isChanged: boolean
  // This step is the moment the task came due.
  isComingDue: boolean
}

export function parseTasks(text: unknown): string[] {
  if (typeof text !== 'string') return [...DEFAULT_TASKS]
  const tasks = text.split(',').map(task => task.trim()).filter(task => task !== '')
  return tasks.length > 0 ? tasks : [...DEFAULT_TASKS]
}

export function parseMinutes(value: unknown, fallback: number): number {
  const minutes = typeof value === 'string' ? Number(value) : value
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0
    ? minutes
    : fallback
}

export function configFrom(options: Readonly<Record<string, unknown>>): Config {
  return {
    intervalMs: parseMinutes(options.interval, 45) * MINUTE,
    snoozeMs: parseMinutes(options.snooze, 5) * MINUTE,
    tasks: parseTasks(options.tasks),
  }
}

// An action.json's text, or null when it is not a well-formed action.
export function parseAction(text: string): Action | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { action, at } = value as Record<string, unknown>
  const isKnown = action === 'done' || action === 'skip' || action === 'snooze'
  if (!isKnown || typeof at !== 'number' || !Number.isFinite(at)) return null
  return { action, at }
}

// A timer read back from $.store, or null when it is missing or not a timer.
export function parseTimer(value: unknown): Timer | null {
  if (typeof value !== 'object' || value === null) return null
  const { taskIndex, dueAt, isDue, lastAction, lastActionAt } = value as Record<string, unknown>
  const isTimer =
    Number.isInteger(taskIndex) && (taskIndex as number) >= 0 &&
    typeof dueAt === 'number' && Number.isFinite(dueAt) &&
    typeof isDue === 'boolean' &&
    (lastAction === null || typeof lastAction === 'string') &&
    typeof lastActionAt === 'number' && Number.isFinite(lastActionAt)
  if (!isTimer) return null
  return {
    taskIndex: taskIndex as number,
    dueAt,
    isDue,
    lastAction: lastAction as string | null,
    lastActionAt,
  }
}

export function taskAt(config: Config, index: number): string {
  const tasks = config.tasks.length > 0 ? config.tasks : DEFAULT_TASKS
  return tasks[index % tasks.length] ?? tasks[0] ?? ''
}

// A fresh timer: the first task, due one interval from now.
export function start(config: Config, now: number): Timer {
  return { taskIndex: 0, dueAt: now + config.intervalMs, isDue: false, lastAction: null, lastActionAt: 0 }
}

export function reduce(timer: Timer, event: Event, config: Config): Step {
  const unchanged: Step = { timer, isChanged: false, isComingDue: false }

  if (event.type === 'tick') {
    if (timer.isDue || event.now < timer.dueAt) return unchanged
    return { timer: { ...timer, isDue: true }, isChanged: true, isComingDue: true }
  }

  const { action, now } = event
  if (action.at <= timer.lastActionAt) return unchanged

  const task = taskAt(config, timer.taskIndex)
  const lastAction = `${action.action}: ${task}`
  if (action.action === 'snooze') {
    return {
      timer: { ...timer, dueAt: now + config.snoozeMs, isDue: false, lastAction, lastActionAt: action.at },
      isChanged: true,
      isComingDue: false,
    }
  }
  const taskCount = config.tasks.length > 0 ? config.tasks.length : DEFAULT_TASKS.length
  return {
    timer: {
      taskIndex: (timer.taskIndex + 1) % taskCount,
      dueAt: now + config.intervalMs,
      isDue: false,
      lastAction,
      lastActionAt: action.at,
    },
    isChanged: true,
    isComingDue: false,
  }
}

// The state.json a UI reads.
export type StateFile = {
  version: 1
  task: string
  dueAt: number
  isDue: boolean
  lastAction: string | null
  owner: string
  updatedAt: number
}

export function stateFile(timer: Timer, config: Config, owner: string, now: number): StateFile {
  return {
    version: 1,
    task: taskAt(config, timer.taskIndex),
    dueAt: timer.dueAt,
    isDue: timer.isDue,
    lastAction: timer.lastAction,
    owner,
    updatedAt: now,
  }
}

// lock.json: which process runs the timer, and when it last said it still does.
export type Lock = { owner: string; heartbeat: number }

export type Claim = {
  // The lock as it should stand after this tick; write it when isHeld.
  lock: Lock | null
  // This process runs the timer this tick.
  isHeld: boolean
}

// A lock.json's text, or null when it is not a well-formed lock.
export function parseLock(text: string): Lock | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { owner, heartbeat } = value as Record<string, unknown>
  if (typeof owner !== 'string' || owner === '') return null
  if (typeof heartbeat !== 'number' || !Number.isFinite(heartbeat)) return null
  return { owner, heartbeat }
}

// Keep the lock if it is ours, take it if it is missing or stale, and leave it alone
// if another process holds it. A heartbeat far in the future counts as stale too, so a
// clock that jumped back cannot leave the lock held for ever.
export function claimLock(held: Lock | null, owner: string, now: number, staleMs: number): Claim {
  const isStale = held !== null && (now - held.heartbeat > staleMs || held.heartbeat - now > staleMs)
  if (held === null || held.owner === owner || isStale) {
    return { lock: { owner, heartbeat: now }, isHeld: true }
  }
  return { lock: held, isHeld: false }
}
