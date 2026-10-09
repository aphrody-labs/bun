// withBun(): the config rewrites every Next.js app on Bun gets, and the standalone flattener.
import { describe, expect, test } from "bun:test";
import { tempDir } from "harness";
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const nextBun = join(import.meta.dir, "..", "..", "..", "packages", "bun-next");
const { withBun } = require(nextBun);
const {
  aliasTables,
  applyBunConfig,
  findWorkspaceRoot,
  isTauriBuild,
  readBuiltClientConfig,
  typeScriptSourcePackages,
} = require(join(nextBun, "lib", "config.js"));
const { flattenStandalone } = require(join(nextBun, "lib", "standalone.js"));

const pkg = (name: string, extra: Record<string, unknown> = {}) => JSON.stringify({ name, version: "1.0.0", ...extra });

function workspace() {
  return tempDir("next-bun-ws", {
    "package.json": JSON.stringify({ name: "root", workspaces: ["apps/*", "packages/*"] }),
    "apps/site/package.json": pkg("site", {
      dependencies: { "@ws/ui": "workspace:*", "plain-js": "1.0.0", "custom-cond": "1.0.0", "server-ts": "1.0.0" },
      devDependencies: { "dev-ts": "1.0.0" },
    }),
    "apps/site/src/i18n/request.ts": "export default {};",
    "node_modules/@ws/ui/package.json": pkg("@ws/ui", {
      exports: { ".": "./src/index.ts", "./styles.css": "./src/styles.css" },
      dependencies: { "nested-ts": "1.0.0" },
    }),
    "node_modules/nested-ts/package.json": pkg("nested-ts", {
      exports: { ".": { bun: "./src/index.ts", import: "./src/index.ts", default: "./dist/index.js" } },
    }),
    "node_modules/plain-js/package.json": pkg("plain-js", { main: "index.js", types: "index.d.ts" }),
    "node_modules/custom-cond/package.json": pkg("custom-cond", {
      exports: { ".": { "@zod/source": "./src/index.ts", types: "./src/index.ts", import: "./dist/index.js" } },
    }),
    "node_modules/server-ts/package.json": pkg("server-ts", { exports: "./index.ts" }),
    "node_modules/dev-ts/package.json": pkg("dev-ts", { module: "./src/index.tsx" }),
    "node_modules/dup/package.json": pkg("dup", { main: "index.js" }),
  });
}

describe("config rewrites", () => {
  test("the workspace root is the nearest ancestor declaring workspaces", () => {
    using dir = workspace();
    expect(findWorkspaceRoot(join(String(dir), "apps", "site"))).toBe(String(dir));
    expect(findWorkspaceRoot(String(dir))).toBe(String(dir));
    using lone = tempDir("next-bun-lone", { "package.json": pkg("lone") });
    expect(findWorkspaceRoot(String(lone))).toBe(String(lone));
  });

  test("packages shipping TypeScript sources are found transitively, JS packages skipped", () => {
    using dir = workspace();
    expect(typeScriptSourcePackages(join(String(dir), "apps", "site"))).toEqual([
      "@ws/ui",
      "dev-ts",
      "nested-ts",
      "server-ts",
    ]);
  });

  test("one alias table feeds Turbopack (project-relative) and webpack (absolute)", () => {
    using dir = workspace();
    const site = join(String(dir), "apps", "site");
    const { turbopack, webpack } = aliasTables(
      site,
      { "next-intl/config": "./src/i18n/request.ts", lodash: "lodash-es" },
      ["dup"],
    );
    expect(turbopack).toEqual({
      "next-intl/config": "./src/i18n/request.ts",
      lodash: "lodash-es",
      dup: "../../node_modules/dup",
      "dup/*": "../../node_modules/dup/*",
    });
    expect(webpack["next-intl/config"]).toBe(join(site, "src", "i18n", "request.ts"));
    expect(webpack.lodash).toBe("lodash-es");
    expect(webpack.dup).toBe(join(String(dir), "node_modules", "dup"));
    expect(() => aliasTables(site, {}, ["missing"])).toThrow("dedupe: missing is not installed");
  });

  test("applyBunConfig sets roots, aliases, transpilePackages; user values win", () => {
    using dir = workspace();
    const site = join(String(dir), "apps", "site");
    const userWebpack = (config: any) => ({ ...config, touched: true });
    const out = applyBunConfig(
      {
        serverExternalPackages: ["server-ts"],
        transpilePackages: ["extra"],
        turbopack: { resolveAlias: { dup: "./mine" } },
        webpack: userWebpack,
      },
      { phase: "phase-production-build", projectDir: site, alias: { x: "./src/i18n/request.ts" }, dedupe: ["dup"] },
    );
    expect(out.turbopack.root).toBe(String(dir));
    expect(out.outputFileTracingRoot).toBe(String(dir));
    expect(out.turbopack.resolveAlias.dup).toBe("./mine");
    expect(out.turbopack.resolveAlias.x).toBe("./src/i18n/request.ts");
    expect(out.transpilePackages.sort()).toEqual(["@ws/ui", "dev-ts", "extra", "nested-ts"]);
    const webpackConfig = out.webpack({ resolve: { alias: { keep: "k" } } }, {});
    expect(webpackConfig.touched).toBe(true);
    expect(webpackConfig.resolve.alias).toEqual({
      x: join(site, "src", "i18n", "request.ts"),
      dup: join(String(dir), "node_modules", "dup"),
      keep: "k",
    });

    const explicit = applyBunConfig(
      { outputFileTracingRoot: site },
      { phase: "phase-development-server", projectDir: site, transpileSources: false },
    );
    expect(explicit.turbopack.root).toBe(site);
    expect(explicit.transpilePackages).toBeUndefined();
    expect(applyBunConfig({}, { phase: "x", projectDir: site, root: false }).turbopack).toBeUndefined();
  });

  test("next start keeps the asset prefix and deployment id of its build", () => {
    using dir = tempDir("next-bun-frozen", {
      "package.json": pkg("app"),
      "out/required-server-files.json": JSON.stringify({
        config: { assetPrefix: "https://cdn.example", deploymentId: "abc123" },
      }),
    });
    expect(readBuiltClientConfig(join(String(dir), "missing"))).toBeNull();
    const config = { distDir: "out", assetPrefix: "https://other.example" };
    const options = { projectDir: String(dir), root: false, transpileSources: false };
    const served = applyBunConfig(config, { ...options, phase: "phase-production-server" });
    expect(served.assetPrefix).toBe("https://cdn.example");
    expect(served.deploymentId).toBe("abc123");
    const building = applyBunConfig(config, { ...options, phase: "phase-production-build" });
    expect(building.assetPrefix).toBe("https://other.example");
    const unfrozen = applyBunConfig(config, { ...options, phase: "phase-production-server", freezeBuildConfig: false });
    expect(unfrozen.assetPrefix).toBe("https://other.example");
  });

  const base = { phase: "phase-production-build", projectDir: "/", root: false, transpileSources: false } as const;

  test("reactCompiler, typedRoutes and cacheComponents fill only unset Next keys", () => {
    const set = applyBunConfig({}, { ...base, reactCompiler: true, typedRoutes: true, cacheComponents: true });
    expect([set.reactCompiler, set.typedRoutes, set.cacheComponents]).toEqual([true, true, true]);
    expect(applyBunConfig({}, base).reactCompiler).toBeUndefined();
    const kept = applyBunConfig(
      { reactCompiler: false, typedRoutes: false, cacheComponents: false },
      { ...base, reactCompiler: true, typedRoutes: true, cacheComponents: true },
    );
    expect([kept.reactCompiler, kept.typedRoutes, kept.cacheComponents]).toEqual([false, false, false]);
  });

  test("tauri makes a static export a webview loads; config keys win", () => {
    const env = { NODE_ENV: "development" };
    const exported = applyBunConfig(
      {},
      { ...base, env, tauri: { env: { NEXT_PUBLIC_STATIC: "1" } }, cacheComponents: true },
    );
    expect(exported).toMatchObject({
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
      cacheComponents: false,
      env: { NEXT_PUBLIC_STATIC: "1" },
    });
    expect(exported.assetPrefix).toBeUndefined();
    const user = applyBunConfig(
      { output: "standalone", trailingSlash: false, images: { formats: ["image/avif"] }, env: { A: "1" } },
      { ...base, env, tauri: { env: { NEXT_PUBLIC_STATIC: "1", A: "0" } } },
    );
    expect(user).toMatchObject({
      output: "standalone",
      trailingSlash: false,
      images: { unoptimized: true, formats: ["image/avif"] },
      env: { NEXT_PUBLIC_STATIC: "1", A: "1" },
    });
    for (const tauri of [undefined, false]) expect(applyBunConfig({}, { ...base, env, tauri }).output).toBeUndefined();
  });

  test('tauri "auto" follows the Tauri CLI and the dev asset prefix never reaches production', () => {
    expect(isTauriBuild({})).toBe(false);
    expect(isTauriBuild({ TAURI_ENV_ARCH: "x86_64" })).toBe(true);
    expect(applyBunConfig({}, { ...base, env: {}, tauri: "auto" }).output).toBeUndefined();
    expect(applyBunConfig({}, { ...base, env: { TAURI_ENV_PLATFORM: "linux" }, tauri: "auto" }).output).toBe("export");
    const prefix = (env: Record<string, string>, tauri: unknown) =>
      applyBunConfig({}, { ...base, env, tauri }).assetPrefix;
    expect(prefix({ NODE_ENV: "development" }, { devHost: "192.168.1.5", devPort: 3100 })).toBe(
      "http://192.168.1.5:3100",
    );
    expect(prefix({ NODE_ENV: "development", TAURI_DEV_HOST: "10.0.0.2" }, true)).toBe("http://10.0.0.2:3000");
    expect(prefix({ NODE_ENV: "production", TAURI_DEV_HOST: "10.0.0.2" }, true)).toBeUndefined();
  });
});

describe("withBun", () => {
  test('bundler "turbopack" never selects Bun.build and keeps a function config', async () => {
    using dir = workspace();
    const site = join(String(dir), "apps", "site");
    const wrapped = withBun(async (phase: string) => ({ reactStrictMode: phase === "phase-production-build" }), {
      bundler: "turbopack",
      projectDir: site,
    });
    const previous = process.env.NEXT_BUN;
    delete process.env.NEXT_BUN;
    try {
      const config = await wrapped("phase-production-build", {});
      expect(config.reactStrictMode).toBe(true);
      expect(config.turbopack.root).toBe(String(dir));
      expect(process.env.NEXT_BUN).toBeUndefined();
    } finally {
      if (previous !== undefined) process.env.NEXT_BUN = previous;
    }
  });

  test("@aphrody/next's built-in Bun bundler is used without a patch", async () => {
    using dir = tempDir("next-bun-native", {
      "package.json": pkg("app", { dependencies: { next: "1.0.0" } }),
      "node_modules/next/package.json": pkg("next", { version: "16.5.0-canary.5-aphrody.1" }),
      "node_modules/next/dist/build/bun-build/index.js": `
        exports.configured = [];
        exports.configureBunBuild = options => exports.configured.push(options.plugins.map(p => p.name));
      `,
    });
    const plugin = { name: "probe", setup() {} };
    const previous = { NEXT_BUN: process.env.NEXT_BUN, TURBOPACK: process.env.TURBOPACK };
    delete process.env.NEXT_BUN;
    delete process.env.TURBOPACK;
    try {
      await withBun({}, { projectDir: String(dir), root: false, plugins: [plugin] })("phase-production-build", {});
      expect(process.env.NEXT_BUN).toBe("1");
      expect(require(join(String(dir), "node_modules/next/dist/build/bun-build/index.js")).configured).toEqual([
        ["probe"],
      ]);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("an unknown bundler is refused", async () => {
    await expect(withBun({}, { bundler: "rspack", root: false })("phase-production-build", {})).rejects.toThrow(
      'bundler must be "bun" or "turbopack"',
    );
  });
});

describe("flattenStandalone", () => {
  test("hoists the isolated store, keeps in-tree links as copies, drops the rest", () => {
    using dir = tempDir("next-bun-standalone", {
      "node_modules/.bun/a@1.0.0/node_modules/a/package.json": pkg("a"),
      "node_modules/.bun/@s+b@2.0.0/node_modules/@s/b/package.json": pkg("@s/b"),
      "apps/site/server.js": "",
      "packages/ui/package.json": pkg("ui"),
    });
    const root = String(dir);
    const type = process.platform === "win32" ? "junction" : "dir";
    mkdirSync(join(root, "node_modules", "@s"), { recursive: true });
    symlinkSync(join(root, "node_modules/.bun/a@1.0.0/node_modules/a"), join(root, "node_modules/a"), type);
    symlinkSync(join(root, "node_modules/.bun/@s+b@2.0.0/node_modules/@s/b"), join(root, "node_modules/@s/b"), type);
    // b's dependency on a, as the isolated linker writes it.
    symlinkSync(
      join(root, "node_modules/.bun/a@1.0.0/node_modules/a"),
      join(root, "node_modules/.bun/@s+b@2.0.0/node_modules/a"),
      type,
    );
    mkdirSync(join(root, "apps/site/node_modules"), { recursive: true });
    symlinkSync(join(root, "packages/ui"), join(root, "apps/site/node_modules/ui"), type);

    expect(flattenStandalone(root).packages).toEqual(["@s/b", "a"]);
    expect(existsSync(join(root, "node_modules", ".bun"))).toBe(false);
    for (const path of ["node_modules/a", "node_modules/@s/b", "apps/site/node_modules/ui"]) {
      expect(lstatSync(join(root, path)).isSymbolicLink()).toBe(false);
    }
    expect(JSON.parse(readFileSync(join(root, "node_modules/@s/b/package.json"), "utf8")).name).toBe("@s/b");
    expect(JSON.parse(readFileSync(join(root, "apps/site/node_modules/ui/package.json"), "utf8")).name).toBe("ui");
  });

  test("two versions of one package are refused", () => {
    using dir = tempDir("next-bun-standalone-dup", {
      "node_modules/.bun/a@1.0.0/node_modules/a/package.json": pkg("a"),
      "node_modules/.bun/a@2.0.0/node_modules/a/package.json": pkg("a", { version: "2.0.0" }),
    });
    expect(() => flattenStandalone(String(dir))).toThrow("two versions of a");
  });

  test("a tree without a store is left alone", () => {
    using dir = tempDir("next-bun-standalone-flat", { "server.js": "" });
    expect(flattenStandalone(String(dir))).toEqual({ packages: [] });
  });
});
