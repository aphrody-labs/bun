// SPDX-License-Identifier: MIT
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicIndexSearch } from "../../packages/bun-google/src/public-index.ts";
import {
  buildPublicSnapshot,
  canonicalPublicJson,
  publicSha256,
  publishPublicSnapshot,
  runPublicSnapshotCli,
} from "../../scripts/aphrody/google-public-snapshot.ts";

const policy = {
  collection: "public-docs",
  seeds: ["https://example.com/"],
  hosts: ["example.com"],
  maxRequests: 10,
  maxDepth: 2,
  obeyRobots: true,
  anonymous: true,
} as const;
const mutablePolicy = () => ({ ...policy, seeds: [...policy.seeds], hosts: [...policy.hosts] });
const revision = "a".repeat(40);
const context = { generatedAt: "2026-10-11T12:00:00Z", timedOut: false };
const report = () => ({
  attempts: 1,
  pages: [
    {
      url: "https://example.com/",
      depth: 0,
      status: 200,
      title: "Français",
      text: "Été 日本語",
      markdown: "**unused**",
      blocks: [],
      description: "",
      canonical: "",
      lang: "fr",
      wordCount: 2,
      duplicate: null,
      discoveredLinks: [],
    },
  ],
  errors: [],
  exactDuplicates: 0,
  nearDuplicates: 0,
  frontier: { pending: 0, locked: 0, done: 1, failed: 0 },
});
const directories: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "public-snapshot-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("projects actual CLI fields and hashes exact exported UTF8, not markdown/private metadata", () => {
  const snapshot = buildPublicSnapshot(report(), mutablePolicy(), revision, context);
  expect(snapshot.documents).toEqual([
    {
      url: "https://example.com/",
      title: "Français",
      text: "Été 日本語",
      contentBytes: 15,
      contentSha256: publicSha256("Été 日本語"),
    },
  ]);
  expect(snapshot.coverage).toEqual({
    attempted: 1,
    done: 1,
    pending: 0,
    locked: 0,
    failed: 0,
    complete: true,
    timedOut: false,
    exported: 1,
  });
  expect(snapshot.provenance.policySha256).toBe(publicSha256(canonicalPublicJson(mutablePolicy())));
  const originalPolicy = { ...mutablePolicy(), seeds: ["https://example.com"] };
  expect(
    buildPublicSnapshot(report(), originalPolicy, revision, context).provenance.policySha256,
  ).toBe(publicSha256(canonicalPublicJson(originalPolicy)));
  expect(canonicalPublicJson({ z: 1, a: { z: 2, a: 3 } })).toBe('{"a":{"a":3,"z":2},"z":1}');
  expect(JSON.stringify(snapshot)).not.toContain("markdown");
});

test("producer snapshots are consumed by the canonical SDK with matching public policy", async () => {
  const root = await directory();
  const snapshot = buildPublicSnapshot(report(), mutablePolicy(), revision, context);
  await publishPublicSnapshot(root, report(), mutablePolicy(), revision, context);
  const search = createPublicIndexSearch({
    root,
    collections: {
      "public-docs": {
        pointer: "public-docs.pointer.json",
        hosts: [...policy.hosts],
        owner: "aphrody-web-crawl",
        policySha256: snapshot.provenance.policySha256,
      },
    },
  });
  try {
    const result = await search({ query: "Été", collection: "public-docs", num: 10, start: 0 });
    expect(result.body.organic[0]?.url).toBe("https://example.com/");
    expect(result.body.source).toBe("public-crawl-cache");
    expect(result.cache).toBe("miss");
  } finally {
    search.close();
  }
});

test("producer rejects nonpublic suffixes and title controls required by the SDK contract", () => {
  for (const suffix of ["test", "invalid", "localhost", "internal"]) {
    expect(() =>
      buildPublicSnapshot(
        report(),
        {
          ...mutablePolicy(),
          hosts: [`example.${suffix}`],
          seeds: [`https://example.${suffix}/`],
        },
        revision,
        context,
      ),
    ).toThrow();
  }
  for (const control of ["\n", "\r", "\t"]) {
    const changed = report();
    changed.pages[0]!.title += control;
    expect(() => buildPublicSnapshot(changed, mutablePolicy(), revision, context)).toThrow();
  }
});

test("retains incomplete coverage and rejects persisted frontier counters", () => {
  const partial = report();
  partial.frontier.pending = 3;
  expect(
    buildPublicSnapshot(partial, mutablePolicy(), revision, { ...context, timedOut: true })
      .coverage,
  ).toMatchObject({ complete: false, pending: 3, timedOut: true, exported: 1 });
  partial.frontier.done = 9;
  expect(() => buildPublicSnapshot(partial, mutablePolicy(), revision, context)).toThrow();
  expect(() =>
    buildPublicSnapshot(report(), mutablePolicy(), revision, {
      ...context,
      timedOut: undefined,
    } as never),
  ).toThrow();
  expect(() => buildPublicSnapshot(report(), mutablePolicy(), "missing", context)).toThrow();
  const unfinished = {
    ...report(),
    pages: [],
    frontier: { pending: 0, locked: 0, done: 0, failed: 0 },
  };
  expect(
    buildPublicSnapshot(unfinished, mutablePolicy(), revision, context).coverage.complete,
  ).toBe(false);
  expect(() =>
    buildPublicSnapshot(report(), mutablePolicy(), revision, {
      ...context,
      generatedAt: "2026-02-31T12:00:00Z",
    }),
  ).toThrow();
  expect(
    buildPublicSnapshot(report(), mutablePolicy(), revision, {
      ...context,
      generatedAt: "2026-10-11T14:00:00+02:00",
    }).generatedAt,
  ).toBe("2026-10-11T14:00:00+02:00");
});

test("rejects private/credentialed/foreign URLs even on unsuccessful pages", () => {
  for (const url of [
    "http://example.com/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://user:password@example.com/",
    "https://example.com:8443/",
    "https://other.test/",
    "https://example.com/#session",
  ]) {
    const input = report();
    input.pages[0]!.url = url;
    input.pages[0]!.status = 403;
    expect(() => buildPublicSnapshot(input, mutablePolicy(), revision, context)).toThrow();
  }
  const privateReport = { ...report(), profile: "aphrody" };
  expect(() => buildPublicSnapshot(privateReport, mutablePolicy(), revision, context)).toThrow();
  expect(() =>
    buildPublicSnapshot(
      report(),
      { ...mutablePolicy(), hosts: ["service.internal"] },
      revision,
      context,
    ),
  ).toThrow();
});

test("enforces requests, depth, text, UTF8, document and total-byte budgets", () => {
  const input = report();
  input.attempts = 11;
  expect(() => buildPublicSnapshot(input, mutablePolicy(), revision, context)).toThrow();
  input.attempts = 1;
  input.pages[0]!.depth = 3;
  expect(() => buildPublicSnapshot(input, mutablePolicy(), revision, context)).toThrow();
  input.pages[0]!.depth = 0;
  for (const value of ["é".repeat(16385), "\ud800", "secret\u0000"]) {
    input.pages[0]!.text = value;
    expect(() => buildPublicSnapshot(input, mutablePolicy(), revision, context)).toThrow();
  }
  const oversized = report();
  oversized.attempts = 1001;
  oversized.frontier.done = 1001;
  oversized.pages = Array.from({ length: 1001 }, (_, index) => ({
    ...report().pages[0]!,
    url: `https://example.com/${index}`,
  }));
  const largerPolicy = { ...mutablePolicy(), maxRequests: 2000 };
  expect(() => buildPublicSnapshot(oversized, largerPolicy, revision, context)).toThrow();
  oversized.pages = oversized.pages
    .slice(0, 150)
    .map((page) => ({ ...page, text: "x".repeat(32768) }));
  expect(() => buildPublicSnapshot(oversized, largerPolicy, revision, context)).toThrow();
});

test("publishes immutable verified bytes, invalidates pointer, and retains rollback", async () => {
  const root = await directory();
  const first = await publishPublicSnapshot(root, report(), mutablePolicy(), revision, context);
  const previous = await readFile(join(root, "public-docs.pointer.json"));
  expect(publicSha256(await readFile(join(root, first.pointer.file)))).toBe(first.pointer.sha256);
  expect(first.rollbackFile).toBeUndefined();
  const updated = report();
  updated.pages[0]!.text = "Updated";
  const second = await publishPublicSnapshot(root, updated, mutablePolicy(), revision, context);
  expect(second.pointer.sha256).not.toBe(first.pointer.sha256);
  expect(await readFile(join(root, second.rollbackFile!), "utf8")).toBe(previous.toString());
  expect(JSON.parse(await readFile(join(root, "public-docs.pointer.json"), "utf8"))).toEqual(
    second.pointer,
  );
  expect(
    (await readdir(root)).some((file) => file.endsWith(".tmp") || file.endsWith(".lock")),
  ).toBe(false);
  expect(
    (await publishPublicSnapshot(root, updated, mutablePolicy(), revision, context)).pointer,
  ).toEqual(second.pointer);
});

test("rejects corrupt existing snapshot and preserves pointer", async () => {
  const root = await directory();
  const first = await publishPublicSnapshot(root, report(), mutablePolicy(), revision, context);
  const previous = await readFile(join(root, "public-docs.pointer.json"));
  await writeFile(join(root, first.pointer.file), "tampered");
  await expect(
    publishPublicSnapshot(root, report(), mutablePolicy(), revision, context),
  ).rejects.toThrow();
  expect(await readFile(join(root, "public-docs.pointer.json"))).toEqual(previous);
});

test("validation and foreign pointer refusal never publish or replace anything", async () => {
  const root = await directory();
  const invalid = report();
  invalid.pages[0]!.text = "x".repeat(32769);
  await expect(
    publishPublicSnapshot(root, invalid, mutablePolicy(), revision, context),
  ).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
  const foreign = JSON.stringify({
    schemaVersion: 1,
    collection: "foreign",
    file: `${"b".repeat(64)}.json`,
    sha256: "b".repeat(64),
  });
  await writeFile(join(root, "public-docs.pointer.json"), foreign);
  await expect(
    publishPublicSnapshot(root, report(), mutablePolicy(), revision, context),
  ).rejects.toThrow();
  expect(await readFile(join(root, "public-docs.pointer.json"), "utf8")).toBe(foreign);
  expect(await readdir(root)).toEqual(["public-docs.pointer.json"]);
});

test("rejects symlink roots and symlink pointers without reading targets", async () => {
  const base = await directory();
  const target = await directory();
  const link = join(base, "linked");
  await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  await expect(
    publishPublicSnapshot(link, report(), mutablePolicy(), revision, context),
  ).rejects.toThrow();
  await symlink(
    target,
    join(base, "public-docs.pointer.json"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(
    publishPublicSnapshot(base, report(), mutablePolicy(), revision, context),
  ).rejects.toThrow();
  expect(await readdir(target)).toEqual([]);
});

test("publication refuses an existing lock and a hash-valid foreign snapshot", async () => {
  const root = await directory();
  await writeFile(join(root, "public-docs.publish.lock"), "foreign-owner");
  await expect(
    publishPublicSnapshot(root, report(), mutablePolicy(), revision, context),
  ).rejects.toThrow();
  expect(await readFile(join(root, "public-docs.publish.lock"), "utf8")).toBe("foreign-owner");
  await rm(join(root, "public-docs.publish.lock"));
  const foreign = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      collection: "private",
      provenance: { owner: "private-home" },
    }),
  );
  const sha = publicSha256(foreign);
  await writeFile(join(root, `${sha}.json`), foreign);
  const pointer = JSON.stringify({
    schemaVersion: 1,
    collection: "public-docs",
    file: `${sha}.json`,
    sha256: sha,
  });
  await writeFile(join(root, "public-docs.pointer.json"), pointer);
  await expect(
    publishPublicSnapshot(root, report(), mutablePolicy(), revision, context),
  ).rejects.toThrow();
  expect(await readFile(join(root, "public-docs.pointer.json"), "utf8")).toBe(pointer);
  expect(await readdir(root)).toHaveLength(2);
});

test("CLI requires explicit completion receipt and plans without publishing", async () => {
  const root = await directory();
  const inputs = await directory();
  const reportFile = join(inputs, "report.json");
  const policyFile = join(inputs, "policy.json");
  await writeFile(reportFile, JSON.stringify(report()));
  await writeFile(policyFile, JSON.stringify(mutablePolicy()));
  const args = [
    "--report",
    reportFile,
    "--policy",
    policyFile,
    "--source-revision",
    revision,
    "--root",
    root,
  ];
  await expect(runPublicSnapshotCli(args)).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
  args.push("--generated-at", context.generatedAt, "--timed-out", "false");
  await runPublicSnapshotCli(args);
  expect(await readdir(root)).toEqual([]);
  await runPublicSnapshotCli([...args, "--apply"]);
  expect((await readdir(root)).sort()).toEqual([
    expect.stringMatching(/^[a-f0-9]{64}\.json$/),
    "public-docs.pointer.json",
  ]);
});
