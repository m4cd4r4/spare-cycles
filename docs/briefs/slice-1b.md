# Slice 1b: the VS Code status bar

Show the Spare Cycles timer in the clear-resume VS Code extension: a status bar countdown
for the current task, a Done / Skip / Snooze picker, and one notification when a task comes
due. This slice is built in the `clear-resume` repo, under `extension/`. The mod from slice
1a is installed in this session and owns the timer. The extension only reads its state and
writes the person's choice back.

Commit at each working step: the setting, the state reader and its tests, the status bar
item, the picker, the notification, the README entry. Small commits, each one passing
`npm test`.

## Starting point

A rough version already exists as a probe, on a branch that is not merged:
[extension/src/spare-status.ts @ 12d1bae](https://github.com/m4cd4r4/clear-resume/blob/12d1bae/extension/src/spare-status.ts).
It drew the countdown and wrote Done back. Port it to `main` with these changes:

| Probe | This slice |
|---|---|
| Files in `storeRoot()/spare-cycles`, under the clear-resume store | Files in `~/.spare-cycles/` (`os.homedir()`), the folder the mod writes. No import from the store package. |
| Always on | Off by default, behind a new boolean setting `clearResume.spareCycles`. Turning it on or off takes effect without a reload. |
| Notifies again after a window reload, and in every open window | Notifies once per due task: remember the `dueAt` it last notified for in `context.globalState`, which all windows share. |
| Parsing and formatting mixed into the VS Code code | Reading `state.json` and formatting the countdown live in a small module with no `vscode` import, so they can be unit tested. |

## Files (written by the mod, unchanged from slice 1a)

```jsonc
// ~/.spare-cycles/state.json: the mod writes it, the extension only reads it
{ "version": 1, "task": "Wash the dishes", "dueAt": 1759712345000, "isDue": false,
  "lastAction": "done: 10 push-ups", "owner": "<process id>", "updatedAt": 1759712300000 }

// ~/.spare-cycles/action.json: the extension writes it
{ "action": "done" | "skip" | "snooze", "at": 1759712400000 }
```

Ignore a `state.json` that is missing, unreadable, or has a `version` other than 1: hide
the item rather than show an error.

## Behaviour

- **Counting:** `$(watch) 1:42 Wash the dishes`, updated every second.
- **Due:** `$(bell) Wash the dishes: now` on the warning background, plus one notification
  with Done / Skip / Snooze buttons.
- **Click:** a quick-pick with Done, Skip and Snooze. The choice is written to
  `action.json` with the current time as `at`. The bar updates when the mod rewrites
  `state.json`, not before.
- **Tooltip:** the last action, from `lastAction`.
- **Setting off:** no item, no watcher, no notification.

## Do not

- Start `claude -p` (or any other Claude process) from this session. The mod identifies
  its owner by an environment variable that child processes inherit, so a child would
  also write `state.json`.
- Change the mod. Its repo is cloned next to this one for reference only.
- Publish the extension or bump its version.

## How to check it

1. `npm test` passes, including new tests for the state reader (valid file, missing file,
   bad JSON, wrong version) and the countdown format (over a minute, under a minute, past
   due).
2. `npm run build --prefix extension` succeeds.
3. Package and install it: `npx @vscode/vsce package --no-dependencies` in `extension/`,
   then install the `.vsix`, reload the window and reopen the Claude panel.
4. Turn on `clearResume.spareCycles`. The countdown appears in the status bar next to the
   relay item and ticks down.
5. When it reaches zero the item turns to the due state and one notification appears.
   Reloading the window does not show it again.
6. Click the item and pick Done. `state.json` moves to the next task within a few seconds,
   and the bar shows the new countdown.
