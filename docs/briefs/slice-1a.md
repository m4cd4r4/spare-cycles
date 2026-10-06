# Slice 1a: the timer core

Build the timer as a Claude Code mod, with its logic in a pure reducer covered by unit
tests. No UI in this slice: the core writes a state file, and reads an action file that a
UI will write later.

Commit at each working step: the reducer, its tests, the file I/O, the lock, the
packaging. Small commits, each one passing its tests.

## Layout

This repo is a plugin marketplace with one plugin, so it installs with
`claude plugin marketplace add m4cd4r4/spare-cycles` and then
`claude plugin install spare-cycles@spare-cycles`.

```
.claude-plugin/marketplace.json   marketplace "spare-cycles", one plugin, source ./plugin
plugin/.claude-plugin/plugin.json plugin "spare-cycles", MIT, with userConfig (below)
plugin/hooks/hooks.json           { "modules": ["./core.ts"] }
plugin/hooks/core.ts              the mod: wiring, file I/O, lock
plugin/hooks/reducer.ts           pure logic, no I/O, no clock
test/reducer.test.ts              node --test (Node 22.6+ runs .ts directly)
```

The mod reads its options from `register(on, options)`.

## Options (plugin `userConfig`)

| Name | Type | Default | Meaning |
|---|---|---|---|
| `interval` | number | 45 | Minutes from Done or Skip to the next task coming due |
| `snooze` | number | 5 | Minutes a Snooze pushes the current task back |
| `tasks` | string | `10 push-ups, Wash the dishes, Stretch for 2 minutes` | Comma-separated task list, used in order and wrapping round |

## Files

Both live in `~/.spare-cycles/`. Take the home folder from the `USERPROFILE` or `HOME`
environment variable through `$.env.get`, never a hard-coded path.

```jsonc
// state.json: the core writes it, nothing else does
{ "version": 1, "task": "Wash the dishes", "dueAt": 1759712345000, "isDue": false,
  "lastAction": "done: 10 push-ups", "owner": "<process id>", "updatedAt": 1759712300000 }

// action.json: a UI writes it
{ "action": "done" | "skip" | "snooze", "at": 1759712400000 }
```

The core applies an action only when its `at` is newer than the last one it applied, so
an old file left on disk does nothing.

## Behaviour

- **Done or Skip:** move to the next task, due `interval` minutes from now.
- **Snooze:** keep the task, due `snooze` minutes from now.
- **Coming due:** `isDue` turns true once, and `state.json` is rewritten at that moment.
- **One owner.** Several sessions may load the mod at once; only one runs the timer. Use
  a lock file in `~/.spare-cycles/` holding the owner and a heartbeat. A lock whose
  heartbeat is stale is taken over. Keep the timer state in `$.store`, so a new owner
  carries on from where the last one stopped rather than restarting the interval.
- **Survives `/clear`.** `session.start` does not fire again after a `/clear`, and the
  session id changes. So start the timer on the first event the mod sees, not on
  `session.start`, and identify the owner by process, not by session.

## Out of scope

Any UI (status bar, terminal band, toasts beyond one when a task comes due), and moving a
task earlier when Claude is working on its own. Those are later slices.

## How to check it

1. `node --test test/` passes. The reducer tests cover Done, Skip, Snooze, coming due,
   wrapping round the task list, and an action whose `at` is not newer than the last.
2. Run the mod with `claude --plugin-dir ./plugin`. `~/.spare-cycles/state.json` appears.
   Write an `action.json` by hand with `"action": "done"` and a current `at`, and
   `state.json` moves to the next task within a few seconds.
3. Open a second session on the mod. `owner` in `state.json` does not change, and only
   one process writes the file.
4. Type `/clear` in the owning session. The timer keeps its `dueAt` and the lock stays
   held.
