# CLAUDE.md

## What this is

A **TypeScript** mod for [Subway Builder](https://www.subwaybuilder.com) that adds
**draggable map markers** for sketching future stations (color, icon, label, optional
**1 km influence radius**). React comes from the host at runtime (never bundled).
Conventions mirror the sibling mod `subway-builder-auto-lines`.

**A folder holds its markers, not the other way round.** `MarkerGroup.markerIds` is an
ordered list of marker ids — that order *is* the line — and the same id may sit in
several folders, because an interchange is on every line that stops there, each reaching
it at a different point. `Marker.groupId` is legacy: written as a mirror of the first
folder holding a marker (so an older build still opens the board) and read only to
migrate a folder with no sequence yet (`domain/group/LegacyGroupLink`). A marker leaves
the map only when *every* folder holding it is hidden.

A new marker is **named the way the game names a station**: `stationNameFromRoads`
reproduces the renderer bundle's `getStationName`/`formatRoadName` over `roadsIndex`.

**How a marker looks follows its folders** (`syncDerivedLooks`, on every commit *and* on
load): the folder's color and station icon on one line, black (`INTERCHANGE_COLOR`) and
the interchange icon on two or more. Only what the mod assigns is traded back and forth —
a color or icon matching no folder is the player's choice and is kept, which is why
recoloring a folder holds its previous color for exactly one reconciliation
(`retiredColors`), so markers still wearing it are recognised as having taken it from
the folder.

Joining a folder inserts a marker where it **lengthens that line least**
(`insertionIndexFor`), never at the end — a stop belongs between two others. Dropping a
marker on a line and dragging a line onto a marker hit-test the line *as drawn*
(`routeUnderPoint` over `stationPath`), with the tolerance converted from screen pixels
at the current zoom, because pixels are what the player aims with. The **dashed guide
line** (`showRouteLines`) draws a straight 229 m **platform** per station (measured off
the game's own `platformMapItems`) joined by Hermite curves, all sampled into the
geometry because a GL line layer only joins vertices with straight segments. Dashed so
it never reads as built track; **outlined** in a color from `api.ui.getResolvedTheme()`
that contrasts with the map, not the line, so a near-black line stays readable on a dark
map. Since order **is** the line, "sort along the path" (`PathOrder`) is how a folder
filled in some other order becomes a route.

Unlike auto-lines, this mod **never touches routes, tracks or trains**, and edits
**stations only** through the one opt-in naming path — so none of the fragile
route/crossover/train internals apply. Every use of the internal store (save id, city
code, the naming wrapper) is optional; a missing handle degrades gracefully.

## Layout

esbuild bundles `src/` into one IIFE, `dist/index.js` (gitignored), the single file the
game loads. `domain/` stays pure (no map/DOM/window); `infrastructure/` is the only layer
that touches the map/window/storage/React. `MarkerStore` is the **single source of
truth**: the React panel and the imperative map badges both subscribe to it, so a drag on
the map and an edit in the panel can't diverge.

`docs/game-internals.md` documents the game surfaces this mod depends on — **read it
first**; `docs/inspecting-the-game.md` covers driving the live game over CDP.
**TypeScript is pinned to 5.9** (not 7) so typescript-eslint's type-aware rules can run.

**Imports use the `@/*` alias for anything under `src/`**, never `../../` — tests too,
except for a helper sitting next to them. Declared in `tsconfig.json` (`paths`), which
esbuild reads; vite doesn't, so `vitest.config.ts` mirrors it in `resolve.alias`.

## Marker scoping — markers belong to a save, not a city

Markers are keyed by the loaded save (`save:<currentSaveInfo.id>`), with a per-city
cache (`recent:<cityCode>`): the game reopens the **newest autosave** — a different file
every session — so a save's own bucket is usually empty on load and inherits from the
cache. Load order: **own bucket → city cache → newest bucket of this city → empty**. The
third step exists because the cache went missing a third time (2026-07-25) even though
the mod deletes nothing: every payload records its `city` and `savedAt`, so a stranded
board is found in whatever bucket still holds it. Schema version **stays at 1** — bumping
it would discard every board on disk. A brand-new game starts empty and **stops reading
the city cache** (never deletes it) so it can't inherit the previous game's markers;
loading a save (`onGameLoaded`) makes it readable again. Folders persist in their own
`groups:*` keys in the same bucket. Why and trade-offs: `docs/game-internals.md` §4–6.

The buckets live in the game's per-mod file (`<appData>/mod-data/map-markers.json`), not
`localStorage` — the renderer can't clear the file, and a cleared `localStorage` is how
the board went missing. `localStorage` is still **read** (pre-move boards; its keys join
`keys()` so recovery sees them) and never written. §5 covers the IPC channels.

> **The mod deletes no marker data, ever.** Opening the game to the main menu fires
> `onGameInit` with no save loaded — the state after a crash — indistinguishable from a
> new game. Deleting the cache there cost the user their whole board twice: it's the only
> thread holding a board between sessions, and the game keeps just 2 autosaves per city.

## Station naming — the one place the mod edits the game

Opt-in (`nameStationsFromMarkers`, **off by default**). `StationNamer` **wraps the
store's `setStations`** (the chokepoint where a station enters state) and renames a
station that is a fresh `"blueprint"` or crossing from blueprint to `"constructed"` to the
nearest visible marker covering it. Hooking `setStations` rather than `onStationBuilt`
shows the name the instant the **blueprint is placed**. Hard-won facts (§7):

- **`updateStationName(id, name)` can't set an arbitrary name** — it re-derives from
  nearby streets and ignores the string. Only committing the stations array with the
  `name` changed (`setStations`) works.
- A **loaded** station is `"constructed"`, so the gate leaves it alone; once built the
  player can rename freely.

## Workflow — verify live when you can

`install-mod` builds and copies into the game (then enable in Settings > Mods); `debug`
launches the game with CDP on :9222; `node scripts/cdp-eval.mjs --file dist/index.js`
re-injects the bundle live — the IIFE re-runs `registrar.register()` (unregister-first),
so the toolbar button updates in place.

Run `npm run typecheck` and `npm run lint` before trusting a build — esbuild strips types
without checking them. **Tests** (`tests/`, mirroring `src/`, vitest + jsdom) have a 90%
coverage floor in `vitest.config.ts` that CI enforces. Non-obvious:

- **React comes from the host**, read off `window.SubwayBuilderAPI` at module-init, so
  `tests/setup.ts` installs it *before* any mod module is imported — hence `setupFiles`.
- **Vitest 4 transforms with oxc, not esbuild**: the JSX pragma lives under `oxc:`;
  esbuild options there are silently ignored.

> ### ⚠️ Quitting the game pops a blocking "save progress?" dialog — kill it, don't `quit`
> A graceful quit blocks on a native dialog you can't see over CDP, so the old instance
> survives and the next `npm run debug` launches a **second** one (fighting over the CDP
> port + autosave → bogus symptoms). Force-kill the game process (and confirm none is
> left) before every `npm run debug`.

## Pitfalls

- **The map instance is fetched fresh, never cached.** `api.utils.getMap()` can return a
  **different** instance after a city load, and the old canvas container (with our
  badges) is gone. Every layer re-fetches it each call; the marker layer rebuilds its
  overlay and moves its `'move'` listener on a new instance. A first draw before the
  style is ready retries on a short timer.
- **Badges are a fixed screen size, so they leave when the map zooms out** (thresholds in
  `MarkerLayer`): names go first, then badges; folder lines stay. A zoom *is* a `'move'`,
  which is where this is re-applied.
- **A live CDP check has to let React repaint.** Reading the DOM in the same evaluate that
  dispatched the event reads pre-render state, which looks like the handler never ran —
  dispatch in one call, assert in the next. Unpaired synthetic `pointerdown`/`pointerup`
  leave drag handlers armed, so the next click anywhere lands on the badge.
- **The toolbar `icon` is a key into the game's curated set** (`MapPin`). An unknown key
  renders **no button** — check it first if the button vanishes after a game update.
- **A panel registered at mod-load time is wiped on city load**, so it's re-registered on
  the lifecycle hooks (unregister-first for a single button).
- **`api.storage` can't be used here.** Every method bails to the fallback unless
  `currentModId` is set, which the game does only while mod code is on the stack (load,
  hook callbacks). A debounced write — all of this mod's — has no mod id and is dropped
  with a `console.warn`; the wrapper also returns the raw `{success, value}` envelope.
  Persist through `ModStorage`, which calls the same `mod-storage-*` IPC channels
  directly (§5).
- **Don't assume hook ordering.** `onGameInit` can fire *before* the city is known, so
  the new-game reset is held until a city code appears — consuming it on the first sync
  silently loses the reset and the new game inherits the old markers.
- **Use `addFloatingPanel`, not `addToolbarPanel`** — the latter's full-screen modal
  backdrop eats the map's wheel/drag events, and the map must stay interactive.
- **No `window.confirm`/`alert`** — a native dialog blocks the renderer and can't be
  dismissed over CDP ("remove all" uses an inline two-click confirm).
- **`reloadMods` stacks the mod** (a fresh bootstrap per call, orphaning old
  stores/wrappers), and an orphan can persist **stale state** on the next autosave (this
  wrote hidden-folder flags and a shrunken marker count to a save). For any live check of
  persisted state, **restart the game** (`npm run debug`) instead of re-injecting.

## Commits & releases

**Commits follow [Conventional Commits](https://www.conventionalcommits.org)** —
release-please parses the subject, so an unprefixed commit is invisible to it. Keep the
prose style; just prefix: `feat:` (minor), `fix:`/`perf:`/`revert:`/`chore:` (patch).
Every other type is `hidden` in `release-please-config.json`'s `changelog-sections`, so
it never reaches the changelog or cuts a release on its own; `chore:` stays visible on
purpose, so a lone compatibility bump still cuts a patch.

`release.yml` keeps a release PR groomed on every push to main; merging it bumps the
version, writes `CHANGELOG.md`, tags, and attaches the Railyard assets (`npm run
package`). Versions stay in step across `package.json`, `src/manifest.json`
(`extra-files`) and `.release-please-manifest.json` — never bump them by hand.

> `include-component-in-tag: false` is load-bearing: the default prefixes tags with the
> package name (`subway-builder-map-markers-v1.0.0`); the registry only accepts `X.Y.Z`
> or `vX.Y.Z`.

The repo has **"Allow GitHub Actions to create and approve pull requests"** on (off by
default); without it release-please fails with `GitHub Actions is not permitted to create
or approve pull requests`. The workflow's `permissions:` block doesn't cover this.

## Publishing to Railyard

`npm run package` writes both assets a release needs to `dist/release/`: the flat ZIP
(`index.js` + `manifest.json` at the root — the installer won't strip a wrapping folder)
and the **standalone `manifest.json`**, which the registry reads to check compatibility
without the ZIP. A release missing either is rejected; the tag must be semver (`v1.0.0`)
and the repo public. `npm run package` refuses to build when the manifest would fail the
registry's checks.

> ### ⚠️ `manifest.json`'s `id` must equal the Railyard mod id — **not** the template style
> The registry requires `manifest.id === <Railyard mod id>` (kebab-case, permanent,
> `map-markers` here) and rejects the reverse-DNS id the official `template-mod` ships.
> Railyard installs into `<mods>/<id>/`, so the id is also the folder name. Already-listed
> mods predating the rule are grandfathered — don't copy their manifests.

`dependencies` must carry a `subway-builder` range: `>=1.4.0`, open-ended on purpose —
1.4.x is what the mod was verified against, and no upper bound keeps it installable on
later games. Submission is the **Publish New Mod** issue form on
`Subway-Builder-Modded/registry`, which generates the registry entry (not committed here).
