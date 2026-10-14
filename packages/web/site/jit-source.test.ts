import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { GitTree } from "./collect";
import { exportJitWorkspaceMetadata, jitWorkspaceMetadata, verifyJitCloudflareDependencies } from "./jit-source";

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
