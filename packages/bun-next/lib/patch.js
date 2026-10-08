"use strict";
// Next.js has no bundler plugin API, so selecting Bun's bundler takes two edits
// to the installed `next/dist` files. Each edit is anchored on exact source text,
// which must occur exactly once: a release that moved it is refused, not guessed.

const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const MARKER = "/* @aphrody/next-bun patch 1 */";

const EDITS = [
  {
    // `withBun()` sets NEXT_BUN during config load; `next build` then takes the
    // webpack code path, whose compile step is replaced below.
    file: "dist/lib/bundler.js",
    anchor: "function finalizeBundlerFromConfig(fromOptions) {\n",
    insert: `    ${MARKER}\n    if (process.env.NEXT_BUN) {\n        return 1;\n    }\n`,
  },
  {
    // The single seam where `next build` hands the compile step to webpack.
    // NEXT_BUN holds the absolute path of @aphrody/next-bun's build module.
    file: "dist/build/webpack-build/index.js",
    anchor: "async function webpackBuild(withWorker, compilerNames) {\n",
    insert: `    ${MARKER}\n    if (process.env.NEXT_BUN) {\n        return require(process.env.NEXT_BUN).bunBuild(compilerNames, __dirname);\n    }\n`,
  },
];

/** Lowest Next.js release the anchors were written against; any later 16.x (canaries included) is accepted. */
const MIN_VERSION = "16.1.6";

/** Releases whose `dist` files were checked against the anchors; the first and last also pass the build test. */
const VERIFIED_VERSIONS = ["16.1.6", "16.2.12", "16.3.8", "16.4.0", "16.5.0-canary.4"];

/** `version` is a 16.x release at or after MIN_VERSION, prerelease tags ignored. */
function isSupported(version) {
  const [major, minor, patch] = String(version).split(/[.-]/, 3).map(Number);
  const [, minMinor, minPatch] = MIN_VERSION.split(".").map(Number);
  return major === 16 && (minor > minMinor || (minor === minMinor && patch >= minPatch));
}

function readNextVersion(nextDir) {
  return JSON.parse(readFileSync(join(nextDir, "package.json"), "utf8")).version;
}

/** Returns the patch state of the `next` package installed at `nextDir`. */
function checkPatch(nextDir) {
  const version = readNextVersion(nextDir);
  const files = EDITS.map(edit => {
    const path = join(nextDir, edit.file);
    const source = existsSync(path) ? readFileSync(path, "utf8").replaceAll("\r\n", "\n") : null;
    return { ...edit, path, source, patched: !!source?.includes(MARKER) };
  });
  return {
    version,
    supported: isSupported(version),
    patched: files.every(f => f.patched),
    files,
  };
}

/**
 * Applies the edits to the `next` package at `nextDir`. Idempotent. Throws for
 * an unsupported Next.js version or when an anchor is missing.
 */
function applyPatch(nextDir) {
  const state = checkPatch(nextDir);
  if (!state.supported) {
    throw new Error(`@aphrody/next-bun: next@${state.version} is not supported (supported: >=${MIN_VERSION} <17).`);
  }
  const changed = [];
  for (const file of state.files) {
    if (file.patched) continue;
    if (file.source === null) throw new Error(`@aphrody/next-bun: ${file.path} does not exist.`);
    const at = file.source.indexOf(file.anchor);
    if (at === -1 || file.source.indexOf(file.anchor, at + 1) !== -1) {
      throw new Error(`@aphrody/next-bun: expected exactly one anchor in ${file.path}; next@${state.version} differs.`);
    }
    const end = at + file.anchor.length;
    writeFileSync(file.path, file.source.slice(0, end) + file.insert + file.source.slice(end));
    changed.push(file.path);
  }
  return { version: state.version, changed };
}

module.exports = { MARKER, MIN_VERSION, VERIFIED_VERSIONS, applyPatch, checkPatch, isSupported };
