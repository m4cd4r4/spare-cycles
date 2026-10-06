# Spare Cycles

A Claude Code mod that reminds you to do a short task you choose (10 push-ups, wash the
dishes, stretch) on a timer. The aim is to take the break while Claude is working, not
while you are.

**Status: not built yet.** It is being built in the open, one slice at a time. Each
slice starts from a brief in [docs/briefs/](docs/briefs/).

## How it works

The mod owns the timer. It writes the current task and when it comes due to
`~/.spare-cycles/state.json`. Any UI that can read a file shows it, and sends Done, Skip
or Snooze back by writing `~/.spare-cycles/action.json`. With several Claude Code
sessions open, only one of them runs the timer.

The first UI is a status bar item in the
[clear-resume](https://github.com/m4cd4r4/clear-resume) VS Code extension. A terminal UI
comes later.

## Install

Not yet. Once slice 1 lands:

```
claude plugin marketplace add m4cd4r4/spare-cycles
claude plugin install spare-cycles@spare-cycles --config interval=45 --config snooze=5
```

`interval` and `snooze` are in minutes.

## Licence

MIT
