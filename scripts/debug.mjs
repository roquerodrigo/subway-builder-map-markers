#!/usr/bin/env node
// Dev mode: relaunch Subway Builder with DEBUG_PROD=true so the prod build opens
// its DevTools/console, capturing output to logs/debug-<timestamp>.log.
// Ported from subway-builder-rmsp's `rmsp debug`. macOS-targeted.
//
//   node scripts/debug.mjs              (or: npm run debug)
//
// The env var only applies on a fresh launch and macOS `open` drops it, so the
// running game is quit and its binary started directly.
//
// Also opens a Chrome DevTools Protocol port (SB_DEBUG_PORT, default 9222) so the
// running renderer can be inspected from scripts/cdp-eval.mjs. See
// docs/inspecting-the-game.md.
//
// Override the .app bundle with SB_APP=/path/to/Subway Builder.app

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const appPath = process.env.SB_APP || "/Applications/Subway Builder.app";
const name = path.basename(appPath, ".app"); // "Subway Builder"
const exe = path.join(appPath, "Contents", "MacOS", name);

if (!fs.existsSync(exe)) {
  console.error(`game binary not found: ${exe}`);
  console.error("pass the bundle with SB_APP=/path/to/Subway Builder.app");
  process.exit(1);
}

const logsDir = path.join(projectRoot, "logs");
fs.mkdirSync(logsDir, { recursive: true });

// Force-kill any running instance(s) before relaunching.
//
// A graceful `osascript -e 'quit app "…"'` makes the game pop a native
// "Save progress?" confirmation dialog that BLOCKS the quit. Driven headless over
// CDP nobody clicks it, so the old instance survives and this script then launches
// a SECOND one — two instances fighting over the CDP port and the autosave file,
// producing bogus symptoms (vanishing routes, empty previews, "Window closed").
// SIGKILL skips the app's quit handler, so no dialog; we lose only changes since
// the last autosave, which is fine for a dev session. Then wait until the process
// is actually gone so we never overlap instances.
try {
  execSync(`pkill -9 -f ${JSON.stringify(exe)}`, { stdio: "ignore" });
} catch {
  /* not running */
}
for (let i = 0; i < 25; i++) {
  try {
    execSync(`pgrep -f ${JSON.stringify(exe)}`, { stdio: "ignore" });
    execSync("sleep 0.2");   // still alive — wait and re-check
  } catch {
    break;                   // pgrep found nothing → fully gone
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, 19);
const logPath = path.join(logsDir, `debug-${stamp}.log`);
const fh = fs.openSync(logPath, "w");

const port = process.env.SB_DEBUG_PORT || "9222";
const child = spawn(exe, [`--remote-debugging-port=${port}`], {
  env: { ...process.env, DEBUG_PROD: "true" },
  detached: true,
  stdio: ["ignore", fh, fh],
});
child.unref();

console.log(`debug: ${name} (DEBUG_PROD, CDP :${port}) launched -> log ${logPath}`);
console.log(`inspect with: node scripts/cdp-eval.mjs '<js expression>'`);
