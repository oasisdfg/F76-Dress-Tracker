# F76 Dress Tracker

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

## Swapping the icons

`Dressicons\` holds one PNG per variant. The filename without its extension is
the id used in `counts.json`. Drop in a replacement PNG under the same name and
the app picks it up on the next launch, with no rebuild. In a packaged build the
folder sits next to the exe at `resources\Dressicons\`, so this works on the
built app too.

Panel order comes from `PANEL_ORDER` in `main.js`. Any PNG not listed there is
appended after the rest, alphabetically.

The dress images are Fallout 76 item renders and belong to Bethesda. They are
here so the app is usable out of the box.

## Building

```
npm install
npm start        run it from source
npm run icon     regenerate build/icon.ico from Dressicons/reddress.png
npm run dist     build the Windows exe into dist/
```

`npm run dist` produces a portable exe and an NSIS installer. The app icon is
generated from the red dress at build time by `scripts/make-icon.js` using pngjs
and png-to-ico, so there is no binary icon committed to the repo.

## How it is put together

Plain HTML, CSS and JavaScript. No framework, no bundler, no runtime
dependencies.

- `main.js` reads the PNGs, passes them to the window as base64 data URLs, and
  owns the saved counts and the timer.
- `preload.js` exposes a small `api` object over `contextBridge`. Context
  isolation is on and node integration is off.
- `renderer/` is the interface, a fixed grid on a matte black window with a
  custom title bar.
- `scripts/make-icon.js` builds the multi resolution `.ico`.

## License

MIT, see [LICENSE](LICENSE).
