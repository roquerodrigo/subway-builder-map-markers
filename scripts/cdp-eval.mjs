#!/usr/bin/env node
// Evaluate a JS expression inside the running Subway Builder renderer over the
// Chrome DevTools Protocol, and print the JSON result. Use it to inspect the
// live game (the API surface, the store, station state) instead of reading the
// obfuscated bundle. See docs/inspecting-the-game.md.
//
//   npm run debug                                  # launch the game with the CDP port
//   node scripts/cdp-eval.mjs 'Object.keys(window.SubwayBuilderAPI)'
//   node scripts/cdp-eval.mjs 'window.__subwayBuilder_storeCallbacks__.getState().stations.length'
//
// To run a whole script file instead of one expression, pass --file:
//   node scripts/cdp-eval.mjs --file path/to/snippet.js
//
// Port: SB_DEBUG_PORT (default 9222) — must match the port `npm run debug` used.
// Requires Node 22+ (global WebSocket).

import { readFileSync } from "node:fs";

const PORT = process.env.SB_DEBUG_PORT || "9222";
const args = process.argv.slice(2);

let expression;
if (args[0] === "--file") {
  // Run the file body verbatim (it should evaluate to a value, e.g. an IIFE).
  expression = readFileSync(args[1], "utf8");
} else if (args[0]) {
  // Wrap a bare expression so any value comes back JSON-serialized.
  expression = `(()=>{try{return JSON.stringify(${args[0]});}catch(e){return "ERR: "+e.message;}})()`;
} else {
  console.error("usage: cdp-eval.mjs '<js expression>'   |   cdp-eval.mjs --file <path>");
  process.exit(1);
}

let targets;
try {
  targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
} catch {
  console.error(`no CDP endpoint on :${PORT} — is the game running via \`npm run debug\`?`);
  process.exit(1);
}
const page =
  targets.find((t) => t.type === "page" && /index\.html/.test(t.url)) ||
  targets.find((t) => t.type === "page");
if (!page) {
  console.error("no renderer page target found");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
await new Promise((res) => ws.addEventListener("open", res));
await send("Runtime.enable");
const r = await send("Runtime.evaluate", {
  expression,
  returnByValue: true,
  awaitPromise: true,
});
const value = r.result?.result?.value;
console.log(value === undefined ? JSON.stringify(r.result, null, 2) : value);
ws.close();
