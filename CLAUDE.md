# CLAUDE.md

## What this is

A **TypeScript** mod for [Subway Builder](https://www.subwaybuilder.com) that adds
**draggable map markers** for sketching future stations: each marker has a color,
an icon, an editable label and an optional **1 km influence radius**. React comes from
the host at runtime (never bundled). Conventions mirror the sibling mod
`subway-builder-auto-lines`.

Markers can be organized into **folders** (one per line, say), each foldable and
hideable on its own; and, as an **opt-in** setting, a station the player builds inside
a marker's influence area is **renamed to that marker's label**.

**A folder holds its markers, not the other way round.** `MarkerGroup.markerIds` is an
ordered list of marker ids — that order *is* the line — and the same id may sit in
several folders, because an interchange is on every line that stops there and each of
those lines reaches it at a different point. `Marker.groupId` is legacy: written as a
mirror of the first folder holding a marker (so an older build still opens the board)
and read only to migrate a folder that carries no sequence yet
(`domain/group/LegacyGroupLink`). Dragging a card **moves** it between folders; the
card's folder chips are what put one marker on a second line. A marker leaves the map
only when *every* folder holding it is hidden.

A folder **opens into a view of its own** rather than unfolding in the list, and which
one is open is the panel's own state (the board no longer carries a `collapsed` flag).
That open folder is also where a newly placed marker lands, in the folder's color.

A new marker is **named the way the game names a station** there: `RoadNamer` reads the
game's own `roadsIndex` and `stationNameFromRoads` reproduces the rules taken from the
renderer bundle (`getStationName`/`formatRoadName`) — widening search radii, a
cross-street preference scored against the line's bearing, the suffix abbreviations and
the suffixes that can't stand alone. **How a marker looks follows the folders it is on** (`syncDerivedLooks`, run on every
commit *and* on load): its folder's color and the station icon on one line, black
(`INTERCHANGE_COLOR`) and the interchange icon on two or more. Only what the mod
assigns is traded back and forth — a color or icon that matches no folder is the
player's choice and is kept, which is why recoloring a folder holds its previous color
for exactly one reconciliation (`retiredColors`), so the markers still wearing it are
recognised as having taken it from the folder.

Joining a folder puts a marker where it **lengthens that line least** (cheapest
insertion, `insertionIndexFor`), never at the end — a stop belongs between two others.
Three routes lead there: the card's picker, dropping a new marker **on a line** while
placing it, and **dragging a line onto a marker**. The last two hit-test against the
line *as drawn* (`routeUnderPoint` over `stationPath`), with the tolerance converted
from screen pixels at the current zoom, because pixels are what the player aims with. A folder's markers are
also joined by a **dashed guide line** (`showRouteLines`, on by default): a straight
**platform** at every station — 229 m, measured off the game's own `platformMapItems` —
and cubic Hermite curves between them that leave and enter each platform along its own
direction. All of it is sampled into the geometry, because a GL line layer only joins
vertices with straight segments. Dashed so it never reads as track already built, and
**outlined** in a color taken from `api.ui.getResolvedTheme()` — the outline contrasts
with the map, not with the line, which is what keeps a near-black line readable on a
dark map. Markers outside a folder are never connected. Because marker order **is** the
drawn line, each folder header carries a **sort along the path** action
(nearest-neighbor from every start + 2-opt) — the way a folder filled in some other
order becomes a route.

Unlike auto-lines, this mod **never touches routes, tracks or trains**, and it edits
**stations only** through that one opt-in naming path (off by default) — so none of the
fragile route/crossover/train internals apply here. The game surfaces it needs are the
**map** (`api.utils.getMap()`), the **floating panel** (`api.ui.addFloatingPanel`) and
the **save/load + build hooks** (`api.hooks.*`). The internal store is read for the
loaded save's id and the city code (to scope the board to the current game) and, only
when station naming is on, wrapped to rename a just-placed station — all optional, so a
missing handle just degrades gracefully.

## Layout

DDD under `src/`, bundled by esbuild into one IIFE (`dist/index.js`, gitignored — the
single file the game loads; `install-mod` copies it). **`main.tsx` is the entry**
(composition root): guards `SubwayBuilderAPI`, wires deps, registers the panel, starts
the controller, installs `SaveScopeRegistrar` and `StationNamer`. Layers: `domain/`
(pure marker logic + geometry, no map/DOM/window), `application/` (`MarkerStore`,
`SettingsStore`), `infrastructure/` (the only code that touches the
map/window/storage/React), `presentation/` (the `.tsx` panel), `shared/game/`
(typed game/map contracts).

`MarkerStore` is the **single source of truth**: both the React panel and the
imperative map badges subscribe to it, so a drag on the map and an edit in the panel
can't diverge. `docs/game-internals.md` documents the game surfaces this mod depends on
(mostly the GL map instance) — **read it first**; `docs/inspecting-the-game.md` covers
driving the live game over CDP.

**TypeScript version**: pinned to **5.9** (not 7) so typescript-eslint's type-aware
rules can run.

**Imports use the `@/*` alias for anything under `src/`** (`@/domain/marker/Marker`),
never `../../`. It's declared once in `tsconfig.json` (`paths`), which esbuild reads on
its own; vite doesn't, so `vitest.config.ts` mirrors it in `resolve.alias`. Tests reach
into the mod the same way, and only keep a relative path for a helper sitting next to
them. The alias is a compile-time concept: it's gone from `dist/index.js`.

## Marker scoping — markers belong to a save, not a city

Markers are keyed by the loaded save (`save:<currentSaveInfo.id>`), with a per-city
cache (`recent:<cityCode>`) for continuity: the game reopens the **newest autosave** —
a different file every session — so a save's own bucket is usually empty on load and
inherits from the cache. Load order: **own bucket → city cache → newest bucket of this
city → empty**. That third step exists because the cache went missing a third time
(2026-07-25) even though the mod deletes nothing: every payload now records its `city`
and `savedAt`, so a stranded board is found in whatever bucket still holds it instead of
the map drawing empty. Schema version **stays at 1** — bumping it would discard every
board already on disk. A brand-new
game starts empty and **stops reading the city cache** — it never deletes it — so it
can't inherit the previous game's markers; loading a save (`onGameLoaded`) makes the
cache readable again. `docs/game-internals.md` §4–6 has the why, the hook behaviors and
the accepted trade-off. Folders persist next to the markers, in their own `groups:*`
keys, loaded from the same bucket.

Those buckets live in the game's per-mod file (`<appData>/mod-data/map-markers.json`),
not in `localStorage` — the renderer can't clear it, and that is exactly how the board
went missing. `localStorage` is still **read** (boards drawn before the move; its keys
join `keys()` so the recovery sees them) and never written again. §5 covers the IPC
channels and why `api.storage` can't be used.

> **The mod deletes no marker data, ever.** Opening the game to the main menu fires
> `onGameInit` with no save loaded — the state it comes back in after a crash — and is
> indistinguishable from starting a new game. Deleting the cache there cost the user
> their whole board twice, because it's the only thread holding a board between
> sessions and the game keeps just 2 autosaves per city.

## Station naming — the one place the mod edits the game

Opt-in (`nameStationsFromMarkers`, **off by default** — it changes the game's own
stations). When on, `StationNamer` **wraps the store's `setStations`** (the chokepoint
where a station enters state) and, for a station whose `buildType` is a fresh
`"blueprint"` or is crossing from blueprint to `"constructed"`, sets its `name` to the
nearest visible marker whose influence area covers it. Renaming at `setStations` (not
the `onStationBuilt` hook) means the name appears the instant the **blueprint is placed**,
before construction. Two hard-won facts (`docs/game-internals.md` §7):

- **`updateStationName(id, name)` can't set an arbitrary name** — it re-derives from
  nearby streets and ignores the string. The only way to set a custom name is to commit
  the stations array with that station's `name` changed (`setStations`).
- A **loaded** station is `"constructed"`, so the `buildType` gate leaves it alone; only
  fresh placements are renamed, and once built the player can rename freely.

## The map instance is fetched fresh, never cached

`api.utils.getMap()` can return a **different** instance after a city load, and the
old canvas container (with our badges) is gone. Every layer re-fetches the map each
call; the marker layer rebuilds its overlay + moves its `'move'` listener when it
sees a new instance. A first draw before the style is ready retries on a short
timer. See `docs/game-internals.md`.

## Workflow — verify live when you can

Scripts are in `package.json`. Non-obvious ones: `install-mod` builds + copies into
the game (then enable in Settings > Mods); `package` builds + writes the two release
assets to `dist/release/`; `debug` launches the game with CDP on :9222;
`node scripts/cdp-eval.mjs --file dist/index.js` re-injects the bundle live.

Run `npm run typecheck` and `npm run lint` before trusting a build — esbuild strips
types without checking them (`tsc --noEmit`; esbuild does the emit).

**Tests** live in `tests/`, mirroring `src/`, and run on **vitest + jsdom** with a 90%
coverage floor enforced in `vitest.config.ts` (CI fails under it). Two things make the
setup non-obvious:

- **React comes from the host**, read off `window.SubwayBuilderAPI` at module-init, so
  `tests/setup.ts` installs it there *before* any mod module is imported — hence
  `setupFiles` rather than a per-test hook.
- **Vitest 4 transforms with oxc, not esbuild**, so the JSX pragma lives under `oxc:`
  in the config. esbuild options there are silently ignored.

The map layers are covered against a fake `GlMap`; nothing in the suite needs the real
game. To re-inject over CDP, the IIFE re-runs
`registrar.register()` (unregister-first), so the toolbar button updates in place.

> ### ⚠️ Quitting the game pops a blocking "save progress?" dialog — kill it, don't `quit`
> Same trap as the sibling mods: a graceful quit blocks on a native dialog you
> can't see over CDP, so the old instance survives and the next `npm run debug`
> launches a **second** one (two instances fighting over the CDP port + autosave →
> bogus symptoms). Force-kill before every launch:
> ```bash
> pkill -9 -f "Subway Builder.app/Contents/MacOS" ; sleep 2
> pgrep -fl "Subway Builder.app/Contents/MacOS"   # must print nothing
> npm run debug
> ```

## Pitfalls

- **The badges are a fixed screen size, so they have to leave when the map zooms out.**
  Below the thresholds in `MarkerLayer` a board's worth of them collides into an
  unreadable clump: names go first, then the badges (the folder lines stay — they're
  what an overview is for). A zoom *is* a `'move'`, which is where this is re-applied.
- **A live check driven over CDP has to let React repaint.** Reading the DOM in the
  same evaluate that dispatched the event reads the state before the render, which
  looks exactly like the handler never ran. Dispatch in one call, assert in the next.
  Synthetic `pointerdown`/`pointerup` also leave the drag handlers armed if they don't
  pair up, and the next click anywhere then lands on the badge instead.
- **The toolbar `icon` is a key into the game's curated set** (`MapPin`). An unknown
  key renders **no button** — if it disappears after a game update, check the icon
  key first.
- **A panel registered at mod-load time is wiped on city load.** It's re-registered
  on the lifecycle hooks (unregister-first for a single button).
- **`api.storage` looks like a no-op but isn't — and still can't be used here.** Every
  method bails to the fallback unless `currentModId` is set, and the game only sets it
  while mod code is on the stack (load, and around hook callbacks). A debounced write —
  all of this mod's — has no mod id and is dropped with a `console.warn`; the wrapper
  also returns the raw `{success, value}` envelope. Persist through `ModStorage`, which
  calls the same `mod-storage-*` IPC channels directly. See `docs/game-internals.md` §5.
- **Don't assume hook ordering.** `onGameInit` can fire *before* the city is known,
  so the new-game reset is held until a city code appears — consuming it on the first
  sync silently loses the reset and the new game inherits the old markers.
- **Use `addFloatingPanel`, not `addToolbarPanel`** — the latter's full-screen modal
  backdrop eats the map's wheel/drag events, and this mod needs the map interactive
  with the panel open.
- **No `window.confirm`/`alert`** — a native dialog blocks the renderer and can't be
  dismissed over CDP. The "remove all" uses an inline two-click confirm instead.
- **`reloadMods` stacks the mod** (a fresh bootstrap per call, orphaning the old
  stores/wrappers) and an orphan can persist **stale state** on the next autosave (this
  bit us: hidden-folder flags and a shrunken marker count got written to a save). For
  any live check that reads/writes persisted state, **restart the game** (`npm run
  debug`) for a single clean bootstrap rather than re-injecting over CDP.

## Commits & releases

**Commits follow [Conventional Commits](https://www.conventionalcommits.org)** —
release-please parses the subject to decide the next version, so an unprefixed commit
is invisible to it. Keep the prose style; just prefix the subject: `feat:` (minor),
`fix:`/`chore:` (patch), `docs:`/`refactor:`/`ci:` (no release). `chore:` is a
releasable type here on purpose — `release-please-config.json` lists it under
`changelog-sections` (unhidden), so a lone `chore:` such as a compatibility bump still
cuts a patch release instead of being dropped.

`.github/workflows/release.yml` runs release-please, which opens a release PR
gathering those commits; merging it bumps the version, writes `CHANGELOG.md`, tags,
and the workflow then attaches the Railyard assets (`npm run package`) to the release.
Versions stay in step across `package.json`, `src/manifest.json` (via `extra-files`)
and `.release-please-manifest.json` — never bump them by hand.

The workflow runs on **every push to main**, where it only grooms the release PR —
merging that PR is what tags the release and uploads the assets. The `0.0.0` baseline
in `.release-please-manifest.json` means "nothing released yet", so the first release
is exactly **1.0.0** rather than a bump off the version already in `package.json`.

> `include-component-in-tag: false` is load-bearing: the default prefixes tags with
> the package name (`subway-builder-map-markers-v1.0.0`), and the registry only
> accepts `X.Y.Z` or `vX.Y.Z`.

The repo has **"Allow GitHub Actions to create and approve pull requests"** switched on
(`can_approve_pull_request_reviews`); it's off by default and release-please fails with
`GitHub Actions is not permitted to create or approve pull requests` without it. The
workflow's own `permissions:` block is separate and doesn't cover this.

## Publishing to Railyard

`npm run package` writes the two assets a release needs to `dist/release/`: the flat
ZIP (`index.js` + `manifest.json` at the archive root — the installer looks for the
manifest there and won't strip a wrapping folder) and the **standalone
`manifest.json`**, which the registry reads to check compatibility without pulling the
ZIP. A release missing either asset is rejected. The GitHub release tag must be semver
(`v1.0.0`), and the repo has to be public for the validator to see it.

> ### ⚠️ `manifest.json`'s `id` must equal the Railyard mod id — **not** the game's template style
> The registry validates `manifest.id === <Railyard mod id>` (kebab-case, permanent,
> `map-markers` here) and rejects the reverse-DNS id (`com.author.modname`) that the
> official `template-mod` still ships. Railyard also installs the mod into
> `<mods>/<id>/`, so the id doubles as the folder name. Already-listed mods predating
> the rule are grandfathered — don't copy their manifests.

The manifest must also carry `dependencies` with a `subway-builder` semver range
(`>=1.4.0` — open-ended on purpose: 1.4.x is what the mod was built and verified against,
and no upper bound keeps it installable on later games instead of locking players out on
the next minor); it's required, and `npm run package` refuses to build the assets when
the manifest would fail the registry's checks. Submission itself is an issue form
(**Publish New Mod**) on `Subway-Builder-Modded/registry`; the registry's own
`manifest.json` entry is generated from that form, not committed here.

## Paths & env overrides

The dev scripts read `SB_DATA_DIR` (game data dir; the mod lands in
`<dir>/mods/map-markers/`), `SB_APP` (app bundle) and `SB_DEBUG_PORT` (CDP port,
default 9222), each falling back to the platform default in `scripts/`.
