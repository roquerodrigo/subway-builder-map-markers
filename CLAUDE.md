# CLAUDE.md

Guidance for working in this repo.

## What this is

A **TypeScript** mod for [Subway Builder](https://www.subwaybuilder.com) that adds
**draggable map markers** for sketching future stations: each marker has a color,
an icon, an editable label and an optional **1 km influence radius**. Authored as a
small **DDD** codebase under `src/` and **bundled by esbuild into one IIFE**
(`dist/index.js`) — the single file the game loads. React comes from the host at
runtime (never bundled). Conventions mirror the sibling mod
`subway-builder-auto-lines`.

Unlike auto-lines, this mod **never touches routes, tracks, trains or stations** —
it only draws its own overlay on the map and owns its own state. So none of the
fragile route/crossover/train internals apply here; the game surfaces it needs are the
**map** (`api.utils.getMap()`), the **floating panel** (`api.ui.addFloatingPanel`) and
the **save/load hooks** (`api.hooks.*`). The internal store is read **only** for the
loaded save's id and the city code — to scope markers to the current game — and is
fully optional.

## Layout

- `src/` — the mod, in TypeScript. **`main.tsx` is the entry** (composition root).
  Layers: `domain/` (pure marker logic + geometry), `application/` (the shared
  `MarkerStore`), `infrastructure/` (the only code that touches the map/window/
  localStorage/React), `presentation/` (the `.tsx` panel), `shared/game/` (typed
  game/map contracts).
- `src/manifest.json` — mod metadata; `main` is `index.js` (the built bundle).
- `dist/index.js` — esbuild output (gitignored); the file `install-mod` copies.
- `scripts/` — `build.mjs` (esbuild → one IIFE, host React external),
  `install-mod.mjs`, `package-release.mjs` (the Railyard release assets), `debug.mjs`,
  `cdp-eval.mjs` (dev workflow, Node, macOS).
- `tsconfig.json` (`tsc --noEmit`; esbuild does the emit), `eslint.config.mjs`
  (flat-config ESLint 9, adapted from `roquerodrigo/nextjs-boilerplate`).
- `docs/game-internals.md` — **the game surfaces this mod depends on** (mostly the
  GL map instance). Read this first. `docs/inspecting-the-game.md` — how to
  inspect/drive the live game over CDP.

**TypeScript version**: pinned to **5.9** (not 7) so typescript-eslint's type-aware
rules can run.

**Imports use the `@/*` alias for anything under `src/`** (`@/domain/marker/Marker`),
never `../../`. It's declared once in `tsconfig.json` (`paths`), which esbuild reads on
its own; vite doesn't, so `vitest.config.ts` mirrors it in `resolve.alias`. Tests reach
into the mod the same way, and only keep a relative path for a helper sitting next to
them. The alias is a compile-time concept: it's gone from `dist/index.js`.

## Code map (`src/`)

**`domain/marker/`** — pure, no map/DOM/window.
- `Marker.ts` — the `Marker` entity + `OPTIMAL_SPACING_FACTOR` (√3, the ideal
  center-to-center spacing as a multiple of the radius).
- `MarkerPalette.ts` — the color swatches. `MarkerIconSet.ts` — the icon set as
  **primitive SVG element descriptors** (not raw path strings), so both renderers
  can build them safely. `MarkerFactory.ts` — `createMarker` (id + defaults).
- `GeodesicCircle.ts` — `geodesicCircle(center, meters)`: a true geographic circle
  polygon (destination-point formula) so the radius scales with zoom.

**`application/`** — `MarkerStore.ts`: the **single source of truth**. Holds the
markers + selection, notifies subscribers on every change, and (debounced) persists
to the current save's bucket. **Both** the React panel and the imperative map
badges subscribe here, so a drag on the map and an edit in the panel can't diverge.
`sync()` (re)loads the markers for whatever save is active; `startNewGame()` resets
for a brand-new game. See **Marker scoping** below.

**`infrastructure/`** — the only code that touches the map/window/storage/React.
- `map/MarkerLayer.ts` — the **draggable DOM badges** on `getCanvasContainer()`,
  re-projected on every map `'move'`; owns its own pointer-drag (disables the map's
  `dragPan` while dragging; a press that doesn't move is a click = select).
- `map/InfluenceRadiusLayer.ts` — the 1 km circles as a GeoJSON `fill`+`line`
  source, data-driven color, retry-until-style-ready (mirrors auto-lines' overlay).
- `map/MapMarkersController.ts` — wires the store to both layers, owns placement
  (`once('click')`) and focus (`easeTo`); `syncToMap()` only re-renders (the markers
  themselves are loaded by the store's own lifecycle wiring).
- `map/iconMarkup.ts` — serializes an icon to an SVG string for the imperative badge
  (the panel renders the same descriptors via `IconGlyph`).
- `persistence/ModStorage.ts` — a small async KV over **localStorage** (`api.storage`
  is a no-op in this build — see `docs/game-internals.md`).
- `persistence/MarkerRepository.ts` — the marker buckets over `ModStorage`, defensive
  reads that heal a malformed payload rather than throwing.
- `save/SaveScopeRegistrar.ts` — wires the save/load hooks to the store.
- `store/GameSession.ts` — optional `saveId()` / `cityCode()` reads. `ui/react.ts`
  (host-React shim), `ui/FloatingPanelRegistrar.ts` (`addFloatingPanel` + lifecycle
  re-register, which also calls `controller.syncToMap()`).

**`presentation/`** — the React panel (function components; hooks required).
`MarkersPanel.tsx` (a factory `createMarkersPanel(deps)`), `components/`
(`MarkerCard`, `ColorSwatches`, `IconPicker`, `IconGlyph`), `hooks/useMarkers.ts`
(subscribes to the store + placement state).

**`main.tsx`** — composition root: guards `SubwayBuilderAPI`, wires deps, registers
the panel, starts the controller.

## Marker scoping — markers belong to a save, not a city

Markers are keyed by the loaded save (`save:<currentSaveInfo.id>`), with a per-city
cache (`recent:<cityCode>`) for continuity: the game reopens the **newest autosave** —
a different file every session — so a save's own bucket is usually empty on load and
inherits from the cache. Load order: **own bucket → city cache → empty**. A brand-new game starts empty and **clears the city cache** so it can't
inherit the previous game's markers. `docs/game-internals.md` §4–6 has the why, the
hook behaviors and the accepted trade-off.

## The map instance is fetched fresh, never cached

`api.utils.getMap()` can return a **different** instance after a city load, and the
old canvas container (with our badges) is gone. Every layer re-fetches the map each
call; the marker layer rebuilds its overlay + moves its `'move'` listener when it
sees a new instance. A first draw before the style is ready retries on a short
timer. See `docs/game-internals.md`.

## Workflow — verify live when you can

```bash
npm run build        # esbuild → dist/index.js
npm run typecheck    # tsc --noEmit (strict; covers tests/ too)
npm run lint         # eslint . (npm run lint:fix to auto-fix)
npm test             # vitest run
npm run test:coverage # vitest + v8 coverage (fails under 90%)
npm run install-mod  # build + copy into the game (enable in Settings > Mods)
npm run package      # build + the two release assets in dist/release/
npm run debug        # launch the game + CDP :9222
node scripts/cdp-eval.mjs --file dist/index.js   # re-inject the bundle live
```

Run `npm run typecheck` and `npm run lint` before trusting a build — esbuild strips
types without checking them.

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

- **The toolbar `icon` is a key into the game's curated set** (`MapPin`). An unknown
  key renders **no button** — if it disappears after a game update, check the icon
  key first.
- **A panel registered at mod-load time is wiped on city load.** It's re-registered
  on the lifecycle hooks (unregister-first for a single button).
- **`api.storage` is a no-op in this build** — a `set` then `get` returns the
  fallback. Persist through `ModStorage` (localStorage), never `api.storage`.
- **Don't assume hook ordering.** `onGameInit` can fire *before* the city is known,
  so the new-game reset is held until a city code appears — consuming it on the first
  sync silently loses the reset and the new game inherits the old markers.
- **Use `addFloatingPanel`, not `addToolbarPanel`** — the latter's full-screen modal
  backdrop eats the map's wheel/drag events, and this mod needs the map interactive
  with the panel open.
- **Don't cache the map instance** (see above).
- **No `window.confirm`/`alert`** — a native dialog blocks the renderer and can't be
  dismissed over CDP. The "remove all" uses an inline two-click confirm instead.

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
(`<=1.4.12`); it's required, and `npm run package` refuses to build the assets when the
manifest would fail the registry's checks. Submission itself is an issue form
(**Publish New Mod**) on `Subway-Builder-Modded/registry`; the registry's own
`manifest.json` entry is generated from that form, not committed here.

## Paths & env overrides

- Game data dir: `SB_DATA_DIR` || `~/Library/Application Support/metro-maker4`
  (mod lands in `<dir>/mods/map-markers/`).
- App bundle: `SB_APP` || `/Applications/Subway Builder.app`.
- CDP port: `SB_DEBUG_PORT` || `9222`.
