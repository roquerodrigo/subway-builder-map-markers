#!/usr/bin/env node
// Bundle the TypeScript mod into a single IIFE the game can load.
//
//   node scripts/build.mjs            (or: npm run build)
//   node scripts/build.mjs --watch    (rebuild on change)
//
// The game injects the mod as one plain script after boot, with React supplied
// by the host (window.SubwayBuilderAPI.utils.React) — so the output MUST be a
// single IIFE that does not embed its own React. JSX compiles to the host
// React's createElement via the `h`/`Fragment` factory imported from the shim.

import { build, context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const options = {
  entryPoints: [path.join(projectRoot, "src", "main.tsx")],
  outfile: path.join(projectRoot, "dist", "index.js"),
  // Pointed at explicitly so the `@/*` paths resolve from wherever this is run.
  tsconfig: path.join(projectRoot, "tsconfig.json"),
  bundle: true,
  format: "iife", // erases top-level import/export → safe to eval as a classic script over CDP
  platform: "browser",
  target: "es2020",
  jsx: "transform",
  jsxFactory: "h",
  jsxFragment: "Fragment",
  minify: false,
  sourcemap: false,
  charset: "utf8", // keep the panel's typography (·, curly quotes) as literals
  legalComments: "none",
  banner: { js: "//# sourceURL=map-markers" }, // readable frames for CDP runtime errors
};

const watch = process.argv.includes("--watch");
if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching src/ …");
} else {
  await build(options);
  console.log(`built -> ${path.relative(projectRoot, options.outfile)}`);
}
