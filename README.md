# Map Markers

A mod for [Subway Builder](https://www.subwaybuilder.com) that lets you drop
**draggable markers** on the map to sketch where future stations could go — each
with a **color**, an **icon** and a name, plus an optional **influence radius** to
see a candidate station's walkable catchment.

It never touches routes, tracks, trains or stations: it only draws its own overlay
and owns its own state.

![The markers tab: five markers on the map, each with its own color, icon and
influence circle](docs/images/markers-panel.webp)

![The settings tab: the influence radius, the idle opacity and the display
toggles](docs/images/settings-panel.webp)

## Install

Install **Map Markers** from [Railyard](https://subwaybuildermodded.com), or grab the
ZIP from the [latest release](../../releases/latest) and unpack it into
`<game data>/mods/map-markers/`. Then enable it in **Settings → Mods** and restart the
game. The toolbar button appears once a city is loaded.

## The panel

A toolbar button (icon **MapPin**) in the top-right actions opens a draggable,
resizable window. It leaves the map fully interactive underneath, so you can drag
markers around with it open. Two tabs: **Markers** and **Settings**.

### Markers

**Add one** — click **Add marker**, then click anywhere on the map to drop it (the
pointer carries a marker pin while it's armed). It arrives **named after the streets
around it**, the way the game names a station built there — the street the line crosses
wins, as it does in the game. Drop it **on a folder's line**, or place it while a folder
is open, and it joins that folder: at the point of the line it landed on, in the
folder's color.

**Edit one** — every marker gets a card with its **name**, a row of **color**
swatches and a row of **icons** (station, bus, interchange, point, highlight, flag,
home, work). The badge highlights the marker, the crosshair flies to it, and **✕**
removes it. The selected marker is outlined in its own color, on the card and on the
map alike.

**Move one** — drag its badge on the map. The map won't pan while you drag, and the
influence circle follows in real time.

**Find one** — click its badge on the map and the panel takes you to it: it opens the
folder holding it, scrolls the card into view and opens it on its settings. A card shows
its name until then — the color, icon and folder controls are behind the **⌄** button,
so a board of hundreds stays scrollable.

Zoomed far out the badges step aside (names first, then the badges themselves) so they
can't pile into an unreadable clump; the folder lines stay, which is what an overview
is for.

**Open a folder** — a folder opens into a view of its own (a line has dozens of stops,
so unfolding it in place would bury every other folder), with a **back** button to the
list. Its **color** is set there: the folder's line takes it on the map, and so does
every marker created in the folder.

**Put one marker on several lines** — a station where lines meet belongs to each of
them, and its icon becomes the interchange one as soon as it is on two (back to the
station icon when it comes off one). Any other icon you pick is left alone. The card lists the folders it is on, with a picker to add another and an **✕** on
each to take it off that one; every line it is on runs through it. Dragging a card
between folders **moves** it instead.

You can also do it on the map: **drag a folder's line onto a marker** and that marker
joins the folder. Let go anywhere else and the line snaps back, unchanged.

However a marker joins a folder, it lands where it lengthens that line least — a stop
between the two it belongs between, not tacked onto the end.

**Sort a folder** — the path button in a folder's header reorders its markers along the
shortest path through them. Marker order is the order the folder's line is drawn in, so
this is what turns a folder filled in some other order (alphabetically, say) into a
route. Drag the cards afterwards to correct anything it got wrong.

**Remove all** clears the current game's markers, behind a two-click confirm.

### Settings

Global display settings, applied to every marker:

- **Influence radius** — 100 m to 2000 m, default 500 m (a 1 km diameter). Drawn as
  real geography, so it stays that size on the ground at any zoom.
- **Opacity while the panel is closed** — fades the whole overlay while you play, so
  the markers read as a background sketch. 100% disables the fade.
- **Show influence area** — the radius circle around each marker.
- **Show line paths** — joins the markers of each folder, in the order the panel lists
  them: a straight platform at every station and a smooth dashed curve between them —
  the line to follow when you lay the track. Dashed, so it never reads as track you
  already built, and outlined so it stays readable on a dark or a light map whatever
  color the line is. Markers outside a folder stay unconnected, and hiding a folder
  takes its line down with it.
- **Show spacing guides** — a ring at the ideal distance (√3·R) from each marker.
  Put a neighbor on that ring and two catchments meet with the least overlap that
  still leaves no gap.
- **Magnetic snap** — a dragged marker snaps onto that ideal spacing.
- **Show names** — each marker's name on the map.

## Where your markers live

Markers belong to the **save you have loaded**, so two games in the same city keep
separate sketches and a new game starts clean. Because the game reopens the newest
autosave — a different file each session — a per-city cache carries a game's markers
across sessions. Settings are global. Everything persists in `localStorage`.

## Under the hood

- **Draggable DOM badges** on the map's canvas container, re-projected on every map
  move — the same technique the map library's own markers use.
- **Geodesic circles** for the influence radius (a GeoJSON polygon per marker), so
  1 km is 1 km on the ground rather than a fixed number of screen pixels.
- **Platforms, then curves** for the folder lines: a station reserves the 229 m of
  straight track the game's own platform occupies, aligned with the way the line
  travels, and the gaps between them are cubic Hermite curves that leave and enter each
  platform along its own direction — so there is no kink where a curve meets a station.
  Fitted on a local plane, so nothing is stretched east-west away from the equator.
- **Nearest-neighbor + 2-opt** behind the folder sort: the shortest path through every
  marker is the travelling salesman, so it's a greedy walk from each candidate start
  followed by the reversals that undo the crossings that walk leaves behind.

See [`docs/game-internals.md`](docs/game-internals.md) for the exact game surfaces
this relies on.

## Development

Requires Node. The dev scripts are macOS-only (they use the macOS app paths).

```bash
npm install
npm run install-mod    # build + copy the mod into the game
npm run debug          # relaunch the game with DevTools + a CDP port
npm run play           # install-mod, then debug
npm run package        # build the release assets into dist/release/
npm test               # vitest run
npm run test:coverage  # vitest + coverage (90% floor)
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # eslint .
```

```
subway-builder-map-markers/
├── src/                  # the mod, in TypeScript (bundled to one index.js)
│   ├── manifest.json
│   ├── main.tsx          #   composition root
│   ├── domain/           #   markers, palette, icon set, geodesic circle, spacing,
│   │                     #   folder routes + their smooth curve
│   ├── application/      #   MarkerStore + SettingsStore (shared source of truth)
│   ├── infrastructure/   #   map layers, persistence, save scoping, UI shell
│   └── presentation/     #   the React panel
├── scripts/              # dev workflow (Node, macOS)
│   ├── build.mjs         #   esbuild → dist/index.js (one IIFE)
│   ├── install-mod.mjs   #   copy the built mod into the game
│   ├── package-release.mjs #  the ZIP + standalone manifest for a release
│   ├── debug.mjs         #   relaunch the game with DevTools + a CDP port
│   └── cdp-eval.mjs      #   evaluate JS in the running renderer (inspection)
├── tests/                # vitest + jsdom, mirrors src/ (90% coverage floor)
├── docs/
│   ├── game-internals.md       # the game internals this mod uses
│   └── inspecting-the-game.md  # how to inspect/drive the running game over CDP
└── package.json
```

API reference: <https://www.subwaybuilder.com/docs/v1.0.0/api-reference>

### Paths & overrides

| Var | Default | Used by |
|---|---|---|
| `SB_DATA_DIR` | `~/Library/Application Support/metro-maker4` | `install-mod` (mod lands in `<dir>/mods/map-markers/`) |
| `SB_APP` | `/Applications/Subway Builder.app` | `debug` (the `.app` bundle to launch) |
| `SB_DEBUG_PORT` | `9222` | `debug` / `cdp-eval` (Chrome DevTools Protocol port) |

## Known limitations

- macOS-only dev scripts.
- The map instance and UI API are version-specific; verify against a new game version
  before trusting them. If the toolbar button ever disappears after an update, check
  that the `MapPin` icon key still exists in the game's icon set.

## License

[MIT](LICENSE)
