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

/** `options.plugins`, after `@aphrody/bun-plugin-tailwind` (from the project) when `options.tailwind` is set. */
function bunPlugins(options, projectDir) {
  const plugins = [...(options.plugins ?? [])];
  if (options.tailwind) {
    const { tailwind } = require(require.resolve("@aphrody/bun-plugin-tailwind", { paths: [projectDir] }));
    plugins.unshift(tailwind({ base: projectDir, ...(options.tailwind === true ? {} : options.tailwind) }));
  }
  return plugins;
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
 * leaves the bundler to Next. With Bun.build, `plugins` are added to the client
 * and server builds and `tailwind` adds `@aphrody/bun-plugin-tailwind`; with
 * Turbopack, Tailwind goes through `@aphrody/bun-plugin-tailwind/postcss`.
 *
 * @template T
 * @param {T} nextConfig a config object or a `(phase, ctx) => config` function
 * @param {{ bundler?: "bun" | "turbopack", alias?: Record<string, string>, dedupe?: string[],
 *   root?: string | false, transpileSources?: boolean, freezeBuildConfig?: boolean,
 *   projectDir?: string, plugins?: import("bun").BunPlugin[], tailwind?: boolean | Record<string, unknown> }} [options]
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
    require(process.env.NEXT_BUN).configure({ plugins: bunPlugins(options, projectDir) });
    return config;
  };
}

module.exports = { withBun };
