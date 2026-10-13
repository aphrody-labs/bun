import { expect, test } from "bun:test";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { tempDir } from "../../../test/harness";
import { siteSyncInputs, syncSite, validateSiteSyncConfig, type SiteSyncConfig } from "./sync";

const fact = (target: string) => ({
  schema: 1,
  capturedAt: "2026-10-13T00:00:00Z",
  source: "a".repeat(40),
  version: "1.4.4",
  target,
  binary: { sha256: "b".repeat(64), bytes: 64 },
  nativeVideo: { available: true, methods: ["metadata"] },
  nativeImage: { available: true, methods: ["resize"] },
  gates: [{ sha256: "c".repeat(64), passed: 6, failed: 0, assertions: 24 }],
});
function config(root: string): SiteSyncConfig {
  return {
    checkout: root,
    captureRoot: root,
    buildRoot: join(root, "build"),
    runtimeFactFiles: [join(root, "windows.json")],
    ownerConnectionFile: join(root, "owner.url"),
    readerConnectionFile: join(root, "reader.url"),
    credentialFile: join(root, "key"),
  };
}

test("main synchronization rejects missing measured evidence and relative protected references", () => {
  using directory = tempDir("site-sync-config", {});
  const value = config(String(directory));
  expect(() => validateSiteSyncConfig(value)).not.toThrow();
  expect(() => validateSiteSyncConfig({ ...value, credentialFile: "relative-key" })).toThrow("absolute");
  expect(() => validateSiteSyncConfig({ ...value, runtimeFactFiles: [] })).toThrow("measured");
  expect(() =>
    validateSiteSyncConfig({ ...value, runtimeFactFiles: [...value.runtimeFactFiles, ...value.runtimeFactFiles] }),
  ).toThrow("distinct");
});

test("auto-sync identity changes with fresh binary receipts and retains their actual source", async () => {
  using directory = tempDir("site-sync-inputs", {
    "manifest.json": '{"source":"https://bun.com/"}',
    "windows.json": JSON.stringify(fact("win32-x64")),
  });
  const value = config(String(directory));
  const first = await siteSyncInputs(value);
  expect(first.runtime[0]).toMatchObject({ source: "a".repeat(40), target: "win32-x64" });
  expect(JSON.stringify(first)).not.toContain(String(directory));
  const changed = { ...fact("win32-x64"), source: "d".repeat(40) };
  await Bun.write(value.runtimeFactFiles[0]!, JSON.stringify(changed));
  const second = await siteSyncInputs(value);
  expect(second.sha256).not.toBe(first.sha256);
  expect(second.runtime[0]!.source).toBe(changed.source);
  expect(second.runtime[0]!.sha256).toBe(new Bun.CryptoHasher("sha256").update(JSON.stringify(changed)).digest("hex"));
});

test("receipt ordering is immaterial while duplicate target and forged binary metadata fail", async () => {
  using directory = tempDir("site-sync-targets", {
    "manifest.json": "{}",
    "windows.json": JSON.stringify(fact("win32-x64")),
    "linux.json": JSON.stringify(fact("linux-x64")),
  });
  const value = config(String(directory));
  const files = [value.runtimeFactFiles[0]!, join(String(directory), "linux.json")];
  expect((await siteSyncInputs({ ...value, runtimeFactFiles: files })).sha256).toBe(
    (await siteSyncInputs({ ...value, runtimeFactFiles: [...files].reverse() })).sha256,
  );
  await Bun.write(files[1]!, JSON.stringify(fact("win32-x64")));
  await expect(siteSyncInputs({ ...value, runtimeFactFiles: files })).rejects.toThrow("duplicate");
  await Bun.write(files[0]!, JSON.stringify({ ...fact("win32-x64"), binary: { bytes: 64, sha256: "invented" } }));
  await expect(siteSyncInputs(value)).rejects.toThrow("receipt");
});

test("a main push after the generator export fails before creating publication work", async () => {
  using directory = tempDir("site-sync-revision", {
    "manifest.json": "{}",
    "windows.json": JSON.stringify(fact("win32-x64")),
    "source.txt": "first",
  });
  const root = String(directory);
  const git = (...args: string[]) => {
    const child = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe", timeout: 10000 });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return child.stdout.toString().trim();
  };
  const commit = () =>
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-am", "fixture");
  git("init", "--initial-branch=main");
  git("add", ".");
  commit();
  git("remote", "add", "origin", root);
  const exported = git("rev-parse", "HEAD");
  await Bun.write(join(root, "source.txt"), "second");
  commit();
  const value = config(root);
  await expect(syncSite(value, { dryRun: true, source: exported })).rejects.toThrow("generator revision differs");
  expect(git("rev-parse", "origin/main")).not.toBe(exported);
  expect(existsSync(value.buildRoot)).toBe(false);
});
