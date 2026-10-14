import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { tempDir } from "../../../test/harness";
import { GitTree } from "./collect";
import {
  exportJitWorkspaceMetadata,
  jitWorkspaceMetadata,
  verifyJitCloudflareDependencies,
  verifyJitGraphFrontendSources,
} from "./jit-source";

test("the actual JIT archive closes generator and Worker relative imports", async () => {
  using fixture = tempDir("site-jit-closure", {});
  const root = resolve(import.meta.dir, "../../..");
  const shell = await Bun.file(join(import.meta.dir, "auto-publish.sh")).text();
  const line = shell.split(/\r?\n/).find(line => line.startsWith('git -C "$checkout" archive '))!;
  const paths = line.slice(line.indexOf('"$site_source" ') + 15, line.indexOf(" | tar")).split(" ");
  const tree = new GitTree(root, "HEAD");
  const available = new Set(
    [...tree.files.keys()].filter(file => paths.some(path => file === path || file.startsWith(path + "/"))),
  );
  for (const path of jitWorkspaceMetadata(tree).keys()) available.add(path);
  const entries = ["scripts/aphrody/release-surfaces.ts", "packages/web/cloudflare/src/worker.ts"];
  const seen = new Set<string>();
  const compiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
  let queue = [...entries];
  while (queue.length) {
    const batch = [...new Set(queue)].filter(path => !seen.has(path));
    queue = [];
    if (seen.size + batch.length > 300) throw new Error("JIT import closure exceeds its fixture bound");
    const files = tree.readBytes(batch);
    for (const path of batch) {
      if (!available.has(path)) throw new Error("Import missing from actual JIT archive: " + path);
      seen.add(path);
      const bytes = files.get(path)!;
      await Bun.write(join(String(fixture), path), bytes);
      if (path.endsWith(".json")) continue;
      for (const dependency of compiler.scan(bytes).imports) {
        if (!dependency.path.startsWith(".")) continue;
        const base = posix.normalize(posix.join(posix.dirname(path), dependency.path));
        const target = [
          base,
          ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"].map(suffix => base + suffix),
        ].find(candidate => tree.has(candidate));
        if (!target || !available.has(target)) throw new Error("Import missing from actual JIT archive: " + base);
        queue.push(target);
      }
    }
  }
  const entrypoints = entries.map(path => join(String(fixture), path));
  const result = await Bun.build({ entrypoints, target: "bun", packages: "external" });
  if (!result.success) throw new Error(result.logs.map(log => String(log)).join("\n"));
  expect(result.outputs.length).toBe(2);
  expect((await result.outputs[0]!.text()).includes("GraphRedisCache")).toBe(true);
});

test("JIT workspace discovery reads the immutable patterns and excludes other package trees", () => {
  const contents = new Map([
    ["package.json", JSON.stringify({ workspaces: ["./packages/*", "apps/*"] })],
    ["bun.lock", '{"lockfileVersion":2}'],
    ["packages/web/package.json", '{"name":"@aphrody/web"}'],
    ["packages/neon/package.json", '{"name":"@aphrody/bun-plugin-neon"}'],
    ["apps/desktop/package.json", '{"name":"desktop"}'],
    ["packages/foreign/vendor/package.json", '{"name":"not-a-workspace"}'],
  ]);
  const tree = {
    files: new Map([...contents.keys()].map(path => [path, "fixture"])),
    readBytes(paths: string[]) {
      return new Map(paths.map(path => [path, new TextEncoder().encode(contents.get(path))]));
    },
  };
  expect([...jitWorkspaceMetadata(tree).keys()].sort()).toEqual([
    "apps/desktop/package.json",
    "bun.lock",
    "package.json",
    "packages/neon/package.json",
    "packages/web/package.json",
  ]);
  contents.set("package.json", JSON.stringify({ workspaces: ["../outside/*"] }));
  expect(() => jitWorkspaceMetadata(tree)).toThrow("escapes");
});

test("a filtered JIT install and bundle resolve fresh workspace HTTP code instead of ancestor dependencies", async () => {
  using fixture = tempDir("site-jit-owner", {
    "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
    "packages/web/package.json": JSON.stringify({
      name: "@aphrody/web",
      private: true,
      version: "1.0.0",
      dependencies: { "@aphrody/bun-plugin-neon": "workspace:*" },
    }),
    "packages/neon/package.json": JSON.stringify({
      name: "@aphrody/bun-plugin-neon",
      version: "1.0.0",
      exports: { "./http": "./http.ts" },
    }),
    "packages/neon/http.ts": 'export const owner="fresh-immutable-source";',
    "packages/unused/package.json": JSON.stringify({ name: "unused", version: "1.0.0" }),
    "packages/web/check.ts": 'import {owner} from "@aphrody/bun-plugin-neon/http";console.log(owner);',
  });
  const root = String(fixture);
  const run = (argv: string[], cwd: string) => {
    const result = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe", timeout: 10_000 });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  run([process.execPath, "install", "--lockfile-only", "--ignore-scripts", "--no-progress"], root);
  run(["git", "init", "--initial-branch=main"], root);
  run(["git", "add", "."], root);
  run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"], root);
  const tree = new GitTree(root, "HEAD");
  const out = join(root, "jit");
  mkdirSync(out);
  // The source export owns entry files; this helper supplies their unchanged workspace metadata.
  for (const [path, bytes] of tree.readBytes(["packages/neon/http.ts", "packages/web/check.ts"]))
    await Bun.write(join(out, path), bytes);
  const metadata = await exportJitWorkspaceMetadata(tree, out);
  expect(metadata.source).toBe(tree.sha);
  const lock = await Bun.file(join(out, "bun.lock")).bytes();
  await Bun.write(
    join(root, "node_modules/@aphrody/bun-plugin-neon/package.json"),
    JSON.stringify({ name: "@aphrody/bun-plugin-neon", version: "0.1.0", exports: { "./http": "./http.ts" } }),
  );
  await Bun.write(join(root, "node_modules/@aphrody/bun-plugin-neon/http.ts"), 'export const owner="stale-ancestor";');
  run(
    [
      process.execPath,
      "install",
      "--filter",
      "@aphrody/web",
      "--production",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--no-progress",
    ],
    out,
  );
  expect(Buffer.from(await Bun.file(join(out, "bun.lock")).bytes()).equals(lock)).toBe(true);
  expect(run([process.execPath, join(out, "packages/web/check.ts")], out)).toBe("fresh-immutable-source");
  const result = await Bun.build({
    entrypoints: [join(out, "packages/web/check.ts")],
    target: "bun",
    outdir: join(out, "dist"),
  });
  expect(result.success).toBe(true);
  expect(run([process.execPath, result.outputs[0]!.path], out)).toBe("fresh-immutable-source");
  const receipt = await Bun.file(join(out, "jit-workspace-inputs.json")).json();
  expect(receipt.files.find((input: { path: string }) => input.path === "bun.lock").sha256).toBe(
    new Bun.CryptoHasher("sha256").update(lock).digest("hex"),
  );
  await Bun.write(join(out, "package.json"), '{"workspaces":[]}');
  await expect(exportJitWorkspaceMetadata(tree, out)).rejects.toThrow("immutable source");
});

test("JIT metadata refuses a workspace symlink into another owner", async () => {
  using fixture = tempDir("site-jit-symlink", {});
  const root = String(fixture);
  mkdirSync(join(root, "other"));
  mkdirSync(join(root, "out"));
  const packageBytes = new TextEncoder().encode(JSON.stringify({ workspaces: ["packages/*"] }));
  const tree = {
    sha: "a".repeat(40),
    files: new Map([
      ["package.json", "a"],
      ["bun.lock", "b"],
      ["packages/web/package.json", "c"],
    ]),
    readBytes(paths: string[]) {
      const files = new Map([
        ["package.json", packageBytes],
        ["bun.lock", new TextEncoder().encode("{}")],
        ["packages/web/package.json", new TextEncoder().encode('{"name":"web"}')],
      ]);
      return new Map(paths.map(path => [path, files.get(path)!]));
    },
  } as GitTree;
  symlinkSync(join(root, "other"), join(root, "out/packages"), process.platform === "win32" ? "junction" : "dir");
  await expect(exportJitWorkspaceMetadata(tree, join(root, "out"))).rejects.toThrow("parent");
  expect(await Bun.file(join(root, "other/web/package.json")).exists()).toBe(false);
});

test("graph frontend receipt binds exported source bytes and refuses a changed loader", async () => {
  const paths = [
    "src/js/bun/graph-index.ts",
    "src/js/bun/graphx.ts",
    "scripts/aphrody/graph-index.ts",
    "scripts/aphrody/release-graph-index.ts",
    "scripts/aphrody/fork-graph-docs.ts",
  ];
  using fixture = tempDir(
    "site-jit-frontend",
    Object.fromEntries(paths.map(path => [path, "export const owner = " + JSON.stringify(path) + ";\n"])),
  );
  const root = String(fixture);
  const run = (...args: string[]) => {
    const child = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe", timeout: 5000 });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  };
  run("init");
  run("add", ".");
  run("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const tree = new GitTree(root, "HEAD");
  const receipt = await verifyJitGraphFrontendSources(tree, root);
  expect(receipt.source).toBe(tree.sha);
  expect(receipt.changedBinaryQualified).toBe(false);
  expect(receipt.files.find(file => file.path === "src/js/bun/graph-index.ts")?.gitBlob).toBe(
    tree.files.get("src/js/bun/graph-index.ts"),
  );
  await Bun.write(join(root, "scripts/aphrody/graph-index.ts"), "export const owner = 'changed';\n");
  await expect(verifyJitGraphFrontendSources(tree, root)).rejects.toThrow("immutable source");
});

test("Cloudflare dependency reuse binds the real installed version to its captured pins", async () => {
  using fixture = tempDir("site-jit-cloudflare", {});
  const root = String(fixture),
    out = join(root, "jit");
  const installed = join(root, "packages/bun-cloudflare");
  const captured = join(out, "packages/bun-cloudflare");
  const manifest = { name: "cloudflare-owner", dependencies: { wrangler: "1.0.0" } };
  const lock = JSON.stringify({ packages: { wrangler: ["wrangler@1.0.0"] } });
  for (const owner of [installed, captured]) {
    await Bun.write(join(owner, "package.json"), JSON.stringify(manifest));
    await Bun.write(join(owner, "bun.lock"), lock);
    mkdirSync(join(owner, "src"));
  }
  await Bun.write(join(installed, "node_modules/wrangler/package.json"), '{"name":"wrangler","version":"1.0.0"}');
  symlinkSync(
    join(installed, "node_modules"),
    join(captured, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  expect((await verifyJitCloudflareDependencies(root, out, "a".repeat(40))).version).toBe("1.0.0");
  await Bun.write(join(installed, "node_modules/wrangler/package.json"), '{"name":"wrangler","version":"0.9.0"}');
  await expect(verifyJitCloudflareDependencies(root, out, "a".repeat(40))).rejects.toThrow("captured version");
  await Bun.write(
    join(installed, "package.json"),
    JSON.stringify({ ...manifest, dependencies: { wrangler: "0.9.0" } }),
  );
  await expect(verifyJitCloudflareDependencies(root, out, "a".repeat(40))).rejects.toThrow("pins differ");
});

test("Cloudflare dependency reuse accepts only its configured native shared store", async () => {
  using fixture = tempDir("site-jit-global-store", {});
  const root = String(fixture),
    out = join(root, "jit"),
    cache = join(root, "shared-cache");
  const installed = join(root, "packages/bun-cloudflare");
  const captured = join(out, "packages/bun-cloudflare");
  const manifest = { name: "cloudflare-owner", dependencies: { wrangler: "1.0.0" } };
  const lock = JSON.stringify({ packages: { wrangler: ["wrangler@1.0.0"] } });
  for (const owner of [installed, captured]) {
    await Bun.write(join(owner, "package.json"), JSON.stringify(manifest));
    await Bun.write(join(owner, "bun.lock"), lock);
    mkdirSync(join(owner, "src"));
  }
  await Bun.write(
    join(installed, "bunfig.toml"),
    Bun.TOML.stringify({ install: { cache, linker: "isolated", globalStore: true } })!,
  );
  const entry = join(cache, "links/wrangler@1.0.0-0123456789abcdef/node_modules/wrangler");
  await Bun.write(join(entry, "package.json"), '{"name":"wrangler","version":"1.0.0"}');
  mkdirSync(join(installed, "node_modules"));
  const type = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(entry, join(installed, "node_modules/wrangler"), type);
  symlinkSync(join(installed, "node_modules"), join(captured, "node_modules"), type);
  let selectedCache = cache;
  const ownerCache = async (owner: string) => {
    expect(owner).toBe(installed);
    return selectedCache;
  };
  const receipt = await verifyJitCloudflareDependencies(root, out, "a".repeat(40), ownerCache);
  expect(receipt.version).toBe("1.0.0");
  expect(receipt.manifestSha256).toBe(
    new Bun.CryptoHasher("sha256").update(await Bun.file(join(entry, "package.json")).bytes()).digest("hex"),
  );
  await Bun.write(join(entry, "package.json"), '{"name":"foreign","version":"1.0.0"}');
  await expect(verifyJitCloudflareDependencies(root, out, "a".repeat(40), ownerCache)).rejects.toThrow(
    "captured version",
  );
  await Bun.write(join(entry, "package.json"), '{"name":"wrangler","version":"1.0.0"}');
  selectedCache = join(root, "foreign-cache");
  mkdirSync(selectedCache);
  await expect(verifyJitCloudflareDependencies(root, out, "a".repeat(40), ownerCache)).rejects.toThrow("owner store");
  unlinkSync(join(captured, "node_modules"));
  await Bun.write(join(captured, "node_modules/wrangler/package.json"), '{"name":"wrangler","version":"1.0.0"}');
  await expect(verifyJitCloudflareDependencies(root, out, "a".repeat(40), ownerCache)).rejects.toThrow(
    "Cloudflare owner",
  );
});
