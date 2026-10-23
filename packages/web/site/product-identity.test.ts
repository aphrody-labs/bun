import { expect, test } from "bun:test";
import { renderPerfTable, rowDescription, runtimeHome } from "./build";
import type { SiteData } from "./collect";
import { runtimePage } from "./pages";
import { releaseReadme } from "../../../scripts/aphrody/release-surfaces";
import { generate, memoryFiches } from "../../bun-agent-plugin/src/generate";
import { resolve } from "node:path";
import { tempDir } from "../../../test/harness";
import { createRenderer } from "../www/render";

const source = "a".repeat(40);
const data: SiteData = {
  schemaVersion: 1,
  generatedAt: "2026-10-14T00:00:00Z",
  distribution: null,
  org: null,
  downloads: null,
  warnings: [],
  errors: [],
  runtime: {
    repo: "aphrody-labs/bun",
    visibility: "public",
    commit: source,
    date: "2026-10-14T00:00:00Z",
    license: "LICENSE.md",
    licenses: ["MIT", "LGPL"],
    upstream: { name: "oven-sh/bun", url: "https://github.com/oven-sh/bun", version: "1.4.4" },
    commits: { count: 2, first: "2026-10-13", types: [["fix", 2]], scopes: [], recent: [] },
    lastUpstreamMerge: null,
    docs: { added: [], modified: [] },
    modules: ["bun:native-only"],
    commands: ["src/runtime/cli/source_only_command.rs"],
    packages: [],
    windowsBindings: null,
    npm: null,
    image: null,
    guide: "",
  },
};

test("runtime inventory preserves attribution and distinguishes declarations from qualified behavior", () => {
  const page = runtimePage(data, { origin: "https://bun.aphrody.app", releases: [] })!;
  expect(page.description).toContain("Bun OS");
  expect(page.description).not.toMatch(/fork/i);
  expect(page.markdown).toContain("oven-sh/bun");
  expect(page.markdown).toContain("MIT");
  expect(page.markdown).toContain("Source package version");
  expect(page.markdown).not.toContain("base version");
  expect(page.markdown).toContain(`${source}/src/resolve_builtins/HardcodedModule.rs`);
  expect(page.markdown).not.toContain("src/js/bun/native-only.ts");
  expect(page.markdown).toContain("does not establish platform availability");
  expect(page.markdown).toContain("command registration and behavior require their own runtime evidence");
  expect(page.markdown).toContain("2 since 2026-10-13");
});

test("public home and README preserve upstream authors and licences", async () => {
  using dir = tempDir("home-identity", {});
  const renderer = createRenderer({
    site: {
      origin: "https://bun.aphrody.app",
      brand: "Aphrody Bun",
      github: "https://github.com/aphrody-labs/bun",
      repo: "aphrody-labs/bun",
      commit: source,
      upstream: data.runtime!.upstream,
    },
    nav: [],
    note: "",
  });
  await renderer.prepare(String(dir));
  const home = renderer.home(
    runtimeHome(
      data,
      { src: ".", out: ".", origin: "https://bun.aphrody.app", commit: source, repo: "aphrody-labs/bun", releases: [] },
      { facts: [], docs: new Map(), latest: undefined, pages: 3 },
    ),
  );
  expect(home).toContain("under its original licences");
  const readme = releaseReadme("1.4.4", source, "aphrody-labs/bun", ["bun:native-only"]);
  for (const text of [home, readme]) {
    expect(text).toContain("Bun OS");
    // Visible wording only: markup and link targets keep existing page slugs such as /docs/runtime/fork-features.
    expect(text.replace(/<[^>]*>/g, " ").replace(/\]\([^)]*\)/g, "")).not.toMatch(/\bfork\b/i);
    expect(text).not.toContain("stable release is pending");
    expect(text).not.toContain("stable release remains pending");
  }
  expect(home).toContain('href="https://github.com/oven-sh/bun"');
  expect(readme).toContain("includes code derived from oven-sh/Bun");
  expect(readme).toContain("Bun retains its upstream authors, notices");
  expect(readme).toContain("JavaScriptCore");
  expect(readme).toContain("LGPL");
  expect(readme).toContain(`https://github.com/aphrody-labs/bun/tree/${source}`);
});

test("benchmark presentation retains recorded metrics and identifies their executable scope", () => {
  const html = renderPerfTable({
    platform: "fixture",
    report: {
      meta: {
        fork: { version: "1.4.4", revision: source },
        upstream: { version: "1.4.2", revision: "b".repeat(40) },
        host: "fixture-host",
        runs: 40,
        warmup: 5,
        engine: "fixture",
        date: "2026-10-13",
      },
      rows: [
        {
          id: "fork-builtins",
          unit: "ms",
          upstream: { median: 2, p95: 3 },
          fork: { median: 1, p95: 1.5 },
          ratio: 0.5,
          status: "ok",
        },
      ],
    },
  });
  expect(html).not.toMatch(/\bfork\b/i);
  expect(html).toContain("Bun OS");
  expect(html).toContain("recorded executables and workload");
  expect(html).toContain("1.00 ms");
  expect(html).toContain("2.00 ms");
  expect(html).toContain("0.500");
  expect(html).toContain("fixture-host");
  expect(html).toContain('scope="col"');
  expect(html).toContain("<caption>");
});

test("canonical runtime fiche replaces stale release recipes in the actual generated bundle", () => {
  const root = resolve(import.meta.dir, "../../..");
  const fiches = memoryFiches(resolve(root, "packages/bun-agent-plugin"));
  expect(fiches.some(fiche => fiche.name === "bun-fork-aphrody")).toBe(false);
  expect(fiches.find(fiche => fiche.name === "bun-os-runtime")?.text).toContain("declaration is not a");
  const files = generate({ root });
  const actual = [...files.entries()].filter(([path]) => path.endsWith("references/bun-os-runtime.md"));
  expect(actual.length).toBeGreaterThan(0);
  for (const [path, text] of actual) {
    expect(path).not.toContain("bun-fork-aphrody");
    expect(String(text)).toContain("Bun OS");
    expect(String(text)).not.toMatch(/\bfork\b/i);
    expect(String(text)).not.toContain("test/js/first_party");
    expect(String(text)).toContain("Historical receipts retain their recorded runtime");
  }
});

test("the home page lists the modules this Bun adds, each described by its docs page", () => {
  const docs = new Map([["runtime/python", { description: "Run Python files and embed CPython with bun:python" }]]);
  const input = runtimeHome(
    { ...data, runtime: { ...data.runtime!, modules: ["bun:sqlite", "bun:python", "bun:rio"] } },
    { src: ".", out: ".", origin: "https://bun.aphrody.app", commit: source, repo: "aphrody-labs/bun", releases: [] },
    { facts: [], docs, latest: undefined, pages: 1 },
  );
  // Upstream modules and modules without a description are not listed.
  expect(input.modules).toEqual([
    { name: "bun:python", href: "/docs/runtime/python", description: "Run Python files and embed CPython." },
  ]);
  expect(rowDescription("bun:linux", "Call Linux interfaces with the bun:linux module")).toBe("Call Linux interfaces.");
});
