# Inspecting the game (live)

> For the **findings** (what the store / routes / crossovers / trains actually
> are), see [`game-internals.md`](game-internals.md). This file is the *method* —
> how to probe and drive the live game to (re)discover and verify them.

How this mod's hook point was found, and how to re-do it. Subway Builder is an
Electron app whose renderer bundle (`app.asar` →
`dist/renderer/public/index-*.js`, ~9 MB) is minified and string-table
obfuscated, so reading it statically is slow and unreliable. Inspecting the
**running** renderer over the Chrome DevTools Protocol (CDP) is faster and
authoritative: you query the real objects the game built.

This is macOS-targeted and matches the rest of `scripts/`.

## 1. Launch the game with a debugging port

`npm run debug` quits any running instance and relaunches the binary with
`DEBUG_PROD=true` (opens DevTools) **and** `--remote-debugging-port=9222` (opens
the CDP endpoint). Override the port with `SB_DEBUG_PORT`.

```bash
npm run debug
curl -s http://127.0.0.1:9222/json   # lists targets; find the index.html "page"
```

The relevant target is the renderer page whose `url` ends in `index.html`; its
`webSocketDebuggerUrl` is what you connect to.

## 2. Evaluate JS in the renderer

`scripts/cdp-eval.mjs` connects to that page target and runs `Runtime.evaluate`,
printing the JSON result. (Node 22+ — it uses the global `WebSocket`.)

```bash
# one expression (JSON-serialized automatically):
node scripts/cdp-eval.mjs 'Object.keys(window.SubwayBuilderAPI)'
npm run inspect -- 'window.__subwayBuilder_storeCallbacks__.getState().stations.length'

# a whole snippet file (should evaluate to a value, e.g. an IIFE):
node scripts/cdp-eval.mjs --file /tmp/probe.js
```

## 3. Useful probes

```js
// Full API surface (more than the public docs expose):
Object.keys(window.SubwayBuilderAPI)
// hooks, gameState, actions, stations, cities, ui, map, utils, storage, ...

// All 22 hooks:
Object.keys(window.SubwayBuilderAPI.hooks)

// The live store handle (zustand-style) — the important one:
Object.keys(window.__subwayBuilder_storeCallbacks__.getState())
// data: stations, stationsMap, stNodes, tracks, routes, money, ...
// actions: setStations, setStNodes, updateStationName, buildBlueprints, ...

// Shape of a station / an stNode:
Object.keys(window.__subwayBuilder_storeCallbacks__.getState().stations[0])
//  -> id, name, coords, trackIds, trackGroupId, buildType, stNodeIds, ...
Object.keys(window.__subwayBuilder_storeCallbacks__.getState().stNodes[0])
//  -> id, center, trackIds, buildType   (NO name — names are computed from these)
```

## 4. Instrumenting the lifecycle

To learn *when* something happens, wrap store actions and/or register hooks so
they log into a global array, then perform the action in-game and read the array
back. The app invokes store actions through the same object `getState()` returns,
so wrapping a function on that object intercepts the game's own calls.

```js
// --file snippet: log every station write + the blueprint/station hooks
(() => {
  const S = window.__subwayBuilder_storeCallbacks__, api = window.SubwayBuilderAPI;
  const st = S.getState();
  window.__log = [];
  const names = a => (a||[]).map(s => s && s.name).filter(Boolean).slice(0,8);
  ["setStations","setStNodes","buildBlueprints","setPreviewTracks","clearPreview"]
    .forEach(fn => { const o = st[fn]; if (typeof o === "function")
      st[fn] = function (...a) {
        window.__log.push({ t: Date.now(), fn, count: (S.getState().stations||[]).length, names: names(S.getState().stations) });
        return o.apply(this, a);
      };
    });
  ["onBlueprintPlaced","onTrackBuilt","onStationBuilt"].forEach(h =>
    typeof api.hooks[h] === "function" && api.hooks[h](() =>
      window.__log.push({ t: Date.now(), hook: h, count: (S.getState().stations||[]).length })));
  return "instrumented — act in-game, then read window.__log";
})();
```

```bash
node scripts/cdp-eval.mjs --file /tmp/instrument.js
# ...place a station in the game...
node scripts/cdp-eval.mjs 'window.__log'
```

## What this revealed (and why the mod wraps `setStations`)

Placing a station fires this order:

1. `onBlueprintPlaced` — **station count is still the old value**; the new
   station does not exist in `stations` yet.
2. `setStations` — the new station enters `stations`, **with its `.name`**.
3. `onStationBuilt` / `onTrackBuilt` — afterwards.

So a renamer on the public hooks either runs before the station exists
(`onBlueprintPlaced`) or after its raw name has already painted. `stNodes` carry
no name; names are computed from them precisely at the `setStations` step. That
makes `setStations` the single chokepoint — wrapping it cleans names in place the
instant any station is written, on city load and on placement, before first
paint. That is what `src/index.js` does (with a public-API fallback if the
internal store handle ever changes).

## Re-applying changes without restarting

`window.SubwayBuilderAPI.reloadMods()` re-runs the installed mods from disk, so
after `npm run install-mod` you can reload in place:

```bash
node scripts/cdp-eval.mjs 'window.SubwayBuilderAPI.reloadMods(), "reloaded"'
node scripts/cdp-eval.mjs '!!window.__subwayBuilder_storeCallbacks__.getState().setStations.__bsn'  # mod active?
```

> Note: instrumentation and `reloadMods` stack wrappers on the live store.
> Restart the game (`npm run debug`) for a clean state running only the mod.
