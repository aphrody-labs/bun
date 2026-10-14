import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { assembleEditorialDraft } from "./editorial";
import { loadEditorialDirectory } from "./editorial-publication";
import { applyEditorialPublication, build, parseEditorialBuildDirectory } from "./build";

const source = "b".repeat(40),
  snapshot = "a".repeat(64);
const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
function publicationFixture() {
  const drafts = ["guide", "blog"].map(kind => {
    const topic = {
      kind: kind as "guide" | "blog",
      slug: "video-sources",
      title: "Les sources de Bun.Video",
      query: "Bun.Video frames",
    };
    const citation = {
      id: "S1",
      path: "docs/runtime/video.mdx",
      title: "Bun.Video",
      url: `https://github.com/aphrody-labs/bun/blob/${source}/docs/runtime/video.mdx`,
      sha256: "c".repeat(64),
      excerpt: "Native frames.\n<script>window.fixtureExecuted=true</script>",
      relevance: 0.95,
    };
    const mdx = assembleEditorialDraft(topic, source, snapshot, [citation]);
    const manifest = {
      schema: 1,
      source,
      snapshot,
      language: "fr",
      ...topic,
      authorship: "source-derived-assembly",
      modelRole: "structured-relevance-injection-and-grounding-judgements",
      models: ["Jev-fixture"],
      grounding: 0.98,
      citations: [
        {
          id: citation.id,
          path: citation.path,
          url: citation.url,
          sha256: citation.sha256,
          excerptSha256: hash(citation.excerpt),
          relevance: citation.relevance,
        },
      ],
      graph: { snapshot, sha256: "e".repeat(64), domains: 1, links: 1, coverage: null },
      mdxSha256: hash(mdx),
      maximumJevCalls: 4,
    };
    return { path: `${kind === "guide" ? "guides" : "blog"}/${topic.slug}.mdx`, mdx, manifest };
  });
  const receipt = {
    schema: 1,
    source,
    snapshot,
    authorship: "source-derived-assembly",
    drafts: drafts.map(({ path, manifest }) => ({ path, manifest })),
    calls: 4,
    validator: "bun:yolo",
    qualified: true,
  };
  const files: Record<string, string> = { "editorial.json": JSON.stringify(receipt) };
  for (const draft of drafts) {
    files[draft.path] = draft.mdx;
    files[draft.path + ".json"] = JSON.stringify(draft.manifest);
  }
  return { files, receipt, drafts };
}
const sourceFiles = {
  "docs/docs.json": JSON.stringify({
    navigation: { tabs: [{ tab: "Docs", groups: [{ group: "Docs", pages: ["index"] }] }] },
  }),
  "docs/index.mdx": "---\ntitle: Bun docs\n---\n\nNative documentation.",
};
const buildOptions = (src: string, out: string) => ({
  src,
  out,
  origin: "https://aphrody.app",
  commit: source,
  repo: "aphrody-labs/bun",
  releases: [],
});

test("editorial CLI requires an explicit unambiguous directory", () => {
  expect(parseEditorialBuildDirectory(["--offline"])).toBeUndefined();
  expect(parseEditorialBuildDirectory(["--editorial-dir", "fixture"])).toEndWith("fixture");
  expect(() => parseEditorialBuildDirectory(["--editorial-dir", "--offline"])).toThrow("Missing");
  expect(() => parseEditorialBuildDirectory(["--editorial-dir", "one", "--editorial-dir", "two"])).toThrow("Duplicate");
});

test("qualified editorial pages use the existing builder and enter guides/blog, search, sitemap and llms", async () => {
  const fixture = publicationFixture();
  using directory = tempDir("editorial-publication", fixture.files),
    src = tempDir("editorial-source", sourceFiles),
    out = tempDir("editorial-site", {});
  await build({ ...buildOptions(String(src), String(out)), editorialDirectory: String(directory) });
  const blog = await Bun.file(join(String(out), "blog/index.html")).text();
  expect(blog).toContain("/blog/video-sources");
  expect(blog).not.toContain('http-equiv="refresh"');
  expect(await Bun.file(join(String(out), "guides/index.html")).text()).toContain('href="/docs/guides"');
  const article = await Bun.file(join(String(out), "blog/video-sources/index.html")).text();
  expect(article).not.toContain("<script>window.fixtureExecuted");
  expect(article).toContain("&lt;script&gt;");
  expect(await Bun.file(join(String(out), "sitemap.xml")).text()).toContain("https://aphrody.app/blog/video-sources");
  expect(await Bun.file(join(String(out), "llms.txt")).text()).toContain("/guides/video-sources.md");
  expect(
    (await Bun.file(join(String(out), "docs/search.json")).json()).filter(
      (entry: { u: string }) => entry.u === "/blog/video-sources",
    ),
  ).toHaveLength(1);
  expect((await Bun.file(join(String(out), "editorial-provenance.json")).json()).snapshot).toBe(snapshot);
});

test("incremental publication preserves graph/home provenance and produces idempotent indices and gzip", async () => {
  const fixture = publicationFixture();
  using directory = tempDir("editorial-addition", fixture.files),
    src = tempDir("editorial-base-source", sourceFiles),
    out = tempDir("editorial-base", {});
  await build(buildOptions(String(src), String(out)));
  await Bun.write(join(String(out), "graph/index.html"), "graph sentinel");
  await Bun.write(join(String(out), "home-provenance.json"), "home sentinel");
  const options = {
    out: String(out),
    origin: "https://aphrody.app",
    commit: source,
    editorialDirectory: String(directory),
  };
  await applyEditorialPublication(options);
  await applyEditorialPublication(options);
  expect(await Bun.file(join(String(out), "graph/index.html")).text()).toBe("graph sentinel");
  expect(await Bun.file(join(String(out), "home-provenance.json")).text()).toBe("home sentinel");
  const search = await Bun.file(join(String(out), "docs/search.json")).text();
  expect(JSON.parse(search).filter((entry: { u: string }) => entry.u === "/blog/video-sources")).toHaveLength(1);
  expect(
    new TextDecoder().decode(Bun.gunzipSync(await Bun.file(join(String(out), "docs/search.json.gz")).bytes())),
  ).toBe(search);
  expect((await Bun.file(join(String(out), "llms.txt")).text()).match(/<!-- editorial:start -->/g)).toHaveLength(1);
  expect((await Bun.file(join(String(out), "site.json")).json()).editorial.pages[0].models).toEqual(["Jev-fixture"]);
});

test("stale, unqualified and unsafe paths refuse publication before any site write", async () => {
  for (const mutate of [
    (receipt: ReturnType<typeof publicationFixture>["receipt"]) => {
      receipt.source = "f".repeat(40);
    },
    (receipt: ReturnType<typeof publicationFixture>["receipt"]) => {
      receipt.qualified = false;
    },
    (receipt: ReturnType<typeof publicationFixture>["receipt"]) => {
      receipt.drafts[0]!.path = "../escape.mdx";
    },
  ]) {
    const fixture = publicationFixture();
    mutate(fixture.receipt);
    fixture.files["editorial.json"] = JSON.stringify(fixture.receipt);
    using directory = tempDir("invalid-editorial", fixture.files),
      out = tempDir("untouched-editorial-output", { "sentinel.txt": "keep" });
    await expect(
      build({ ...buildOptions("missing-source-is-never-read", String(out)), editorialDirectory: String(directory) }),
    ).rejects.toThrow();
    expect(await Bun.file(join(String(out), "sentinel.txt")).text()).toBe("keep");
    expect(await Bun.file(join(String(out), "index.html")).exists()).toBe(false);
  }
});

test("hash tampering, rehashed executable MDX and mismatched sidecars are refused", async () => {
  for (const mode of ["hash", "injection", "sidecar"]) {
    const fixture = publicationFixture(),
      draft = fixture.drafts[0]!;
    if (mode === "sidecar") fixture.files[draft.path + ".json"] = JSON.stringify({ ...draft.manifest, grounding: 1 });
    else {
      fixture.files[draft.path] += "\n<script>runUntrusted()</script>\n";
      if (mode === "injection") {
        draft.manifest.mdxSha256 = hash(fixture.files[draft.path]!);
        fixture.files[draft.path + ".json"] = JSON.stringify(draft.manifest);
        fixture.files["editorial.json"] = JSON.stringify(fixture.receipt);
      }
    }
    using directory = tempDir("tampered-editorial", fixture.files);
    await expect(loadEditorialDirectory(String(directory), source)).rejects.toThrow();
  }
});

test("unrecognized metadata never publishes protected fields", async () => {
  const fixture = publicationFixture(),
    draft = fixture.drafts[0]!;
  Object.assign(draft.manifest, { privateKey: "fixture-protected-value" });
  fixture.files[draft.path + ".json"] = JSON.stringify(draft.manifest);
  fixture.files["editorial.json"] = JSON.stringify(fixture.receipt);
  using directory = tempDir("projected-editorial", fixture.files);
  expect(JSON.stringify(await loadEditorialDirectory(String(directory), source))).not.toContain(
    "fixture-protected-value",
  );
});
