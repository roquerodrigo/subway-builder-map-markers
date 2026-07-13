#!/usr/bin/env node
// Build the two assets a Railyard release needs, into dist/release/:
//
//   map-markers-<version>.zip   the mod itself (index.js + manifest.json)
//   manifest.json               the same manifest, standalone
//
//   node scripts/package-release.mjs        (or: npm run package)
//
// Railyard reads the standalone manifest to check compatibility without
// downloading the ZIP, so the registry rejects a release that ships only the
// archive — both assets go on the same GitHub release.
//
// The ZIP is flat on purpose: the installer looks for `manifest.json` at the
// archive root and never strips a wrapping folder, so a nested one won't install.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(projectRoot, "dist", "index.js");
const manifestSource = path.join(projectRoot, "src", "manifest.json");
const outputDir = path.join(projectRoot, "dist", "release");

if (!fs.existsSync(bundle)) {
  console.error('missing dist/index.js — run "npm run build" first');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestSource, "utf8"));

// Fail loudly here rather than on a registry validation round-trip: these are the
// checks scripts/lib/mod-manifest.ts in the registry applies to the release.
const problems = [];
for (const field of ["id", "name", "version", "main"]) {
  if (typeof manifest[field] !== "string" || manifest[field].length === 0) {
    problems.push(`manifest.${field} must be a non-empty string`);
  }
}
if (typeof manifest.author?.name !== "string" || manifest.author.name.length === 0) {
  problems.push("manifest.author.name must be a non-empty string");
}
if (typeof manifest.dependencies?.["subway-builder"] !== "string") {
  problems.push('manifest.dependencies must include "subway-builder" with a semver range');
}
// The registry compares the manifest id against the Railyard mod id, which is
// kebab-case — a reverse-DNS id (the game's own template style) fails there.
if (typeof manifest.id === "string" && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.id)) {
  problems.push(`manifest.id "${manifest.id}" must be kebab-case to match the Railyard mod id`);
}
if (typeof manifest.version === "string" && !/^v?\d+\.\d+\.\d+/.test(manifest.version)) {
  problems.push(`manifest.version "${manifest.version}" must be semver (X.Y.Z)`);
}
if (manifest.main !== path.basename(bundle)) {
  problems.push(`manifest.main "${manifest.main}" does not match the built bundle (${path.basename(bundle)})`);
}
if (problems.length > 0) {
  console.error("manifest.json would be rejected by the registry:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

fs.rmSync(outputDir, { force: true, recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

// Stage the archive contents so the ZIP holds exactly these two files, flat.
const staging = path.join(outputDir, manifest.id);
fs.mkdirSync(staging);
fs.copyFileSync(bundle, path.join(staging, manifest.main));
fs.copyFileSync(manifestSource, path.join(staging, "manifest.json"));

const zipName = `${manifest.id}-${manifest.version}.zip`;
// -j (junk paths) keeps the entries at the archive root; -X drops macOS extras.
execFileSync("zip", ["-j", "-X", "-q", path.join(outputDir, zipName), ...fs.readdirSync(staging).map((f) => path.join(staging, f))]);
fs.rmSync(staging, { recursive: true });

fs.copyFileSync(manifestSource, path.join(outputDir, "manifest.json"));

const entries = execFileSync("unzip", ["-Z1", path.join(outputDir, zipName)], { encoding: "utf8" }).trim().split("\n");
console.log(`packaged -> dist/release/${zipName}`);
console.log(`  contents: ${entries.join(", ")}`);
console.log("packaged -> dist/release/manifest.json");
console.log(`\nupload BOTH to a GitHub release tagged v${manifest.version} (or ${manifest.version}).`);
