# Subway Builder — internals this mod relies on

Everything Map Markers depends on beyond what's obvious from the public modding
API. Discovered by inspecting the running renderer over CDP (see
[`inspecting-the-game.md`](inspecting-the-game.md)) and by mirroring the sibling
mod `subway-builder-auto-lines`. Treat it as version-specific (built against the
same install that mod targets, game 1.4.x); verify with live probes before
trusting it in a new version.

This mod is deliberately light on internals: it draws its own overlay on the map
and owns its own state. It never edits routes, tracks or trains, so none of the
fragile route/crossover/train machinery the auto-lines mod needs applies here. It
edits **stations** only through one opt-in path — naming a just-placed station after a
nearby marker (§7), off by default.

---

## 1. The map instance — `api.utils.getMap()`

The single most important handle in this mod. `window.SubwayBuilderAPI.utils.getMap()`
returns the live **Mapbox/MapLibre GL** map instance. The mod uses only the
standard GL surface, typed as `GlMap` in `src/shared/game/GlMap.ts`:

- **Overlay drawing** (influence circles): `addSource`, `addLayer`, `getSource`,
  `getLayer`, `setData` on the source, `isStyleLoaded`. Same approach the
  auto-lines preview overlay uses, including the retry-until-style-ready loop.
- **DOM markers**: `getCanvasContainer()` (badges are appended here, exactly like
  the GL libraries' own `Marker`), `project(lngLat) → {x,y}` and
  `unproject([x,y]) → {lng,lat}` to convert between geography and screen pixels,
  `getContainer()` for the pixel origin, and `on('move', …)` to re-project the
  badges every time the map pans/zooms.
- **Interaction**: `dragPan.disable()/enable()` to stop the map panning under a
  marker drag; `once('click', …)` to place a marker where the player clicks;
  `easeTo({center})` to fly to a marker.

**Fetched fresh on every call, never cached.** The game can replace the map
instance on city load; a cached handle goes stale (its `isStyleLoaded()` stuck
false, its canvas container detached). Both layers re-fetch `getMap()` each time,
and the marker layer re-attaches (rebuilds its overlay + moves the `'move'`
listener) whenever it sees a different instance.

**A first draw can land before the style is ready.** `addSource` throws then; the
influence layer retries on a short timer (like the auto-lines overlay) rather than
waiting on a map event that never fires while the map sits idle.

**The game's stations are native `maplibregl-marker` DOM elements** (not just GL
layers): they're children of the **same** `getCanvasContainer()`, positioned, with
**`z-index: 5`** and **`pointer-events: auto`** (they're clickable). So a badge over
a station can only be grabbed if our overlay sits **above z-index 5** — otherwise
the station marker intercepts the pointer.

The overlay's interactivity is therefore **gated on the panel being open**
(`MarkerLayer.setInteractive`, driven by the panel's mount/unmount):

- **Panel open** → overlay `z-index: 10` (above the station markers) and badges
  `pointer-events: auto`, so they're draggable/clickable. The container itself stays
  `pointer-events: none`, so only the badges intercept — the rest of each station
  stays clickable.
- **Panel closed** → overlay `z-index: 3` (below the station markers) and badges
  `pointer-events: none`, so the badges are a **passive visual overlay** that never
  steals a click or gets dragged while the player is editing the map.

(Verified live over CDP: with the panel open, `elementFromPoint` at a station's
pixel returns our badge; toggling the panel flips the overlay between z-index 10 /
`auto` and z-index 3 / `none`.)

---

## 2. Drawing a true 1 km radius

A GL `circle` layer's `circle-radius` is in **screen pixels**, so it would keep one
size on screen instead of one size on the ground. To draw a real 1 km catchment we
generate a **geodesic polygon** (`geodesicCircle`, destination-point formula, 72
points) and render it as a GeoJSON `fill` + `line`. That polygon is real geography,
so it scales correctly with zoom and stays 1 km at any latitude. Each polygon
carries its marker's color as a feature property, so one fill + one line layer
render every circle via data-driven paint (`['get','color']`).

---

## 3. The floating panel (public UI API)

Registered with `api.ui.addFloatingPanel` — a draggable, resizable, game-styled
window whose wrapper is `fixed z-50 pointer-events-auto` bounded to its own rect,
so **the map stays interactive underneath** (essential: the whole point is to drag
markers on the map with the panel open). `addToolbarPanel` is the wrong choice —
it mounts a full-screen `fixed inset-0` modal backdrop that eats the map's
wheel/drag events.

- The button renders in the **`top-bar`** uiComponents location as a
  `<div title="Map Markers">` (not a `<button>` — query the DOM by `[title]`).
- `icon` is a key into the game's curated icon set; this mod uses **`MapPin`**. An
  unknown key makes the component render `null` (no button), so if the button ever
  goes missing after a game update, the icon key is the first thing to check.
- The game **rebuilds the top bar during city load**, wiping a mod-load-time
  registration, so the panel is **re-registered on the lifecycle hooks**
  (`onGameInit`/`onCityLoad`/`onMapReady`), unregister-first so it stays one
  button. The same hooks re-sync the map layers (`controller.syncToMap()`), since
  the map instance and the city may both have changed.
- **The window geometry persists to `localStorage` under `floating-panel-<id>`**
  (`floating-panel-map-markers` for this mod), shaped `{"x","y","width","height"}`;
  the fixed wrapper is positioned by **inline `left`/`top` px**. A stale saved
  position (a different window size, or a drag past the edge) can restore the
  window **off-screen and out of reach**. `PanelViewport` handles it two ways:
  `clampStoredPanelGeometry()` runs at startup + on the lifecycle hooks to clamp the
  **saved** value into the viewport *before* the game reads it (so the game's own
  position state stays consistent and a later drag doesn't jump), and
  `ensurePanelOnScreen()` runs on the panel's mount (`useLayoutEffect`) to clamp the
  **live** wrapper — the belt-and-suspenders that guarantees reachability on every
  open. (Verified live: a forced `x:3000` on an 1800-wide viewport is clamped to
  `x:1412` both in storage and on the wrapper.)

---

## 4. Identifying the current game (city code + loaded save)

Markers belong to the game you're playing, so the mod has to know *which* game that
is. Two reads, both optional — a missing handle only degrades the scoping:

- **City code** — `api.utils.getCityCode()` (public). Also on the internal store as
  `getState().cityCode`, used as a fallback.
- **Loaded save** — `window.__subwayBuilder_storeCallbacks__.getState().currentSaveInfo`
  = `{id, name}`, where `id` is the save file's **full path**. The public API doesn't
  expose it, so this is the one internal read the mod needs.

> **There is no stable id for "this game".** Autosaves write a **new file** every
> ~5 min (`~/Documents/SubwayBuilder/saves/_auto__<ts>_<uuid>.metro`) and the game
> reopens the **newest** one on restart, so the loaded path differs between sessions
> for the same campaign. There's no shared id inside the `.metro` either (two
> consecutive autosaves share zero 32-hex UUIDs), and `gameSessionId` on the store is
> regenerated every session. `currentSaveInfo` reflects the **loaded** file and does
> **not** update on autosave. Section 6 is how the mod works around this.

**Lifecycle hooks** (`api.hooks.<name>(callback)`), as they actually behave:

| Hook | Behavior |
| --- | --- |
| `onGameInit()` | Only on a **brand-new** game. May fire **before the city is known** — don't assume ordering. |
| `onGameLoaded(saveName)` | **Late-fire**: registering it re-runs it with the current save, so a mod that starts mid-game still gets it. |
| `onGameSaved(saveName)` | Fires on autosave too, but `saveName` is then the literal string `"Autosave"` — useless as a key. |
| `onCityLoad(cityCode)`, `onMapReady(map)` | As named. |

---

## 5. Persistence — the game's per-mod file, reached over IPC

The board lives in the game's own per-mod storage: **`<appData>/mod-data/<modId>.json`**,
one file per mod, written by the main process. Nothing in the renderer can clear it —
which is the point, since the mod's `localStorage` keys were deleted twice by something
outside the mod (§6).

> **`api.storage` is *not* a no-op — but this mod can't use it.** An earlier note here
> said it was, because a `set` then `get` from the console returns the fallback. The
> reason is in the wrapper: every method starts with `if (!currentModId) return fallback`,
> and `currentModId` is a module-global the game sets **only while mod code is on the
> stack** — during the mod's load, and around each hook callback it invokes (it saves,
> sets and restores it). A call from the console has no mod id; neither does a debounced
> write from a timer or a map event, which is where **every** write this mod makes comes
> from. Those writes would be dropped with nothing but a `console.warn`.

So `GameFileStorage` calls the same IPC channels the wrapper calls, passing the mod id
explicitly:

```js
window.electron.invoke('mod-storage-get' | 'mod-storage-set' | 'mod-storage-delete' | 'mod-storage-keys', modId, key?, value?)
```

Each answers with an **envelope**, not the value: `{success, value}` for `get` (no
`value` key at all when absent), `{success, keys}` for `keys`, `{success}` for the rest.
The game's own wrapper returns that envelope verbatim, so `api.storage.get()` would hand
back `{success: true, value: …}` rather than the value — a second reason not to use it.
Writing a 337-marker board measured **3 ms**.

`localStorage` (namespaced `subwaybuilder.map-markers.kv.`) is still read, never written:
boards drawn before the move live there, and its keys join `keys()` so a stranded board
is still found. It is also the whole storage if a build ever exposes no `window.electron`.
The mod's **settings** stay in `localStorage` — they're recreatable preferences, and the
repository is synchronous by design.

Writes are debounced (a drag produces many position updates), and reads are
defensive: a malformed or older payload yields an empty set and heals unknown icons
rather than throwing.

---

## 6. Scoping markers to a save

Markers are keyed by the loaded save (`save:<currentSaveInfo.id>`), with a per-city
cache (`recent:<cityCode>`) that gives a game continuity across sessions — needed
because the newest autosave is a different file every time, so a save's own bucket is
usually empty on load. Load order: **own bucket → city cache → newest bucket of this
city → empty**.

A brand-new game (`onGameInit`) starts empty and **stops reading the city cache**, so
it can't inherit the previous game's markers through it. The cache itself is left on
disk: the game that owns it is still one load away.

**`onGameInit` does not mean "new game".** Opening the game to the main menu fires it
with no save loaded, which is exactly what a new game looks like — and it's the state
the game comes back in after a crash. That ambiguity is why the cache is only ignored,
never deleted; `onGameLoaded` then settles it, because a loaded save is by definition
an existing board, and reads resume.

Two related facts make deleting it unrecoverable, not merely inconvenient: the game
keeps **only 2 autosaves per city**, so the `save:<path>` buckets of older autosaves
point at files it will never reopen; and the cache is therefore the only thread holding
a board across sessions. A `save:<path>` bucket, by contrast, is never touched by this
logic — which is what makes it a safe place to restore a board into.

The trade-off this accepts: loading an **old** save that predates the mod (no bucket
of its own) inherits whatever that city last had, rather than opening empty.

### The third step: recovering a stranded board

**The city cache can disappear even though the mod never deletes it.** On 2026-07-25 it
was removed by something outside the mod: the write-ahead log of the renderer's
`localStorage` records a `DEL` of `recent:RMSP` and `groups:recent:RMSP` in the same
batch as the game's own `__localStorage_test__` probe, while the installed build was
1.1.1 — which contains no call to `delete()` at all. No other installed mod touches
`removeItem`, and a normal boot, a crash-and-reopen and a full reload, all with a
tripwire on `Storage.prototype`, trigger nothing. The cause is still unattributed; the
board was lost anyway, because both lookups came back empty while **19 buckets held the
same 337 markers**.

So an empty result is no longer taken at face value: `loadLatestForCity` reads every
`save:`/`recent:` bucket and adopts the newest one belonging to the current city. Two
fields make that decidable — `city` and `savedAt`, written into every payload. They are
optional, and the schema version deliberately **stays at 1**: bumping it would discard
every board already on disk. A bucket without a `city` (written before this existed) is
a last resort, used only when nothing claims the city, since the alternative is drawing
an empty map over a saved board.

The recovery honours the same line as the cache: a brand-new game doesn't read it.

Quota is **not** a constraint here — probing the renderer accepted 10M characters beyond
the 1.65M already stored, so accumulated orphan buckets are cheap redundancy, not a
looming failure.

---

## 7. Naming a station from a marker (the one write to game state)

The opt-in "name stations from markers" setting renames a station the player builds
inside a marker's influence area. Discovered live over CDP against the running RMSP
game (game 1.4.x); verify before trusting in a new version.

**Station shape** (`store.getState().stations[i]`): `{ id, name, coords, buildType,
stNodeIds, trackIds, … }`. `coords` is **`[lng, lat]`** — the same order a marker
position uses. `buildType` is `"blueprint"` while planned and `"constructed"` once
built.

**`updateStationName(id, name)` cannot set an arbitrary name.** Called with a custom
string it **re-derives** the name from nearby streets and ignores the argument (live:
`updateStationName(id, "Santa Clara")` produced `"Rua Itiúba"`). The only way to set a
custom name is to commit the whole stations array with that station's `name` field
changed via **`setStations(next)`** — the same chokepoint auto-lines wraps for name
cleaning. `setStations(next)` **does** hold a custom name (verified live).

**When a station enters state.** Placing a blueprint fires, in order:
1. `onBlueprintPlaced(blueprints)` — passes **track** blueprints (`id` like
   `…@@1`, `coords` as segment pairs, `buildType:"blueprint"`); the station is **not in
   `stations` yet**. Useless for renaming the station.
2. `setStations(next)` — the new station enters `stations` with its real id,
   `buildType:"blueprint"` and an auto name. **This is the moment to rename.**
3. `onStationBuilt` — later, on construction (`buildType` → `"constructed"`).

So `StationNamer` **wraps `setStations`** (not a hook): on each call it renames a
station whose `buildType` is a fresh `"blueprint"` (new to the previous array) or which
just left `"blueprint"` (blueprint→constructed, in case the game re-derives the name at
construction). A **loaded** station is `"constructed"` and new to the array but not a
blueprint, so it is left alone — that `buildType` gate is what keeps a city load from
renaming every covered station. The wrap is idempotent (a `WeakSet` of already-wrapped
functions) and re-applied on `onCityLoad`/`onGameLoaded` in case the store hands back a
fresh action.
