import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { build, loadHomeGraphReceipt, parseHomeBuildOptions } from "./build";

test("home CLI requires explicit capture, preserves every receipt and rejects ambiguous flags", () => {
  expect(parseHomeBuildOptions(["--out", "fixture-output", "--offline"])).toBeUndefined();
  const value = parseHomeBuildOptions([
    "--home-capture-root",
    "capture",
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
  expect(() => parseHomeBuildOptions(["--home-graph", "graph.json"])).toThrow("capture");
  expect(() => parseHomeBuildOptions(["--home-capture-root", "--offline"])).toThrow("Missing");
  expect(() => parseHomeBuildOptions(["--home-facts", "facts.json"])).toThrow("Unknown home option");
  expect(() => parseHomeBuildOptions(["--home-capture-root", "one", "--home-capture-root", "two"])).toThrow(
    "Duplicate",
  );
  expect(() =>
    parseHomeBuildOptions([
      "--home-capture-root",
      "one",
      "--home-runtime-fact",
      "same.json",
      "--home-runtime-fact",
      "same.json",
    ]),
  ).toThrow("Duplicate");
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

const root = fileURLToPath(new URL("../../../", import.meta.url));
const captureRoot = join(root, "build/media/site-upstream-bun");
const win = join(root, "build/native-sdk-candidates/bun-windows-capabilities.json");
const linux = join(
  root,
  "factory/artifacts/runtime-release/linux-video-qualification-20261013/runtime-capabilities.json",
);
const graphFile = join(root, "build/media/site-live/graph-summary.json");

test.skipIf(!(await Bun.file(join(captureRoot, "manifest.json")).exists()) || !(await Bun.file(graphFile).exists()))(
  "canonical builder writes the captured native home alongside real docs and immutable measured receipts",
  async () => {
    using output = tempDir("canonical-native-home", {});
    const source = "b".repeat(40);
    const result = await build({
      src: root,
      out: String(output),
      origin: "https://aphrody.app",
      commit: source,
      repo: "aphrody-labs/bun",
      releases: [],
      now: new Date("2026-10-13T00:00:00Z"),
      home: { captureRoot, runtimeFactFiles: [win, linux], graphFile },
    });
    expect(result.pages).toBeGreaterThan(300);
    expect(result.home!.runtimeTargets).toEqual(["win32-x64", "linux-x64"]);
    const html = await Bun.file(join(String(output), "index.html")).text();
    expect(html).toContain("Bun.Video.");
    expect(html).toContain("Release gate fails");
    expect(html).toContain("GLIBC ≥ 2.43");
    expect(html).not.toMatch(/Upstream Bun news|Anthropic|Benchmarks|all eight targets/);
    expect(await Bun.file(join(String(output), "docs/runtime/video.html")).exists()).toBe(true);
    expect(await Bun.file(join(String(output), "docs/runtime/video.md")).exists()).toBe(true);
    expect(await Bun.file(join(String(output), "downloads/index.html")).exists()).toBe(true);
    expect(await Bun.file(join(String(output), "graph/index.html")).text()).toContain(
      "83cef44a85a671846dc02355e431a280e96c12a1",
    );
    const proof = await Bun.file(join(String(output), "home-provenance.json")).json();
    expect(proof.source).toBe(source);
    expect(proof.runtime.map((fact: { source: string }) => fact.source)).toEqual([
      "f54a341270501b3b77ea3dc4a728f33fa44810db",
      "f54a341270501b3b77ea3dc4a728f33fa44810db",
    ]);
    expect(proof.graph.source).toBe("83cef44a85a671846dc02355e431a280e96c12a1");
    for (const [index, file] of [win, linux].entries())
      expect(proof.inputReceipts.runtime[index].sha256).toBe(
        new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex"),
      );
    expect(proof.inputReceipts.graph.sha256).toBe(
      new Bun.CryptoHasher("sha256").update(await Bun.file(graphFile).bytes()).digest("hex"),
    );
    const manifest = await Bun.file(join(String(output), "site.json")).json();
    expect(manifest.home.provenance.sha256).toBe(
      new Bun.CryptoHasher("sha256")
        .update(await Bun.file(join(String(output), "home-provenance.json")).bytes())
        .digest("hex"),
    );
    expect(JSON.stringify(proof)).not.toMatch(/C:\\|\/home\/ubuntu|TYPESAFE_API_KEY|fixture-protected/);
    const compressed = await Bun.file(join(String(output), "index.html.gz")).bytes();
    expect(new TextDecoder().decode(Bun.gunzipSync(compressed))).toBe(html);
  },
  30000,
);

test("evidence errors refuse a home build before any site output or source overwrite", async () => {
  using directory = tempDir("invalid-home-evidence", { "sentinel.txt": "keep" });
  await expect(
    build({
      src: root,
      out: String(directory),
      origin: "https://aphrody.app",
      commit: "a".repeat(40),
      repo: "aphrody-labs/bun",
      releases: [],
      home: { captureRoot, runtimeFactFiles: [join(String(directory), "missing.json")] },
    }),
  ).rejects.toThrow("overwrite");
  expect(await Bun.file(join(String(directory), "index.html")).exists()).toBe(false);
  expect(await Bun.file(join(String(directory), "sentinel.txt")).text()).toBe("keep");
  await expect(
    build({
      src: root,
      out: root,
      origin: "https://aphrody.app",
      commit: "a".repeat(40),
      repo: "aphrody-labs/bun",
      releases: [],
      home: { captureRoot, runtimeFactFiles: [] },
    }),
  ).rejects.toThrow("overwrite");
});
