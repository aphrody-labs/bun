import { expect, test } from "bun:test";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { tempDir } from "../../../test/harness";
import { siteSyncFreshness, siteSyncInputs, syncSite, validateSiteSyncConfig, type SiteSyncConfig } from "./sync";

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
  expect(() => validateSiteSyncConfig({ ...value, sourceRemote: "-upload-pack=other" })).toThrow("remote");
  expect(() => validateSiteSyncConfig({ ...value, runtimeFactFiles: [] })).toThrow("measured");
  expect(() => validateSiteSyncConfig({ ...value, runtimeFactFiles: [], allowUnqualifiedRuntime: true })).not.toThrow();
  expect(() => validateSiteSyncConfig({ ...value, editorial: "true" as any })).toThrow("booleans");
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
  expect((await siteSyncInputs({ ...value, editorial: true })).sha256).not.toBe(second.sha256);
  const pending = await siteSyncInputs({ ...value, runtimeFactFiles: [], allowUnqualifiedRuntime: true });
  expect(pending.runtime).toEqual([]);
  expect(pending.runtimeQualification).toBe("explicitly-pending");
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
  git("config", "--unset-all", "remote.origin.fetch");
  const exported = git("rev-parse", "HEAD");
  await Bun.write(join(root, "source.txt"), "second");
  commit();
  const value = config(root);
  await expect(syncSite(value, { dryRun: true, source: exported })).rejects.toThrow("generator revision differs");
  expect(git("rev-parse", "origin/main")).not.toBe(exported);
  expect(existsSync(value.buildRoot)).toBe(false);
  git("remote", "add", "bun-source", root);
  const originSource = git("rev-parse", "origin/main");
  await Bun.write(join(root, "source.txt"), "third");
  commit();
  await expect(
    syncSite({ ...value, sourceRemote: "bun-source" }, { dryRun: true, source: originSource }),
  ).rejects.toThrow("generator revision differs");
  expect(git("rev-parse", "bun-source/main")).not.toBe(originSource);
  expect(git("rev-parse", "origin/main")).toBe(originSource);
  expect(existsSync(value.buildRoot)).toBe(false);
});

const freshSource = "a".repeat(40),
  freshSnapshot = "b".repeat(64),
  freshEvidence = "c".repeat(64);
const freshRoutes = ["/guides/typed-decisions", "/guides/code-graph", "/blog/video-native", "/blog/native-quality"];
function savedFreshReceipt() {
  return {
    schema: 1,
    commit: freshSource,
    evidence: freshEvidence,
    snapshot: { source: freshSource, id: freshSnapshot },
    editorial: {
      source: freshSource,
      snapshot: freshSnapshot,
      validator: "bun:yolo",
      pages: freshRoutes.map(path => ({ path })),
    },
    production: { qualified: true, expectedSource: freshSource, expectedSnapshot: freshSnapshot },
  };
}
function freshnessFixture(
  change?: (path: string, value: Record<string, unknown>) => Response | Record<string, unknown> | undefined,
) {
  const requests: string[] = [];
  const metadata: Record<string, Record<string, unknown>> = {
    "/publish.json": { commit: freshSource, evidence: freshEvidence },
    "/api/site/snapshot": { id: freshSnapshot, source: freshSource, profile: "bun", repository: "aphrody-labs/bun" },
    "/site.json": {
      commit: freshSource,
      editorial: { source: freshSource, snapshot: freshSnapshot, validator: "bun:yolo" },
    },
    "/editorial-provenance.json": {
      source: freshSource,
      snapshot: freshSnapshot,
      validator: "bun:yolo",
      pages: freshRoutes.map(path => ({ path })),
    },
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push(path);
      const value = metadata[path] ?? {};
      const changed = change?.(path, value);
      if (changed instanceof Response) return changed;
      if (metadata[path]) return Response.json(changed ?? value);
      return new Response(
        `<html><head><title>Fixture</title><link rel="canonical" href="${server.url.origin}${path}"></head><body>Fixture</body></html>`,
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  return { server, requests };
}

test("same-source publication needs the saved current evidence and actual immutable database snapshot", async () => {
  using directory = tempDir("site-sync-fresh-db", { "last-sync.json": JSON.stringify(savedFreshReceipt()) });
  for (const broken of ["none", "id", "source", "offline", "oversize"] as const) {
    const { server } = freshnessFixture((path, value) =>
      path === "/api/site/snapshot"
        ? broken === "offline"
          ? new Response("unavailable", { status: 503 })
          : broken === "oversize"
            ? new Response("x".repeat(1024 * 1024 + 1))
            : broken === "id"
              ? { ...value, id: "d".repeat(64) }
              : broken === "source"
                ? { ...value, source: "d".repeat(40) }
                : undefined
        : undefined,
    );
    try {
      expect(
        (await siteSyncFreshness({ buildRoot: String(directory) }, freshSource, freshEvidence, server.url.origin))
          .fresh,
      ).toBe(broken === "none");
      expect(
        (await siteSyncFreshness({ buildRoot: String(directory) }, freshSource, "d".repeat(64), server.url.origin))
          .fresh,
      ).toBe(false);
    } finally {
      server.stop(true);
    }
  }
});

test("editorial freshness requalifies thirteen actual routes and writes only sanitized fresh proof", async () => {
  using directory = tempDir("site-sync-fresh-routes", { "last-sync.json": JSON.stringify(savedFreshReceipt()) });
  for (const broken of [false, true]) {
    const { server, requests } = freshnessFixture(path =>
      broken && path === freshRoutes[0] ? new Response("gone", { status: 404 }) : undefined,
    );
    try {
      const current = await siteSyncFreshness(
        { buildRoot: String(directory), editorial: true },
        freshSource,
        freshEvidence,
        server.url.origin,
      );
      expect(current.fresh).toBe(!broken);
      expect(new Set(requests).size).toBe(13);
      if (!broken) {
        expect(current.production?.routes).toHaveLength(13);
        const proof = await Bun.file(join(String(directory), "last-production-verification.json")).json();
        expect(proof.qualified).toBe(true);
        expect(proof.expectedSnapshot).toBe(freshSnapshot);
        expect(JSON.stringify(proof)).not.toContain("<html>");
      }
    } finally {
      server.stop(true);
    }
  }
});

test("missing, stale, unqualified or unsafe last receipts cannot short-circuit regeneration", async () => {
  using directory = tempDir("site-sync-fresh-receipt", {});
  const { server, requests } = freshnessFixture();
  const settings = { buildRoot: String(directory), editorial: true };
  try {
    expect((await siteSyncFreshness(settings, freshSource, freshEvidence, server.url.origin)).fresh).toBe(false);
    expect(requests).toEqual([]);
    const cases = [
      { ...savedFreshReceipt(), evidence: "d".repeat(64) },
      { ...savedFreshReceipt(), snapshot: { id: freshSnapshot, source: "d".repeat(40) } },
      {
        ...savedFreshReceipt(),
        production: { qualified: false, expectedSource: freshSource, expectedSnapshot: freshSnapshot },
      },
      {
        ...savedFreshReceipt(),
        editorial: { ...savedFreshReceipt().editorial, pages: [{ path: "https://example.invalid/secret" }] },
      },
    ];
    for (const receipt of cases) {
      await Bun.write(join(String(directory), "last-sync.json"), JSON.stringify(receipt));
      expect((await siteSyncFreshness(settings, freshSource, freshEvidence, server.url.origin)).fresh).toBe(false);
    }
    expect(requests.every(path => path === "/publish.json" || path === "/api/site/snapshot")).toBe(true);
  } finally {
    server.stop(true);
  }
});
