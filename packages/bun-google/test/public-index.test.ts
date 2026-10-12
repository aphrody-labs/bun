// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { link, mkdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bunExe, tempDir } from "../../../test/harness.ts";
import { createPublicIndexSearch, type PublicIndexSdkOptions } from "../src/public-index.ts";

const policy = "a".repeat(64);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const doc = (text = "Bun Rust search café 東京", path = "bun") => ({
  url: `https://example.org/${path}`,
  title: "Bun public search",
  text,
  contentBytes: Buffer.byteLength(text),
  contentSha256: hash(text),
});
const snapshot = (collection = "google", text?: string) => ({
  schemaVersion: 1,
  collection,
  generatedAt: "2026-10-11T15:00:00.000Z",
  provenance: {
    owner: "aphrody-web-crawl",
    sourceRevision: "b".repeat(40),
    policySha256: policy,
    anonymous: true,
    public: true,
  },
  documents: [doc(text)],
  coverage: {
    attempted: 1,
    done: 1,
    pending: 0,
    locked: 0,
    failed: 0,
    complete: true,
    timedOut: false,
    exported: 1,
  },
});
function options(root: string, collections = ["google"]): PublicIndexSdkOptions {
  return {
    root,
    collections: Object.fromEntries(
      collections.map(name => [
        name,
        {
          pointer: `${name}.pointer.json`,
          hosts: ["example.org"],
          policySha256: policy,
          owner: "aphrody-web-crawl",
        },
      ]),
    ),
  };
}
async function publish(root: string, value: unknown, collection = "google") {
  const json = JSON.stringify(value);
  const sha = hash(json);
  await writeFile(join(root, `${sha}.json`), json);
  await writeFile(
    join(root, `${collection}.pointer.json`),
    JSON.stringify({ schemaVersion: 1, collection, file: `${sha}.json`, sha256: sha }),
  );
  return sha;
}
const request = { query: "Bun", collection: "google", num: 10, start: 0 };

describe("Explicit public snapshot SQLite FTS5 projection", () => {
  test("published package subpath loads in an isolated Bun consumer", async () => {
    using dir = tempDir("public-index-package-consumer", {});
    const namespace = join(String(dir), "node_modules", "@aphrody");
    await mkdir(namespace, { recursive: true });
    await symlink(
      resolve(import.meta.dir, ".."),
      join(namespace, "bun-google"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const child = Bun.spawn(
      [
        bunExe(),
        "-e",
        "const sdk=await import('@aphrody/bun-google/public-index');console.log(typeof sdk.createPublicIndexSearch)",
      ],
      { cwd: String(dir), stdout: "pipe", stderr: "pipe" },
    );
    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    expect(stdout.trim()).toBe("function");
    expect(stderr).toBe("");
    expect(await child.exited).toBe(0);
  });
  test("real FTS search, literal operators, Unicode and immutable cache results", async () => {
    using dir = tempDir("public-index-fts", {});
    await publish(String(dir), snapshot());
    const search = createPublicIndexSearch(options(String(dir)));
    try {
      const result = await search(request);
      expect(result.body.organic).toEqual([
        {
          title: "Bun public search",
          url: "https://example.org/bun",
          snippet: "Bun Rust search café 東京",
        },
      ]);
      expect(result.body.source).toBe("public-crawl-cache");
      expect(result.cache).toBe("miss");
      expect(result.etag).toMatch(/^"[a-f0-9]{64}"$/);
      result.body.organic[0]!.title = "modified by consumer";
      const hit = await search(request);
      expect(hit.cache).toBe("hit");
      expect(hit.etag).toBe(result.etag);
      expect(hit.body.organic[0]!.title).toBe("Bun public search");
      expect((await search({ ...request, query: "cafe 東京" })).body.organic).toHaveLength(1);
      expect((await search({ ...request, query: '"Bun" OR nonexistent' })).body.organic).toHaveLength(0);
      expect((await search({ ...request, query: "* : () -" })).body.organic).toEqual([]);
      expect((await search({ ...request, start: 1 })).body.organic).toEqual([]);
    } finally {
      search.close();
    }
  });

  test("changed snapshots invalidate ETags/results and collections stay isolated", async () => {
    using dir = tempDir("public-index-revisions", {});
    await publish(String(dir), snapshot());
    const other = snapshot("other", "Only other collection");
    other.documents[0]!.title = "Other only";
    await publish(String(dir), other, "other");
    const search = createPublicIndexSearch(options(String(dir), ["google", "other"]));
    try {
      const before = await search(request);
      expect((await search({ ...request, collection: "other" })).body.organic).toEqual([]);
      expect((await search({ ...request, collection: "other", query: "other" })).body.organic).toHaveLength(1);
      const afterOtherLoaded = await search(request);
      expect(afterOtherLoaded.etag).toBe(before.etag);
      expect(afterOtherLoaded.body).toEqual(before.body);
      const replacement = snapshot("google", "Replaced public document");
      replacement.documents[0]!.title = "Replaced title";
      await publish(String(dir), replacement);
      const after = await search(request);
      expect(after.etag).not.toBe(before.etag);
      expect(after.cache).toBe("miss");
      expect(after.body.organic).toEqual([]);
      expect((await search({ ...request, query: "Replaced" })).body.organic).toHaveLength(1);
    } finally {
      search.close();
    }
  });

  test("invalid pointers refuse old cached results and a valid rollback recovers", async () => {
    using dir = tempDir("public-index-pointer", {});
    const value = snapshot();
    await publish(String(dir), value);
    const search = createPublicIndexSearch(options(String(dir)));
    try {
      await search(request);
      for (const bad of [
        "not json",
        JSON.stringify({
          schemaVersion: 1,
          collection: "google",
          file: "../private.json",
          sha256: "a".repeat(64),
        }),
        "x".repeat(2049),
      ]) {
        await writeFile(join(String(dir), "google.pointer.json"), bad);
        await expect(search(request)).rejects.toThrow("Public index unavailable");
      }
      await publish(String(dir), value);
      expect((await search(request)).body.organic).toHaveLength(1);
    } finally {
      search.close();
    }
  });

  test("policy, source, public scope, coverage and per-document integrity fail closed", async () => {
    using dir = tempDir("public-index-invalid", {});
    const search = createPublicIndexSearch(options(String(dir)));
    try {
      const changes = [
        (s: ReturnType<typeof snapshot>) => {
          s.provenance.policySha256 = "c".repeat(64);
        },
        (s: ReturnType<typeof snapshot>) => {
          s.provenance.sourceRevision = "main";
        },
        (s: ReturnType<typeof snapshot>) => {
          s.provenance.anonymous = false;
        },
        (s: ReturnType<typeof snapshot>) => {
          s.provenance.public = false;
        },
        (s: ReturnType<typeof snapshot>) => {
          s.coverage.exported = 0;
        },
        (s: ReturnType<typeof snapshot>) => {
          s.coverage.locked = 1;
        },
        (s: ReturnType<typeof snapshot>) => {
          s.documents[0]!.contentBytes++;
        },
        (s: ReturnType<typeof snapshot>) => {
          s.documents[0]!.contentSha256 = "d".repeat(64);
        },
        (s: ReturnType<typeof snapshot>) => {
          s.documents[0]!.url = "https://127.0.0.1/private";
        },
        (s: ReturnType<typeof snapshot>) => {
          s.documents[0]!.url = "https://other.example.org/private";
        },
        (s: ReturnType<typeof snapshot>) => {
          s.documents[0]!.url = "https://user:secret@example.org/private";
        },
        (s: ReturnType<typeof snapshot>) => {
          s.documents[0] = doc("x".repeat(32769));
        },
      ];
      for (const change of changes) {
        const value = snapshot();
        change(value);
        await publish(String(dir), value);
        await expect(search(request)).rejects.toThrow("Public index unavailable");
      }
      const good = snapshot();
      const sha = await publish(String(dir), good);
      await writeFile(join(String(dir), `${sha}.json`), JSON.stringify(snapshot("google", "Corrupted")));
      await expect(search(request)).rejects.toThrow("Public index unavailable");
    } finally {
      search.close();
    }
  });

  test("bounded cache evicts old queries and huge snapshots/doc counts are refused", async () => {
    using dir = tempDir("public-index-bounds", {});
    await publish(String(dir), snapshot());
    const search = createPublicIndexSearch(options(String(dir)));
    try {
      await search(request);
      for (let i = 0; i < 129; i++) await search({ ...request, query: `missing ${i}` });
      expect((await search(request)).cache).toBe("miss");
      const value = snapshot();
      value.documents = Array.from({ length: 1001 }, (_, i) => doc("Bun", `${i}`));
      value.coverage.exported = value.documents.length;
      await publish(String(dir), value);
      await expect(search(request)).rejects.toThrow("Public index unavailable");
      const huge = `${JSON.stringify(snapshot())}${" ".repeat(4 * 1024 * 1024)}`;
      const sha = hash(huge);
      await writeFile(join(String(dir), `${sha}.json`), huge);
      await writeFile(
        join(String(dir), "google.pointer.json"),
        JSON.stringify({
          schemaVersion: 1,
          collection: "google",
          file: `${sha}.json`,
          sha256: sha,
        }),
      );
      await expect(search(request)).rejects.toThrow("Public index unavailable");
    } finally {
      search.close();
    }
  });

  test("requests are bounded, abortable and configuration is explicit", async () => {
    using dir = tempDir("public-index-input", {});
    expect(() => createPublicIndexSearch(options("relative"))).toThrow();
    expect(() => createPublicIndexSearch({ root: String(dir), collections: {} })).toThrow();
    const bad = options(String(dir));
    bad.collections.google!.hosts = ["127.0.0.1"];
    expect(() => createPublicIndexSearch(bad)).toThrow();
    const config = options(String(dir));
    const search = createPublicIndexSearch(config);
    config.collections.google!.hosts.push("other.example.org");
    try {
      for (const input of [
        { ...request, query: "" },
        { ...request, query: "x\n" },
        { ...request, query: "é".repeat(2049) },
        { ...request, query: "x ".repeat(129) },
        { ...request, collection: "../private" },
        { ...request, num: 21 },
        { ...request, num: 1.5 },
        { ...request, start: 1001 },
        { ...request, start: -1 },
      ])
        await expect(search(input)).rejects.toThrow("Invalid public index query");
      const controller = new AbortController();
      controller.abort();
      await expect(search(request, controller.signal)).rejects.toThrow("Search aborted");
      await publish(String(dir), snapshot());
      const duringRead = new AbortController();
      const cancelled = search(request, duringRead.signal);
      duringRead.abort();
      await expect(cancelled).rejects.toThrow("Search aborted");
      expect((await search(request)).body.organic).toHaveLength(1);
      const privateValue = snapshot();
      privateValue.documents[0]!.url = "https://other.example.org/private";
      await publish(String(dir), privateValue);
      await expect(search(request)).rejects.toThrow("Public index unavailable");
    } finally {
      search.close();
    }
  });

  test("symlinked root components are refused", async () => {
    using dir = tempDir("public-index-symlinks", {});
    const root = join(String(dir), "real");
    await mkdir(root);
    await publish(root, snapshot());
    const linked = join(String(dir), "linked");
    await symlink(root, linked, process.platform === "win32" ? "junction" : "dir");
    const search = createPublicIndexSearch(options(linked));
    try {
      await expect(search(request)).rejects.toThrow("Public index unavailable");
    } finally {
      search.close();
    }
    // Windows junctions need no developer-mode symlink permission and exercise parent traversal.
    const nested = createPublicIndexSearch(options(join(linked, ".")));
    try {
      await expect(nested(request)).rejects.toThrow("Public index unavailable");
    } finally {
      nested.close();
    }
  });
  test("hardlinked exports and malformed UTF-8 pointers are refused", async () => {
    using dir = tempDir("public-index-file-identity", {});
    const root = String(dir);
    const sha = await publish(root, snapshot());
    const search = createPublicIndexSearch(options(root));
    try {
      await link(join(root, `${sha}.json`), join(root, "external-hardlink.json"));
      await expect(search(request)).rejects.toThrow("Public index unavailable");
      await writeFile(join(root, "google.pointer.json"), Buffer.from([0xff, 0xfe, 0x7b, 0x7d]));
      await expect(search(request)).rejects.toThrow("Public index unavailable");
    } finally {
      search.close();
    }
  });
});
