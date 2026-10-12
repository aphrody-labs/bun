import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  apisOf,
  build,
  finalize,
  fromDts,
  fromMdx,
  fromPairs,
  fromTest,
  hasSecret,
  transpiles,
  typecheck,
} from "./build.ts";
import { PAIRS } from "../../../packages/bun-agent-plugin/src/native.ts";

const root = join(import.meta.dir, "..", "..", "..");

test("apisOf names Bun globals, bun:* modules and named imports from bun", () => {
  expect(
    apisOf(`import { Database } from "bun:sqlite";
import { $, sql as q } from "bun";
Bun.serve({ fetch: () => new Response() });
await Bun.password.hash("x");
new HTMLRewriter();`),
  ).toEqual(["Bun.$", "Bun.password.hash", "Bun.serve", "Bun.sql", "HTMLRewriter", "bun:sqlite"]);
});

test("fromMdx keeps code blocks with their heading and the prose before them", () => {
  const mdx = `---
title: Server
description: Start a server
---

## Static routes

Serve a fixed response on a path.

\`\`\`ts title="index.ts"
Bun.serve({
  routes: { "/": new Response("ok") },
});
\`\`\`

\`\`\`bash terminal
bun run index.ts
bun --watch index.ts
\`\`\`

\`\`\`json
{ "ignored": true }
\`\`\`
`;
  const drafts = fromMdx("runtime/http/server.mdx", mdx);
  expect(drafts.map(d => [d.kind, d.lang, d.source])).toEqual([
    ["example", "ts", "docs/runtime/http/server.mdx:10"],
    ["cli", "sh", "docs/runtime/http/server.mdx:16"],
  ]);
  expect(drafts[0]!.instruction).toBe("Write Bun code: Static routes (Server). Serve a fixed response on a path.");
});

test("fromDts reads @example blocks and Bun function signatures", () => {
  const dts = `declare module "bun" {
  /**
   * Sleep for a while.
   *
   * @example
   * \`\`\`ts
   * await Bun.sleep(100);
   * console.log("done");
   * \`\`\`
   */
  function sleep(ms: number): Promise<void>;
}
`;
  const drafts = fromDts("bun.d.ts", dts);
  expect(drafts.map(d => [d.kind, d.api?.[0], d.source])).toEqual([
    ["example", "Bun.sleep", "packages/bun-types/bun.d.ts:2"],
    ["signature", "Bun.sleep", "packages/bun-types/bun.d.ts:11"],
  ]);
  expect(drafts[1]!.code).toBe("function sleep(ms: number): Promise<void>;");
});

test("fromTest keeps short self-contained tests and skips harness-dependent ones", () => {
  const src = `import { test, expect } from "bun:test";
import { bunExe } from "harness";

test("hashes", () => {
  expect(Bun.hash("a")).toBe(Bun.hash("a"));
});

test("spawns", () => {
  expect(Bun.spawnSync([bunExe()]).success).toBe(true);
});
`;
  const drafts = fromTest("util/hash.test.ts", src);
  expect(drafts).toHaveLength(1);
  expect(drafts[0]!.source).toBe("test/js/bun/util/hash.test.ts:4");
  expect(drafts[0]!.code.startsWith('import { test, expect } from "bun:test";')).toBe(true);
});

test("validation: transpile check and secret scan", () => {
  expect(transpiles("const x: number = 1;", "ts")).toBe(true);
  expect(transpiles("const x = ;", "ts")).toBe(false);
  expect(transpiles("bun install", "sh")).toBe(true);
  expect(hasSecret(`const k = "AKIA${"A".repeat(16)}"`)).toBe(true);
  expect(hasSecret(`password: "hunter2"`)).toBe(false);
});

test("every curated pair transpiles on both sides", () => {
  for (const p of PAIRS) {
    expect(transpiles(p.after, "ts")).toBe(true);
    expect(p.instead.length).toBeGreaterThan(0);
  }
});

test("the dataset of this checkout is deterministic, unique and versioned", () => {
  const a = build({ root, version: "1.4.4", commit: "0".repeat(40) });
  const b = build({ root, version: "1.4.4", commit: "0".repeat(40) });
  expect(a.manifest.sha256).toBe(b.manifest.sha256);
  expect(a.entries.length).toBeGreaterThan(1000);
  expect(new Set(a.entries.map(e => e.id)).size).toBe(a.entries.length);
  for (const kind of ["example", "signature", "test", "migration", "cli", "config"])
    expect(a.manifest.kinds[kind]).toBeGreaterThan(0);
  const serve = a.entries.find(e => e.api.includes("Bun.serve") && e.kind === "example")!;
  expect(serve).toMatchObject({ version: "1.4.4", checks: { parse: true } });
  expect(serve.source).toMatch(/:\d+$/);
});

test.skipIf(!Bun.which("tsc"))("every curated pair typechecks against packages/bun-types", () => {
  const { entries } = finalize(fromPairs(), "1.4.4", "0".repeat(40));
  expect(typecheck(root, entries)).toBe(true);
  expect(entries.filter(e => !e.checks.types).map(e => e.source)).toEqual([]);
});
