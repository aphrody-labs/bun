import { expect, test } from "bun:test";
import { tempDir } from "harness";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adaptProductHome, buildFusion, designResources } from "../../scripts/aphrody/site-mirror/fuse.ts";
import { FUSION_SYMBOLS, navigationSymbol, symbol } from "../../packages/web/site/icons.ts";

const sha = "a".repeat(40);
const home =
  '<!doctype html><html><head><title>Bun</title></head><body><a aria-label="Bun — home" href="/">Bun</a><nav aria-label="Primary"><a href="/docs">Docs</a></nav><section class="register"><h1>Bun is fast</h1><p>Runtime intro</p><p>Install Bun v1.4.3</p><div data-upstream-benchmark="48,243">Upstream result</div></section><section aria-labelledby="toolkit-heading"><a href="/docs/runtime">Runtime</a></section><aside class="aphrody-fork"></aside></body></html>';
const hash = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");

test("rendered design references come from both captured inputs", () => {
  const google = '<a href="/library/type-design/">Type design</a>';
  const material = [{ title: "Shape", source_url: "https://m3.material.io/styles/shape" }];
  const html = designResources(google, material);
  expect(html).toContain("Type design");
  expect(html).toContain("https://design.google/library/type-design/");
  expect(html).toContain("Shape");
  expect(designResources(google.replace("Type design", "New typography"), material)).not.toBe(html);
  expect(designResources(google, [{ ...material[0], title: "New shapes" }])).not.toBe(html);
  expect(designResources('<a href="https://evil.test/library/test">Private</a>', [])).not.toContain("evil.test");
});

test("mirror fusion brands structured elements and preserves upstream evidence", () => {
  const html = adaptProductHome(home, sha);
  expect(html).toContain("<h1>Bun OS</h1>");
  expect(html).toContain('aria-label="Bun OS — home"');
  expect(html).toContain('src="/mirror-assets/symbols/menu_book.svg"');
  expect(html).toContain("Stable Bun OS release qualification in progress");
  expect(html).toContain("Install a published runtime");
  expect(html).not.toContain("Install Bun v1.4.3");
  expect(html).toContain('data-upstream-benchmark="48,243">Upstream result');
  expect(html).toContain("do not qualify Bun OS performance or releases");
  expect(html).toContain(sha);
  expect(() => symbol("<script>")).toThrow("Invalid Material Symbol");
  expect(navigationSymbol("/graph/")).toBe("account_tree");
});

test("fusion manifest qualifies document bytes and keeps failed Google mirror explicit", () => {
  const document = "Material 3 shape reference";
  const receipt = {
    sources: [],
    entries: [
      {
        raw_path: "raw.json",
        sha256: hash(document),
        source_url: "https://m3.material.io/reference",
        markdown_path: "shape.md",
        markdown_sha256: hash(document),
      },
    ],
  };
  using dir = tempDir("site-fusion", {
    ...Object.fromEntries(
      FUSION_SYMBOLS.map(name => ["symbols/" + name + ".svg", '<svg xmlns="http://www.w3.org/2000/svg"/>']),
    ),
    "symbols/LICENSE": "Apache-2.0 fixture",
    "search.json": "[]",
    "preview/index.html": home,
    "preview/icon.svg": "<svg/>",
    "preview/mirror-coverage.json": "{}",
    "material/material-catalog.json": JSON.stringify({
      documents_written: 1,
      truncated: false,
      failures: [],
      carbon_version: "source-version",
    }),
    "material/material-sync-receipt.json": JSON.stringify(receipt),
    "material/raw.json": document,
    "material/shape.md": document,
    "google/manifest.json": JSON.stringify({
      summary: { pagesWritten: 0 },
      failures: [{ url: "https://design.google/", error: "HTTP 502" }],
    }),
  });
  const options = {
    preview: join(String(dir), "preview"),
    material: join(String(dir), "material"),
    google: join(String(dir), "google"),
    output: join(String(dir), "out"),
    source: sha,
    symbols: join(String(dir), "symbols"),
    searchIndex: join(String(dir), "search.json"),
  };
  const manifest = buildFusion(options);
  expect(manifest.inputs.materialReceipt.files).toHaveLength(2);
  expect(manifest.inputs.googleDesign.pages).toBe(0);
  expect(manifest.qualification.googleDesignMirror).toBe(false);
  expect(manifest.qualification.stableBunOSRelease).toBe(false);
  expect(manifest.upstreamBenchmarksAreForkMeasurements).toBe(false);
  expect(manifest.outputs["index.html"]).toBe(hash(readFileSync(join(options.output, "index.html"), "utf8")));
  expect(manifest.unresolved).toEqual([]);
  expect(() => buildFusion({ ...options, output: join(String(dir), "other"), source: "unknown" })).toThrow(
    "release source SHA",
  );
});
