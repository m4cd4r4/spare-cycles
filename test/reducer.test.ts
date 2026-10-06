import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MINUTE, DEFAULT_TASKS, configFrom, parseAction, parseTasks, parseTimer,
  reduce, start, stateFile, type Config, type Timer,
} from '../plugin/hooks/reducer.ts'

const config: Config = { intervalMs: 45 * MINUTE, snoozeMs: 5 * MINUTE, tasks: ['a', 'b', 'c'] }
const T0 = 1_759_712_300_000

const act = (timer: Timer, action: 'done' | 'skip' | 'snooze', at: number, now = at) =>
  reduce(timer, { type: 'action', action: { action, at }, now }, config)

test('a fresh timer starts on the first task, due one interval out', () => {
  assert.deepEqual(start(config, T0), {
    taskIndex: 0, dueAt: T0 + 45 * MINUTE, isDue: false, lastAction: null, lastActionAt: 0,
  })
})

test('Done moves to the next task, due one interval from now', () => {
  const now = T0 + 10 * MINUTE
  const step = act(start(config, T0), 'done', now)
  assert.equal(step.isChanged, true)
  assert.equal(step.timer.taskIndex, 1)
  assert.equal(step.timer.dueAt, now + 45 * MINUTE)
  assert.equal(step.timer.isDue, false)
  assert.equal(step.timer.lastAction, 'done: a')
  assert.equal(step.timer.lastActionAt, now)
})

test('Skip moves to the next task, due one interval from now', () => {
  const now = T0 + 50 * MINUTE
  const due = { ...start(config, T0), isDue: true }
  const step = act(due, 'skip', now)
  assert.equal(step.timer.taskIndex, 1)
  assert.equal(step.timer.dueAt, now + 45 * MINUTE)
  assert.equal(step.timer.isDue, false)
  assert.equal(step.timer.lastAction, 'skip: a')
})

test('Snooze keeps the task, due snooze minutes from now', () => {
  const now = T0 + 46 * MINUTE
  const due = { ...start(config, T0), isDue: true }
  const step = act(due, 'snooze', now)
  assert.equal(step.isChanged, true)
  assert.equal(step.timer.taskIndex, 0)
  assert.equal(step.timer.dueAt, now + 5 * MINUTE)
  assert.equal(step.timer.isDue, false)
  assert.equal(step.timer.lastAction, 'snooze: a')
})

test('the interval runs from the core\'s now, not from the action\'s at', () => {
  const step = act(start(config, T0), 'done', T0 + MINUTE, T0 + 2 * MINUTE)
  assert.equal(step.timer.dueAt, T0 + 2 * MINUTE + 45 * MINUTE)
  assert.equal(step.timer.lastActionAt, T0 + MINUTE)
})

test('a task comes due once, at its dueAt', () => {
  const timer = start(config, T0)
  const before = reduce(timer, { type: 'tick', now: timer.dueAt - 1 }, config)
  assert.equal(before.isChanged, false)
  assert.equal(before.isComingDue, false)
  assert.equal(before.timer, timer)

  const at = reduce(timer, { type: 'tick', now: timer.dueAt }, config)
  assert.equal(at.isChanged, true)
  assert.equal(at.isComingDue, true)
  assert.equal(at.timer.isDue, true)

  const after = reduce(at.timer, { type: 'tick', now: timer.dueAt + MINUTE }, config)
  assert.equal(after.isChanged, false)
  assert.equal(after.isComingDue, false)
})

test('a task comes due again after a Snooze runs out', () => {
  const due = { ...start(config, T0), isDue: true }
  const snoozed = act(due, 'snooze', T0 + 46 * MINUTE).timer
  const step = reduce(snoozed, { type: 'tick', now: snoozed.dueAt }, config)
  assert.equal(step.isComingDue, true)
})

test('the task list wraps round', () => {
  let timer = start(config, T0)
  const seen: string[] = []
  for (let i = 1; i <= 4; i++) {
    seen.push(stateFile(timer, config, 'me', T0).task)
    timer = act(timer, 'done', T0 + i).timer
  }
  assert.deepEqual(seen, ['a', 'b', 'c', 'a'])
  assert.equal(timer.taskIndex, 1)
})

test('a stored index past a shortened task list still names a task', () => {
  const timer = { ...start(config, T0), taskIndex: 7 }
  assert.equal(stateFile(timer, config, 'me', T0).task, 'b')
  assert.equal(act(timer, 'done', T0 + 1).timer.taskIndex, 2)
})

test('an action whose at is not newer than the last does nothing', () => {
  const applied = act(start(config, T0), 'done', T0 + 5).timer
  for (const at of [T0 + 5, T0 + 4, 0]) {
    for (const action of ['done', 'skip', 'snooze'] as const) {
      const step = act(applied, action, at, T0 + 100)
      assert.equal(step.isChanged, false, `${action} at ${at}`)
      assert.equal(step.timer, applied)
    }
  }
  assert.equal(act(applied, 'done', T0 + 6).isChanged, true)
})

test('an old action.json does nothing to a timer that already applied it', () => {
  // The same file read twice: the second read is a no-op.
  const first = act(start(config, T0), 'skip', T0 + 9)
  const second = reduce(first.timer, { type: 'action', action: { action: 'skip', at: T0 + 9 }, now: T0 + 20 }, config)
  assert.equal(second.isChanged, false)
  assert.equal(second.timer.taskIndex, 1)
})

test('state.json carries the shape the brief gives', () => {
  const timer = act(start(config, T0), 'done', T0 + 1).timer
  assert.deepEqual(stateFile(timer, config, '1234', T0 + 2), {
    version: 1, task: 'b', dueAt: T0 + 1 + 45 * MINUTE, isDue: false,
    lastAction: 'done: a', owner: '1234', updatedAt: T0 + 2,
  })
})

test('options: defaults, minutes, and the comma-separated task list', () => {
  assert.deepEqual(configFrom({}), { intervalMs: 45 * MINUTE, snoozeMs: 5 * MINUTE, tasks: DEFAULT_TASKS })
  const set = configFrom({ interval: 1, snooze: '0.5', tasks: ' Walk ,, Water the plants ,' })
  assert.deepEqual(set, { intervalMs: MINUTE, snoozeMs: 30_000, tasks: ['Walk', 'Water the plants'] })
  assert.equal(configFrom({ interval: 0, snooze: -1 }).intervalMs, 45 * MINUTE)
  assert.equal(configFrom({ snooze: 'soon' }).snoozeMs, 5 * MINUTE)
  assert.deepEqual(parseTasks(' , '), DEFAULT_TASKS)
})

test('action.json: only a known action with a numeric at is read', () => {
  assert.deepEqual(parseAction('{"action":"done","at":5}'), { action: 'done', at: 5 })
  assert.deepEqual(parseAction('{"action":"snooze","at":5,"extra":1}'), { action: 'snooze', at: 5 })
  for (const text of ['', 'not json', 'null', '[]', '{"action":"done"}', '{"action":"later","at":5}',
    '{"action":"done","at":"5"}']) {
    assert.equal(parseAction(text), null, text)
  }
})

test('a stored timer is read back, and anything else is not', () => {
  const timer = act(start(config, T0), 'done', T0 + 1).timer
  assert.deepEqual(parseTimer(JSON.parse(JSON.stringify(timer))), timer)
  for (const value of [undefined, null, 3, {}, { ...timer, taskIndex: -1 }, { ...timer, dueAt: 'x' }]) {
    assert.equal(parseTimer(value), null)
  }
})
