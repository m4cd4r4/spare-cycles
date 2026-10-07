# Spare Cycles

A Claude Code mod that reminds you to do a short task you choose (10 push-ups, wash the
dishes, stretch) on a timer. The aim is to take the break while Claude is working, not
while you are.

**Status: the core timer (slice 1a) is in, and its first UI (slice 1b, a VS Code status
bar) is merged in clear-resume and ships in its next release.** It is being built in the
open, one slice at a time, each slice starting from a brief in
[docs/briefs/](docs/briefs/). Every slice is built in one long Claude Code session that
[clear-resume](https://github.com/m4cd4r4/clear-resume) keeps going by itself across
automatic clears, and each one is screen-recorded.

## How it works

The mod owns the timer. It writes the current task and when it comes due to
`~/.spare-cycles/state.json`. Any UI that can read a file shows it, and sends Done, Skip
or Snooze back by writing `~/.spare-cycles/action.json`. With several Claude Code
sessions open, only one of them runs the timer.

The first UI is a status bar item in the
[clear-resume](https://github.com/m4cd4r4/clear-resume) VS Code extension: a countdown to
the next task, Done, Skip or Snooze on click, and one notification when a task comes due.
It is off by default; turn on `clearResume.spareCycles` in VS Code settings. A terminal UI
comes later.

## Install

```
claude plugin marketplace add m4cd4r4/spare-cycles
claude plugin install spare-cycles@spare-cycles
```

The install screen asks for the options; change them later in `/config`.

| Option | Default | Meaning |
|---|---|---|
| `interval` | 45 | Minutes from Done or Skip to the next task coming due |
| `snooze` | 5 | Minutes a Snooze pushes the current task back |
| `tasks` | `10 push-ups, Wash the dishes, Stretch for 2 minutes` | Comma-separated, used in order and wrapping round |

### Setting your tasks

Give the list at install, or change it later in `/config`:

```
claude plugin install spare-cycles@spare-cycles --config "tasks=20 squats, Refill water, Walk to the letterbox"
```

Tasks come up one at a time in the order given. Done or Skip moves to the next one, and
the list starts again from the top after the last.

## Licence

MIT
