import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { build, describeAsset, loadHomeGraphReceipt, parseHomeBuildOptions, type Release } from "./build";
import type { SiteData } from "./collect";

test("home CLI accepts measured receipts and a graph receipt and rejects ambiguous flags", () => {
  expect(parseHomeBuildOptions(["--out", "fixture-output", "--offline"])).toBeUndefined();
  const value = parseHomeBuildOptions([
    "--home-runtime-fact",
    "win.json",
    "--home-runtime-fact",
    "linux.json",
    "--home-graph",
    "graph.json",
  ])!;
  expect(value.runtimeFactFiles).toHaveLength(2);
  expect(value.runtimeFactFiles[0]).toEndWith("win.json");
  expect(value.graphFile).toEndWith("graph.json");
  expect(parseHomeBuildOptions(["--home-graph", "graph.json"])!.runtimeFactFiles).toEqual([]);
  expect(() => parseHomeBuildOptions(["--home-graph", "--offline"])).toThrow("Missing");
  expect(() => parseHomeBuildOptions(["--home-capture-root", "capture"])).toThrow("Unknown home option");
  expect(() => parseHomeBuildOptions(["--home-graph", "one", "--home-graph", "two"])).toThrow("Duplicate");
  expect(() => parseHomeBuildOptions(["--home-runtime-fact", "same.json", "--home-runtime-fact", "same.json"])).toThrow(
    "Duplicate",
  );
});

test("graph metadata records source and original bytes without publishing machine paths or invented symbol counts", async () => {
  const raw = JSON.stringify({
    source: "a".repeat(40),
    files: 42,
    domains: [{ name: "video" }],
    links: [{}],
    native: { profile: "bun", root: "fixture-protected-path" },
    privateKey: "fixture-protected-key",
  });
  using fixture = tempDir("home-graph-receipt", { "graph.json": raw });
  const graph = await loadHomeGraphReceipt(join(String(fixture), "graph.json"));
  expect(graph.fact).toEqual({ source: "a".repeat(40) });
  expect(graph.catalog).toEqual({ files: 42, domains: 1, links: 1 });
  expect(graph.receipt.sha256).toBe(new Bun.CryptoHasher("sha256").update(raw).digest("hex"));
  expect(graph.receipt.bytes).toBe(Buffer.byteLength(raw));
  expect(JSON.stringify(graph)).not.toContain("fixture-protected");
});

test("release archives, executables and tarballs map to their platform", () => {
  expect(describeAsset("bun-linux-x64.tar.gz")).toMatchObject({ os: "linux", arch: "x64", format: "tar.gz" });
  expect(describeAsset("bun-windows-x64.exe")).toMatchObject({ os: "windows", arch: "x64", format: "exe" });
  expect(describeAsset("bun-linux-aarch64-musl-profile.zip")).toMatchObject({ musl: true, profile: true });
  expect(describeAsset("bunos-server-linux-x64-rootfs.tar.zst")).toBeNull();
  expect(describeAsset("SHA256SUMS.txt")).toBeNull();
});

const source = "c".repeat(40);
const data: SiteData = {
  schemaVersion: 1,
  generatedAt: "2026-10-16T00:00:00Z",
  distribution: null,
  org: null,
  downloads: null,
  warnings: [],
  errors: [],
  runtime: {
    repo: "aphrody-labs/bun",
    visibility: "public",
    commit: source,
    date: "2026-10-16T00:00:00Z",
    license: "LICENSE.md",
    licenses: ["MIT"],
    upstream: { name: "oven-sh/bun", url: "https://github.com/oven-sh/bun", version: "1.4.5" },
    commits: { count: 3, first: "2026-10-01", types: [["feat", 3]], scopes: [], recent: [] },
    lastUpstreamMerge: null,
    docs: { added: [], modified: [] },
    modules: ["bun:python", "bun:sqlite", "bun:windows"],
    commands: [],
    packages: [],
    windowsBindings: null,
    npm: null,
    image: null,
    guide: "# Bun OS\n\n## What is Bun OS?\n\nUnrelated generated README text.\n",
  },
};
const asset = (name: string, sha256?: string) => ({
  name,
  url: `https://github.com/aphrody-labs/bun/releases/download/x/${name}`,
  size: 1024,
  ...(sha256 ? { sha256 } : {}),
});
const releases: Release[] = [
  {
    tag: "google-chromium-sdk-v1.4.6",
    name: "Google and Chromium SDK 1.4.6",
    url: "https://github.com/aphrody-labs/bun/releases/tag/google-chromium-sdk-v1.4.6",
    publishedAt: "2026-10-17T00:00:00Z",
    body: "SDK packages.",
    prerelease: false,
    assets: [asset("aphrody-bun-google-1.4.6.tgz")],
  },
  {
    tag: "main-runtime-0123456789ab",
    name: "Development build 0123456789ab",
    url: "https://github.com/aphrody-labs/bun/releases/tag/main-runtime-0123456789ab",
    publishedAt: "2026-10-16T12:00:00Z",
    body: "Prerelease for testing.",
    prerelease: true,
    assets: [asset("bun-windows-x64.exe")],
  },
  {
    tag: "bun-v1.4.5",
    name: "Bun OS 1.4.5",
    url: "https://github.com/aphrody-labs/bun/releases/tag/bun-v1.4.5",
    publishedAt: "2026-10-16T00:00:00Z",
    body: "Bun OS 1.4.5, based on Bun 1.4.5.",
    prerelease: false,
    assets: [
      asset("bun-linux-x64.tar.gz", "d".repeat(64)),
      asset("bun-windows-x64.zip", "e".repeat(64)),
      asset("bunos-server-linux-x64-rootfs.tar.zst", "f".repeat(64)),
      asset("SHA256SUMS.txt"),
    ],
  },
];
const fact = {
  schema: 1,
  capturedAt: "2026-10-16T00:00:00Z",
  source,
  version: "1.4.5",
  target: "linux-x64",
  binary: { sha256: "a".repeat(64), bytes: 1024 },
  nativeVideo: { available: true, methods: ["metadata"] },
  nativeImage: { available: true, methods: ["resize"] },
  gates: [{ sha256: "b".repeat(64), passed: 161, failed: 0 }],
};

test("every page shares one shell; the home, release notes and downloads use only published runtime facts", async () => {
  using dir = tempDir("site-home", {
    "docs/docs.json": JSON.stringify({
      navigation: {
        tabs: [
          { tab: "Runtime", groups: [{ group: "Get started", pages: ["index", "quickstart", "runtime/python"] }] },
        ],
      },
    }),
    "docs/index.mdx": "---\ntitle: Welcome\ndescription: Intro\n---\n\nHello.\n",
    "docs/quickstart.mdx": "---\ntitle: Quickstart\n---\n\nStart.\n",
    "docs/runtime/python.mdx":
      "---\ntitle: Python\ndescription: Run Python files and embed CPython with bun:python\n---\n\nbun:python.\n",
    "receipts/linux.json": JSON.stringify(fact),
  });
  const out = join(String(dir), "out");
  const result = await build({
    src: String(dir),
    out,
    origin: "https://bun.aphrody.app",
    commit: source,
    repo: "aphrody-labs/bun",
    releases,
    data,
    now: new Date("2026-10-17T00:00:00Z"),
    home: { runtimeFactFiles: [join(String(dir), "receipts/linux.json")] },
  });
  expect(result).toMatchObject({ latest: "bun-v1.4.5", runtimeTargets: ["linux-x64"] });
  const read = (path: string) => readFileSync(join(out, path), "utf8");
  const home = read("index.html");
  // Keyboard users skip the header, tabs and documentation sidebar (WCAG 2.4.1).
  expect(home).toContain('<a href="#main"');
  expect(home).toContain('<main id="main"');
  // The tokens ship in the one hashed stylesheet: no page depends on cdn.aphrody.com.
  expect(home).not.toContain("cdn.aphrody.com");
  const stylesheet = /<link rel="stylesheet" href="(\/_assets\/site-[a-z0-9]+\.css)"/.exec(home)?.[1];
  expect(read(stylesheet!.slice(1))).toContain("--color-canvas:#0d0a0c");
  const header = (html: string) => /<header [\s\S]*?<\/header>/.exec(html)![0].replace(/ aria-current="page"/g, "");
  for (const path of [
    "docs/index.html",
    "release-notes/index.html",
    "downloads/index.html",
    "benchmarks/index.html",
    "runtime/index.html",
    "404.html",
  ])
    expect(header(read(path))).toBe(header(home));
  expect(header(home)).toContain('aria-label="Menu"');
  expect(home).toContain('One runtime for the <span class="text-accent">whole machine.</span>');
  expect(home).toContain('href="/release-notes#bun-v1.4.5"');
  expect(home).toContain("<strong");
  expect(home).toContain("Files and checksums for Linux x64 and Windows x64.");
  // A module is listed with the sentence of its docs page; modules without one are not listed.
  expect(home).toContain('href="/docs/runtime/python"');
  expect(home).toContain("Run Python files and embed CPython.");
  expect(home).not.toContain("bun:sqlite");
  expect(home).toContain("Measured builds");
  expect(home).toContain(">161<");
  expect(home).toContain('<meta property="og:url" content="https://bun.aphrody.app/"/>');
  expect(home).toContain('<meta property="og:image" content="https://bun.aphrody.app/icon-512.png"/>');
  expect(home).not.toMatch(/bun\.com|bun\.sh|bunjavascript|Anthropic|Unrelated generated README|google-chromium-sdk/);
  const notes = read("release-notes/index.html");
  expect(notes).toContain('<h3 id="bun-v1.4.5">');
  expect(notes).toContain('<h2 id="packages">SDK, tool and source releases</h2>');
  expect(notes.indexOf("bun-v1.4.5")).toBeLessThan(notes.indexOf("google-chromium-sdk-v1.4.6"));
  expect(notes).not.toContain("main-runtime-0123456789ab");
  const downloads = read("downloads/index.html");
  expect(downloads).toContain("bun-linux-x64.tar.gz");
  expect(downloads).toContain("d".repeat(64));
  expect(downloads).toContain('<h4 id="runtime-other">Other files</h4>');
  expect(downloads).not.toContain("main-runtime");
  for (const path of ["guides/index.html", "blog/index.html", "home-provenance.json"])
    expect(existsSync(join(out, path))).toBe(false);
  const site = JSON.parse(read("site.json"));
  expect(site.receipts.runtime[0].target).toBe("linux-x64");
  expect(new TextDecoder().decode(Bun.gunzipSync(readFileSync(join(out, "index.html.gz"))))).toBe(home);
});

test("evidence errors refuse a build before any site output or source overwrite", async () => {
  using directory = tempDir("invalid-home-evidence", { "sentinel.txt": "keep" });
  await expect(
    build({
      src: directory + "/missing-source",
      out: String(directory),
      origin: "https://bun.aphrody.app",
      commit: "a".repeat(40),
      repo: "aphrody-labs/bun",
      releases: [],
      home: { runtimeFactFiles: [join(String(directory), "missing.json")] },
    }),
  ).rejects.toThrow("overwrite");
  expect(existsSync(join(String(directory), "index.html"))).toBe(false);
  expect(readFileSync(join(String(directory), "sentinel.txt"), "utf8")).toBe("keep");
});
