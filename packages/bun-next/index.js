"use strict";
const { dirname, join } = require("node:path");
const { checkPatch } = require("./lib/patch.js");
const { applyBunConfig } = require("./lib/config.js");

const PHASE_PRODUCTION_BUILD = "phase-production-build";

function nextDirFrom(projectDir) {
  return dirname(require.resolve("next/package.json", { paths: [projectDir] }));
}

/** Bun.build compiles `next build` unless the command chose Next's own bundler. */
function selectBunBuild(bundler) {
  if (bundler === "turbopack") return false;
  if (bundler !== undefined && bundler !== "bun") {
    throw new Error(`@aphrody/next-bun: withBun bundler must be "bun" or "turbopack", got ${JSON.stringify(bundler)}`);
  }
  if (process.argv.includes("--webpack") || process.argv.includes("--turbopack")) return false;
  if (process.env.TURBOPACK && process.env.TURBOPACK !== "auto") {
    if (bundler === "bun") throw new Error("@aphrody/next-bun: remove --turbopack (or TURBOPACK) to build with Bun.");
    return false;
  }
  return true;
}

/**
 * Wraps a Next.js config for Bun.
 *
 * Every phase: `turbopack.root` and `outputFileTracingRoot` default to the
 * workspace root (Bun's isolated store lives there), `alias` and `dedupe` are
 * written for both Turbopack and webpack, packages that ship TypeScript sources
 * join `transpilePackages`, and `next start` keeps the asset prefix and
 * deployment id its build baked into the client bundles.
 *
 * `bundler: "bun"` (the default) also compiles `next build` with `Bun.build`
 * (Pages Router, experimental; needs `bun --bun next build` and `next-bun patch`)
 * unless the command passes `--turbopack` or `--webpack`. `bundler: "turbopack"`
 * leaves the bundler to Next.
 *
 * @template T
 * @param {T} nextConfig a config object or a `(phase, ctx) => config` function
 * @param {{ bundler?: "bun" | "turbopack", alias?: Record<string, string>, dedupe?: string[],
 *   root?: string | false, transpileSources?: boolean, freezeBuildConfig?: boolean,
 *   projectDir?: string }} [options]
 * @returns {(phase: string, ctx: any) => Promise<any>}
 */
function withBun(nextConfig, options = {}) {
  return async function bunNextConfig(phase, ctx) {
    const resolved = typeof nextConfig === "function" ? await nextConfig(phase, ctx) : nextConfig;
    const projectDir = options.projectDir ?? process.cwd();
    const config = applyBunConfig(resolved, { ...options, phase, projectDir });
    if (phase !== PHASE_PRODUCTION_BUILD || !selectBunBuild(options.bundler)) return config;

    if (typeof Bun === "undefined") {
      throw new Error("@aphrody/next-bun: run the build with `bun --bun next build`.");
    }
    const state = checkPatch(nextDirFrom(projectDir));
    if (!state.patched) {
      throw new Error(`@aphrody/next-bun: next@${state.version} is not patched; run \`bunx next-bun patch\` first.`);
    }
    delete process.env.TURBOPACK;
    process.env.NEXT_BUN = join(__dirname, "lib", "build.js");
    return config;
  };
}

module.exports = { withBun };
