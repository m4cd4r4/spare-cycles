# Slice 2: the terminal band

Show the Spare Cycles timer inside Claude Code in a terminal and in the Desktop app: a countdown on the status
line under the prompt, and a band above the prompt with Done / Skip / Snooze buttons when a
task comes due. This slice is built in this repo, in the mod under `plugin/`. The timer
from slice 1a does not change; the band and the status line only read `state.json` and
write the person's choice to `action.json`, the same files the VS Code status bar uses.

Commit at each working step: the state reader and its tests, the per-second UI loop, the
status line, the band, the buttons, the README entry. Small commits, each one passing
`npm test`.

## Files (unchanged from slice 1a)

```jsonc
// ~/.spare-cycles/state.json: the timer writes it, the UI only reads it
{ "version": 1, "task": "Wash the dishes", "dueAt": 1759712345000, "isDue": false,
  "lastAction": "done: 10 push-ups", "owner": "<process id>", "updatedAt": 1759712300000 }

// ~/.spare-cycles/action.json: the UI writes it
{ "action": "done" | "skip" | "snooze", "at": 1759712400000 }
```

Ignore a `state.json` that is missing, unreadable, or has a `version` other than 1: show
nothing rather than an error.

## Every session draws, one session owns

Only the lock holder runs the timer, but every open session should show it. So the UI
reads `state.json`, never `$.store`, and runs its own loop in every session, separate from
the timer's tick (which returns early in a session that does not hold the lock). A button
pressed in any session writes `action.json`; the owner applies it on its next tick.

## Behaviour (terminal and Desktop)

Draw only when `e.surface` is `terminal` or `desktop`. The engine does not raise the
`AbovePrompt` band in the VS Code panel, and there the extension's status bar already
shows the timer, so set no status line on `vscode` either.

- **Status line, while counting:** `$.ui.status('⏱ 1:42 Wash the dishes')`, updated once a
  second.
- **Status line, when due:** `🔔 Wash the dishes: now`.
- **Band, only when due:** a `ui.render` hook on `{ component: 'AbovePrompt' }` showing the
  task with three `Button`s: Done, Skip, Snooze. Pressing one writes `action.json` with the
  current time as `at`. The band goes away when the owner rewrites `state.json` with the
  next task, not before. While counting, the hook returns `next(e)` and the band takes no
  room.
- **Survey showing:** when `e.props.hasSurvey` is true, return `next(e)`.
- **The toast** the timer already shows when a task comes due stays as it is.

## How it fits the mod

- The plugin's `hooks/hooks.json` takes one module. Keep one entry point that registers
  both the timer (slice 1a) and the UI, for example by moving `register` into a new
  `hooks/register.tsx` that calls into `core.ts` and a new `hooks/band.tsx`.
- The values the band reads live in atoms (`atom`, `read`, `update` from `'claude-code'`),
  declared in a `types/index.d.ts` contract named in `plugin.json` as `"types"`. A write
  from the per-second loop redraws the band.
- Parsing `state.json` and formatting the countdown go in a module with no engine calls,
  so they can be unit tested, like `reducer.ts`.
- Load the `plugin-authoring` skill for the exact API before writing the band.

## Do not

- Change the timer's logic, the lock, or the file formats.
- Start `claude -p` (or any other Claude process) from this session. The owner id is an
  environment variable that child processes inherit, so a child would also write
  `state.json`.
- Publish the mod anywhere.

## How to check it

1. `npm test` passes, including new tests for the state reader (valid file, missing file,
   bad JSON, wrong version) and the countdown format (over a minute, under a minute, past
   due).
2. `claude plugin validate ./plugin` reports nothing refused.
3. In a terminal, run `claude --plugin-dir ./plugin` with a short interval. The status line
   counts down every second.
4. When the task comes due, the band appears with three buttons. Press Done:
   `state.json` moves to the next task within a few seconds, the band goes away and the
   status line counts down again.
5. Open a second terminal session on the mod. It shows the same countdown, and pressing
   Skip there moves the timer in both.
6. In the VS Code panel, no band and no status line appear from the mod.
