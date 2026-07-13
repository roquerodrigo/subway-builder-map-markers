#!/usr/bin/env node
// Copy the built mod (dist/index.js + src/manifest.json) into the game's mods
// folder. macOS-targeted. Run `npm run build` first (or use `npm run install-mod`,
// which builds automatically).
//
//   node scripts/install-mod.mjs        (or: npm run install-mod)
//
// Game data dir resolves from SB_DATA_DIR, defaulting to the macOS Subway
// Builder app-support dir, so the same repo can target another copy of the game.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SLUG = "map-markers"; // mod folder name under <game>/mods/

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// [source path, destination filename] — the bundle plus the mod manifest.
const FILES = [
  [path.join(projectRoot, "dist", "index.js"), "index.js"],
  [path.join(projectRoot, "src", "manifest.json"), "manifest.json"],
];

const gameDir =
  process.env.SB_DATA_DIR ||
  path.join(os.homedir(), "Library", "Application Support", "metro-maker4");

if (!fs.existsSync(gameDir)) {
  console.error(`game data dir not found: ${gameDir}`);
  console.error("is Subway Builder installed? override with SB_DATA_DIR=/path/to/data");
  process.exit(1);
}

for (const [source] of FILES) {
  if (!fs.existsSync(source)) {
    console.error(`missing ${path.relative(projectRoot, source)} — run "npm run build" first`);
    process.exit(1);
  }
}

const dest = path.join(gameDir, "mods", SLUG);
fs.mkdirSync(dest, { recursive: true });
for (const [source, name] of FILES) {
  fs.copyFileSync(source, path.join(dest, name));
}

console.log(`installed mod -> ${dest}`);
console.log("enable it in Settings > Mods and restart the game");
