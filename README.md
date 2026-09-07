# Fallout 76 Dress Tracker

A small Windows desktop app for counting Fallout 76 asylum worker uniform drops.
Ten variants, one click each, plus a stopwatch for how long you have been hunting.

## Using it

- Left click a dress to add one.
- Right click to subtract one. It stops at zero.
- Number keys 1 to 9 and 0 hit the ten panels in grid order.
- **Import** opens a list of every dress with its current count, so you can type
  numbers in directly. Useful if you have been keeping tallies somewhere else.
- **Reset** zeroes every count and the timer, behind a confirmation.

The timer starts when the app opens and adds to a running total, so it carries
across restarts and measures total time spent hunting rather than the current
session. Reset is the only thing that clears it.

Panels run from most common to rarest: weathered, white dirty, white, brown,
green, blue, pink, yellow, forest, red.

## Where your data lives

Everything is stored in `%APPDATA%\Dress Tracker\`:

- `counts.json`, the counts, keyed by icon filename.
- `timer.json`, the accumulated hunting time in milliseconds.

Counts are written shortly after each change, and the timer every ten seconds
and on exit, so closing the app does not lose anything.

## License

MIT, see [LICENSE](LICENSE).
