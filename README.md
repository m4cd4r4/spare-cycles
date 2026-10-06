# Spare Cycles

A Claude Code mod that reminds you to do a short task you choose (10 push-ups, wash the
dishes, stretch) on a timer. The aim is to take the break while Claude is working, not
while you are.

**Status: the core timer (slice 1a) is in; no UI yet.** It is being built in the open,
one slice at a time. Each slice starts from a brief in [docs/briefs/](docs/briefs/).

## How it works

The mod owns the timer. It writes the current task and when it comes due to
`~/.spare-cycles/state.json`. Any UI that can read a file shows it, and sends Done, Skip
or Snooze back by writing `~/.spare-cycles/action.json`. With several Claude Code
sessions open, only one of them runs the timer.

The first UI is a status bar item in the
[clear-resume](https://github.com/m4cd4r4/clear-resume) VS Code extension. A terminal UI
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

There is no UI yet, so for now the mod only keeps `~/.spare-cycles/state.json` up to
date.

## Licence

MIT
