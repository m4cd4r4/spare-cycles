# Slice 3: pull the task earlier while Claude works on its own

The point of Spare Cycles is to take the break while Claude is working, not while you are.
This slice makes the timer notice when Claude is working on its own and bring the next task
due earlier, never sooner than a minimum gap after the last one. Every decision is logged,
so a wrong pull can be traced. This slice is built in this repo, in the mod under `plugin/`.

Commit at each working step: the reducer change and its tests, the option, the signal, the
pull file, the log, the README entry. Small commits, each one passing `npm test`.

## The signal

Claude counts as working on its own when a tool call arrives **3 minutes or more after the
person's last prompt** in that session. A new prompt from the person resets it. Watch
`prompt.submit` for the last prompt and `tool.call` for the calls; pass both on with
`next(e)` untouched.

A prompt the clear-resume relay sends after a `/clear` is not the person. Find out whether
the mod can tell one apart (the event, its text, or the relay's state file). If it can,
do not let it reset the signal. If it cannot, say so in the README as a known limit.

## Any session signals, the owner decides

The session doing the work may not be the one holding the lock. So any session that sees
the signal writes `~/.spare-cycles/pull.json`, at most once a minute:

```jsonc
// ~/.spare-cycles/pull.json: written by any session that sees the signal
{ "at": 1759712400000 }
```

The owner reads it on each tick, like `action.json`, and acts only when `at` is newer than
the last pull it applied. Never write the pull into `action.json`: it would overwrite a
Done or Skip the person just pressed.

## The rule

A new option `min_gap`, in minutes, default 20, next to `interval` and `snooze`.

On a pull, while the task is not yet due: `earliest` is the time of the last Done or Skip
(or the timer's start) plus `min_gap`. If the current `dueAt` is later than `earliest`, it
moves to `max(now, earliest)`. A pull never moves `dueAt` later, and does nothing while a
task is due or snoozed. Put this in `reducer.ts` as a new event, with unit tests.

`state.json` stays version 1 and gains one optional field, `pulledAt`, the time of the
last pull that moved `dueAt`. UIs that do not know it ignore it.

## The log

Append one JSON line per pull the owner reads to `~/.spare-cycles/pulls.jsonl`: the time,
the old and new `dueAt`, and the outcome (`pulled`, or ignored with the reason: `due`,
`snoozed`, `within-gap`, `stale`). Keep the last 500 lines.

## Do not

- Add anything to Claude's system prompt, or a tool for Claude to call. Detection is by
  time only.
- Change the file formats beyond `pull.json`, `pulls.jsonl` and `pulledAt`.
- Start `claude -p` (or any other Claude process) from this session. The owner id is an
  environment variable that child processes inherit, so a child would also write
  `state.json`.
- Publish the mod anywhere.

## How to check it

1. `npm test` passes, including new reducer tests: a pull moves `dueAt` to now when past
   the gap; to `earliest` when inside it; does nothing when due, snoozed, already earlier,
   or not newer than the last pull.
2. Run the mod with `claude --plugin-dir ./plugin` and `min_gap` and the 3-minute signal
   shortened for the test. Give Claude a task that runs tool calls for several minutes
   without you typing. `pull.json` appears, `dueAt` in `state.json` moves earlier, and
   `pulls.jsonl` has a `pulled` line.
3. Type a prompt during the run. No new pull is written until the signal builds up again.
4. Press Done, then let Claude run again. No pull moves `dueAt` before `min_gap` has
   passed, and the log shows `within-gap`.
5. With two sessions open, the one without the lock does the work. The owner still pulls.
