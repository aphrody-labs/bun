// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bunExe, tempDir } from "../../../test/harness.ts";
import { runPublicIndexCommand } from "../src/public-index-cli.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function fixture(root: string) {
  const policySha256 = "a".repeat(64);
  const policy = {
    google: {
      pointer: "google.pointer.json",
      hosts: ["example.org"],
      policySha256,
      owner: "aphrody-web-crawl",
    },
  };
  const text = "Bun public search Rust café";
  const snapshot = JSON.stringify({
    schemaVersion: 1,
    collection: "google",
    generatedAt: "2026-10-11T16:00:00Z",
    provenance: {
      owner: "aphrody-web-crawl",
      sourceRevision: "b".repeat(40),
      policySha256,
      anonymous: true,
      public: true,
    },
    documents: [
      {
        url: "https://example.org/bun",
        title: "Bun CLI",
        text,
        contentBytes: Buffer.byteLength(text),
        contentSha256: hash(text),
      },
    ],
    coverage: {
      attempted: 1,
      done: 1,
      pending: 0,
      failed: 0,
      complete: true,
      timedOut: false,
      exported: 1,
    },
  });
  const sha = hash(snapshot);
  await writeFile(join(root, `${sha}.json`), snapshot);
  await writeFile(
    join(root, "google.pointer.json"),
    JSON.stringify({ schemaVersion: 1, collection: "google", file: `${sha}.json`, sha256: sha }),
  );
  const config = join(root, "policy.json");
  await writeFile(config, JSON.stringify(policy));
  return ["--root", root, "--collections-file", config, "--collection", "google", "--query", "Bun"];
}

test("public CLI delegates real FTS queries with explicit policy and bounds", async () => {
  using dir = tempDir("public-index-cli-query", {});
  const args = await fixture(String(dir));
  const result = await runPublicIndexCommand(args);
  expect(result).toHaveProperty("body.source", "public-crawl-cache");
  expect(result).toHaveProperty("body.organic", [
    { title: "Bun CLI", url: "https://example.org/bun", snippet: "Bun public search Rust café" },
  ]);
  expect(result).toHaveProperty("cache", "miss");
  expect(result).toHaveProperty("etag");
  expect(await runPublicIndexCommand([...args, "--start", "1", "--num", "1"])).toHaveProperty("body.organic", []);
});

test("help and invalid arguments never discover a policy or private store", async () => {
  expect(await runPublicIndexCommand(["--help"])).toHaveProperty("command", "bun-google-index-public");
  for (const args of [
    [],
    ["--unknown", "secret"],
    ["--root"],
    ["--help", "x"],
    ["--root", "relative", "--root", "duplicate"],
  ])
    await expect(runPublicIndexCommand(args)).rejects.toThrow("Invalid public index arguments");
  using dir = tempDir("public-index-cli-invalid", {});
  const args = [
    "--root",
    String(dir),
    "--collections-file",
    join(String(dir), "missing.json"),
    "--collection",
    "google",
    "--query",
    "Bun",
  ];
  for (const bounds of [
    ["--num", "21"],
    ["--start", "-1"],
    ["--start", "1001"],
    ["--num", "1.5"],
  ])
    await expect(runPublicIndexCommand([...args, ...bounds])).rejects.toThrow("Invalid public index arguments");
  await expect(runPublicIndexCommand(args)).rejects.toThrow("Public index unavailable");
});

test("policy size, malformed files and unapproved exports fail with redacted errors", async () => {
  using dir = tempDir("public-index-cli-policy", {});
  const args = await fixture(String(dir));
  const config = join(String(dir), "policy.json");
  for (const bad of [
    "private-secret-not-json",
    "[]",
    "x".repeat(65537),
    JSON.stringify({
      google: {
        pointer: "private.sqlite",
        hosts: ["127.0.0.1"],
        policySha256: "a".repeat(64),
        owner: "private-home",
      },
    }),
  ]) {
    await writeFile(config, bad);
    try {
      await runPublicIndexCommand(args);
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Public index unavailable");
    }
  }
});

test("aborted public CLI never creates an index", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(runPublicIndexCommand(["--help"], controller.signal)).rejects.toThrow();
});

test("standalone public CLI executes JSON output and redacts failure stderr", async () => {
  using dir = tempDir("public-index-cli-process", {});
  const args = await fixture(String(dir));
  const entry = resolve(import.meta.dir, "../src/public-index-cli.ts");
  const child = Bun.spawn([bunExe(), entry, ...args], {
    cwd: String(dir),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  expect(JSON.parse(stdout)).toHaveProperty("body.organic.0.url", "https://example.org/bun");
  expect(stderr).toBe("");
  expect(await child.exited).toBe(0);
  const bad = Bun.spawn([bunExe(), entry, "--unknown", "private-secret"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(await new Response(bad.stdout).text()).toBe("");
  expect(await new Response(bad.stderr).text()).toBe(
    "Public index command failed; verify explicit public configuration and input\n",
  );
  expect(await bad.exited).toBe(1);
});
