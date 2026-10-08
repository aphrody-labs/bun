"use strict";
const { dirname, join } = require("node:path");
const { checkPatch } = require("./lib/patch.js");

const PHASE_PRODUCTION_BUILD = "phase-production-build";

function nextDirFrom(projectDir) {
  return dirname(require.resolve("next/package.json", { paths: [projectDir] }));
}

/**
 * Wraps a Next.js config so that `next build` compiles with `Bun.build` instead
 * of Turbopack or webpack. Other phases (`next dev`, `next start`) are left
 * untouched. Requires `bun --bun next build` and a patched `next` package
 * (`next-bun patch`).
 *
 * @template T
 * @param {T} nextConfig a config object or a `(phase, ctx) => config` function
 * @returns {(phase: string, ctx: any) => Promise<any>}
 */
function withBun(nextConfig) {
  return async function bunNextConfig(phase, ctx) {
    const config = typeof nextConfig === "function" ? await nextConfig(phase, ctx) : nextConfig;
    if (phase !== PHASE_PRODUCTION_BUILD || process.argv.includes("--webpack")) return config;

    if (typeof Bun === "undefined") {
      throw new Error("@aphrody/next-bun: run the build with `bun --bun next build`.");
    }
    if (process.env.TURBOPACK && process.env.TURBOPACK !== "auto") {
      throw new Error("@aphrody/next-bun: remove --turbopack (or TURBOPACK) to build with Bun.");
    }
    const state = checkPatch(nextDirFrom(process.cwd()));
    if (!state.patched) {
      throw new Error(`@aphrody/next-bun: next@${state.version} is not patched; run \`bunx next-bun patch\` first.`);
    }
    delete process.env.TURBOPACK;
    process.env.NEXT_BUN = join(__dirname, "lib", "build.js");
    return config;
  };
}

module.exports = { withBun };
