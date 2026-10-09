import { describe, expect, test } from "bun:test";
import { isWindows, tempDir } from "harness";
import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { build, describeAsset, pageUrl, parseSums, readNavigation } from "../../scripts/aphrody/site/build.ts";
import {
  PRIVATE_TERMS,
  cargoPackage,
  conventional,
  declaredLicenses,
  installerUsage,
  type SiteData,
} from "../../scripts/aphrody/site/collect.ts";
import { highlight, highlightHtml } from "../../scripts/aphrody/site/highlight.ts";
import {
  absolutizeMarkdownLinks,
  mdxToHtmlMarkdown,
  parseFenceInfo,
  rewriteUpstreamUrls,
} from "../../scripts/aphrody/site/mdx.ts";
import { esc, generatedPages, publicLinks, table } from "../../scripts/aphrody/site/pages.ts";
import { dataDigest, flipScript, parseTarget, releaseId, sameStamp } from "../../scripts/aphrody/site/publish.ts";

const ctx = { link: (href: string) => href };

describe("site mdx", () => {
  test("callouts, tabs and nested cards become HTML blocks around markdown", () => {
    const html = mdxToHtmlMarkdown(
      [
        "<Note>",
        "  Some **bold** text.",
        "</Note>",
        "",
        "<Tabs>",
        '  <Tab title="npm">',
        "    ```sh",
        "    npm i",
        "    ```",
        "  </Tab>",
        "</Tabs>",
        "",
        '<Card title="Go" href="/runtime" cta={',
        '  <span className="x">more</span>',
        "}>",
        "  text",
        "</Card>",
      ].join("\n"),
      ctx,
    );
    expect(html).toContain('class="callout note"');
    expect(html).toContain("Some **bold** text.");
    expect(html).toContain("```sh\nnpm i\n```");
    expect(html).not.toContain("&lt;Card");
    expect(html).not.toContain("<Tab ");
  });

  test("fence info, upstream URLs and markdown links", () => {
    expect(parseFenceInfo('ts title="server.ts" lines')).toEqual({ lang: "ts", title: "server.ts" });
    expect(parseFenceInfo("sh terminal")).toEqual({ lang: "sh" });
    expect(rewriteUpstreamUrls("curl -fsSL https://bun.sh/install | bash", "https://aphrody.test")).toBe(
      "curl -fsSL https://aphrody.test/install | bash",
    );
    expect(absolutizeMarkdownLinks("[x](/runtime/http)", "https://aphrody.test")).toBe(
      "[x](https://aphrody.test/docs/runtime/http)",
    );
  });
});

describe("site build helpers", () => {
  test("page URLs and navigation", () => {
    expect(pageUrl("index")).toBe("/docs");
    expect(pageUrl("runtime/index")).toBe("/docs/runtime");
    expect(pageUrl("runtime/http/server")).toBe("/docs/runtime/http/server");
    const nav = readNavigation({
      navigation: {
        tabs: [{ tab: "Runtime", groups: [{ group: "Start", pages: ["index", { group: "Sub", pages: ["a/b"] }] }] }],
      },
    });
    expect(nav.pages.map(p => p.slug)).toEqual(["index", "a/b"]);
  });

  test("release assets and checksums", () => {
    expect(describeAsset("bun-linux-x64-musl-baseline.zip")).toEqual({
      os: "linux",
      arch: "x64",
      musl: true,
      baseline: true,
      profile: false,
    });
    expect(describeAsset("SHA256SUMS.txt")).toBeNull();
    const sum = "a".repeat(64);
    expect(
      parseSums(`${sum}  bun-windows-x64.zip\n${sum} *bun-darwin-aarch64.zip\n`).get("bun-darwin-aarch64.zip"),
    ).toBe(sum);
  });

  test("offline build of a docs tree", async () => {
    using dir = tempDir("aphrody-site", {
      "docs/docs.json": JSON.stringify({
        navigation: {
          tabs: [{ tab: "Runtime", groups: [{ group: "Get started", pages: ["index", "runtime/index"] }] }],
        },
      }),
      "docs/index.mdx":
        "---\ntitle: Welcome\ndescription: Intro\n---\n\n<Tip>Install with `curl -fsSL https://bun.sh/install | bash`.</Tip>\n\nSee [runtime](/runtime).\n",
      "docs/runtime/index.mdx": "---\ntitle: Runtime\n---\n\n## Section\n\n| a | b |\n| - | - |\n| 1 | 2 |\n",
      "scripts/aphrody/install.sh": "#!/bin/sh\necho fork\n",
      "scripts/aphrody/install-dev.sh": "#!/bin/sh\necho setup\n",
    });
    const out = join(String(dir), "out");
    const result = await build({
      src: String(dir),
      out,
      origin: "https://aphrody.test",
      commit: "0123456789abcdef",
      repo: "aphrody-labs/bun",
      releases: null,
      now: new Date("2026-10-09T00:00:00Z"),
    });
    expect(result).toMatchObject({ pages: 2, generated: [], latest: null, reports: 0 });
    expect(result.scripts).toEqual(["install", "install.sh", "bun/setup.sh"]);
    const read = (p: string) => readFileSync(join(out, p), "utf8");
    expect(read("docs/index.html")).toContain("https://aphrody.test/install");
    expect(read("docs/runtime/index.html")).toContain("<table>");
    expect(read("docs/index.md")).toContain("(https://aphrody.test/docs/runtime)");
    expect(read("llms.txt")).toContain("[Runtime](https://aphrody.test/docs/runtime.md)");
    expect(read("docs/runtime.md")).toBe(read("docs/runtime/index.md"));
    expect(read("llms-full.txt")).toContain("## Section");
    expect(read("sitemap.xml")).toContain("<loc>https://aphrody.test/docs/runtime</loc>");
    expect(read("robots.txt")).toContain("Sitemap: https://aphrody.test/sitemap.xml");
    expect(JSON.parse(read("docs/search.json")).length).toBeGreaterThanOrEqual(2);
    expect(read("benchmarks/index.html")).toContain("perf-gate.ts");
    expect(read("blog/index.html")).toContain("url=/release-notes");
    expect(existsSync(join(out, "components"))).toBe(false);
    for (const p of [
      "index.html",
      "404.html",
      "downloads/index.html",
      "release-notes/index.html",
      "blog/index.html",
      "assets/site.css",
      "site.json",
    ])
      expect(existsSync(join(out, p))).toBe(true);
  });
});

const sha = (c: string) => Buffer.alloc(40, c).toString();

function fixtureData(): SiteData {
  return {
    schemaVersion: 1,
    generatedAt: "2026-10-09T00:00:00.000Z",
    runtime: {
      repo: "aphrody-labs/bun",
      visibility: "public",
      commit: sha("a"),
      date: "2026-10-08T00:00:00Z",
      license: "LICENSE.md",
      licenses: ["MIT", "LGPL-2"],
      upstream: { name: "oven-sh/bun", url: "https://github.com/oven-sh/bun", version: "1.4.3" },
      commits: {
        count: 2,
        first: "2026-01-01T00:00:00Z",
        types: [
          ["feat", 1],
          ["fix", 1],
        ],
        scopes: [["site", 1]],
        recent: [{ sha: sha("b").slice(0, 11), date: "2026-10-08T00:00:00Z", subject: "feat(site): pages" }],
      },
      lastUpstreamMerge: null,
      docs: { added: [{ slug: "runtime/windows", title: "Windows", description: "bun:windows" }], modified: [] },
      modules: ["bun:windows"],
      commands: ["src/runtime/cli/msvc_command.rs"],
      packages: [
        {
          name: "@aphrody/bun-tools",
          path: "packages/bun-tools",
          version: "0.1.0",
          description: "rclone",
          license: "MIT",
          private: true,
        },
      ],
      windowsBindings: null,
      npm: { name: "@aphrody/bun-runtime", version: "1.4.3-aphrody.3" },
      image: null,
    },
    distribution: {
      repo: "aphrody-labs/aphrody",
      visibility: "private",
      commit: sha("c"),
      date: "2026-10-09T00:00:00Z",
      summary: "Aphrody is a user-space operating system (`crates/`).",
      sections: [
        { id: "security", title: "Security", markdown: "See [SECURITY.md](SECURITY.md) and [notes](docs/x.md)." },
      ],
      documents: { security: "# Security policy\n\nReport privately.\n", contributing: "# Contributing\n\nRules.\n" },
      workspace: { version: "1.0.0", license: "Apache-2.0", rust: "1.97" },
      crates: [
        {
          name: "aphrody-shell",
          path: "crates/shell/core",
          version: "1.0.0",
          description: "Terminal | PTY",
          license: "Apache-2.0",
        },
        {
          name: "aphrody-web",
          path: "crates/web/engine",
          version: "1.0.0",
          description: "",
          license: "BSD-3-Clause",
          upstream: { name: "h4ckf0r0day/obscura", url: "https://github.com/h4ckf0r0day/obscura" },
        },
      ],
      packages: [
        {
          name: "@aphrody/core",
          path: "packages/engine/core",
          version: "1.0.0",
          description: "Core",
          license: "Apache-2.0",
          private: true,
        },
      ],
      m3: {
        packages: [
          {
            name: "@aphrody/m3-tokens",
            path: "m3/packages/m3-tokens",
            version: "0.1.0",
            description: "Tokens",
            license: "Apache-2.0",
            npm: "0.1.0",
          },
        ],
        elements: ["md-filled-button"],
        primitives: ["dialog"],
        tokens: [["color", 2]],
        templates: [],
        uiCrates: [],
      },
      installers: [
        {
          file: "install.sh",
          source: "scripts/install.sh",
          usage: ["curl -fsSL https://downloads.aphrody.test/install.sh | sh"],
        },
      ],
      catalogue: [{ id: "aphrody", kind: "cli", description: "The aphrody binary", platforms: [] }],
      releases: [{ tag: "v1", name: "v1", date: "2026-10-01T00:00:00Z" }],
    },
    downloads: {
      release: "20261008T000000Z-cccccccccccc",
      commit: sha("c"),
      generatedAt: "2026-10-08T00:00:00Z",
      baseUrl: "https://downloads.aphrody.test",
      artifacts: [
        {
          name: "aphrody",
          version: "1.0.0",
          platform: "linux-x64",
          kind: "cli",
          url: "https://downloads.aphrody.test/aphrody",
          sha256: Buffer.alloc(64, "d").toString(),
          size: 2048,
        },
      ],
      notes: ["aphrody built", "private-thing skipped"],
    },
    org: { login: "aphrody-labs", public: [], privateCount: 3 },
    warnings: [],
    errors: [],
  };
}

describe("site pages", () => {
  test("markdown escaping, tables and public links", () => {
    expect(esc("a|b *c* `x|y` <t>")).toBe("a\\|b \\*c\\* `x\\|y` &lt;t&gt;");
    expect(table(["A", "B"], [["1", "two\nlines"]])).toBe("| A | B |\n| --- | --- |\n| 1 | two lines |");
    expect(
      publicLinks(
        "[s](SECURITY.md#report) [d](docs/a.md) [o](https://aphrody.test/components) [e](https://x.test)",
        "https://aphrody.test",
      ),
    ).toBe("[s](/security#report) d [o](/components) [e](https://x.test)");
  });

  test("pages come from the data", () => {
    const pages = generatedPages(fixtureData(), { origin: "https://aphrody.test", releases: null });
    expect(pages.map(p => p.path)).toEqual(["/", "/components", "/runtime", "/m3", "/security", "/contributing"]);
    const page = (path: string) => pages.find(p => p.path === path)!.markdown;
    expect(page("/")).toContain("| Cargo workspace | `1.0.0`, Rust 1.97 | `Cargo.toml` |");
    expect(page("/")).toContain("See [SECURITY.md](/security) and notes.");
    expect(page("/components")).toContain("| `aphrody-shell` | 1.0.0 | Apache-2.0 |  | Terminal \\| PTY |");
    expect(page("/components")).toContain("[h4ckf0r0day/obscura](https://github.com/h4ckf0r0day/obscura)");
    expect(page("/components")).toContain("3 private repositories are not listed");
    expect(page("/runtime")).toContain(
      "MIT, LGPL-2, [LICENSE.md](https://github.com/aphrody-labs/bun/blob/main/LICENSE.md)",
    );
    expect(pages.find(p => p.path === "/security")!.title).toBe("Security policy");
  });

  test("build renders the generated pages, downloads and release notes", async () => {
    using dir = tempDir("aphrody-site-data", {
      "docs/docs.json": JSON.stringify({
        navigation: { tabs: [{ tab: "Runtime", groups: [{ group: "Start", pages: ["index"] }] }] },
      }),
      "docs/index.mdx": "---\ntitle: Welcome\n---\n\nHello.\n",
    });
    const out = join(String(dir), "out");
    const result = await build({
      src: String(dir),
      out,
      origin: "https://aphrody.test",
      commit: sha("a"),
      repo: "aphrody-labs/bun",
      releases: null,
      data: fixtureData(),
      now: new Date("2026-10-09T00:00:00Z"),
    });
    expect(result.generated).toEqual(["/", "/components", "/runtime", "/m3", "/security", "/contributing"]);
    const read = (p: string) => readFileSync(join(out, p), "utf8");
    expect(read("index.html")).toContain("curl -fsSL https://downloads.aphrody.test/install.sh | sh");
    expect(read("index.html")).toContain('<a href="/components">Components</a>');
    expect(read("components/index.html")).toContain('<a href="/components" aria-current="page">Components</a>');
    expect(read("components/index.html")).toContain("<table>");
    expect(read("components.md")).toContain("(https://aphrody.test/m3)");
    expect(JSON.parse(read("components.json")).distribution.crates).toHaveLength(2);
    expect(read("downloads/index.html")).toContain("20261008T000000Z-cccccccccccc");
    expect(read("downloads/index.html")).toContain("aphrody built");
    expect(read("downloads/index.html")).not.toContain("private-thing");
    expect(read("release-notes/index.html")).toContain("<code>v1</code>");
    expect(read("llms.txt")).toContain("- [Components](https://aphrody.test/components.md)");
    expect(read("sitemap.xml")).toContain("<loc>https://aphrody.test/security</loc>");
    expect(JSON.parse(read("docs/search.json")).map((e: { u: string }) => e.u)).toContain("/runtime");
    expect(read("404.html")).toContain("aphrody-labs/aphrody@cccccccccccc");
  });
});

describe("site collect", () => {
  test("licences, private terms, installers, manifests and commit types", () => {
    expect(declaredLicenses("Bun itself is MIT-licensed.\n\nJavaScriptCore is LGPL-2 licensed.")).toEqual([
      "MIT",
      "LGPL-2",
    ]);
    expect(PRIVATE_TERMS.test("profile for dbfr")).toBe(true);
    expect(PRIVATE_TERMS.test("database driver")).toBe(false);
    expect(installerUsage("#!/bin/sh\n# Usage:\n#   curl -fsSL https://x.test/i.sh | sh\nset -e\n")).toEqual([
      "curl -fsSL https://x.test/i.sh | sh",
    ]);
    expect(
      cargoPackage('[package]\nname = "a"\nversion.workspace = true\nlicense = "MIT"\npublish = false\n', {
        version: "2.0.0",
      }),
    ).toEqual({ name: "a", version: "2.0.0", description: "", license: "MIT", private: true });
    expect(conventional("feat(Site)!: x")).toEqual({ type: "feat", scope: "site" });
    expect(conventional("Merge branch main")).toBeNull();
  });
});

describe("site highlight", () => {
  test("tokens per language, escaped output", () => {
    expect(highlight('const a = await fetch("<x>"); // c', "ts")).toBe(
      '<span class="hl-k">const</span> a = <span class="hl-k">await</span> <span class="hl-f">fetch</span>(<span class="hl-s">"&lt;x&gt;"</span>); <span class="hl-c">// c</span>',
    );
    expect(highlight("bun install --frozen-lockfile # c", "bash")).toBe(
      '<span class="hl-f">bun</span> install <span class="hl-a">--frozen-lockfile</span> <span class="hl-c"># c</span>',
    );
    expect(highlight("[install]\nfrozen = true", "toml")).toBe(
      '<span class="hl-t">[install]</span>\n<span class="hl-p">frozen</span> = <span class="hl-l">true</span>',
    );
    expect(highlight("def f(): return None", "python")).toBe(
      '<span class="hl-k">def</span> <span class="hl-f">f</span>(): <span class="hl-k">return</span> <span class="hl-l">None</span>',
    );
    expect(highlight("plain", "txt")).toBeUndefined();
  });

  test("rewrites only language-tagged blocks of rendered HTML", () => {
    const html = Bun.markdown.html('```json\n{ "a": 1 }\n```\n\n```\n<raw>\n```\n');
    expect(highlightHtml(html)).toBe(
      '<pre><code class="language-json">{ <span class="hl-p">"a"</span>: <span class="hl-n">1</span> }\n</code></pre>\n<pre><code>&lt;raw&gt;\n</code></pre>\n',
    );
  });
});

describe("site publish", () => {
  test("publication stamp comparison", () => {
    const stamp = { commit: "abc", release: "aphrody-v1#25", perfRun: 7 };
    expect(sameStamp(null, stamp)).toBe(false);
    expect(sameStamp({ ...stamp }, stamp)).toBe(true);
    expect(sameStamp({ ...stamp, release: "aphrody-v1#26" }, stamp)).toBe(false);
    expect(sameStamp({ ...stamp, perfRun: 8 }, stamp)).toBe(false);
    expect(sameStamp(stamp, { ...stamp, data: "0123" })).toBe(false);
    expect(sameStamp({ ...stamp, data: "0123" }, { ...stamp, data: "0123" })).toBe(true);
    expect(dataDigest('{"generatedAt":"a","x":1}')).toBe(dataDigest('{"generatedAt":"b","x":1}'));
    expect(dataDigest('{"x":1}')).not.toBe(dataDigest('{"x":2}'));
  });

  test("targets and release ids", () => {
    expect(parseTarget("dbfr")).toEqual({ kind: "ssh", host: "dbfr", base: "/home/ubuntu/apps/downloads/site" });
    expect(() => parseTarget("ssh:a;b")).toThrow();
    expect(releaseId("0123456789abcdef", new Date("2026-10-09T12:34:56.789Z"))).toBe("20261009T123456Z-0123456789ab");
  });

  test.skipIf(isWindows)("flip keeps the newest releases and the current one", async () => {
    using dir = tempDir("aphrody-site-flip", {
      "releases/20261001T000000Z-a/site.json": "{}",
      "releases/20261002T000000Z-b/site.json": "{}",
      "releases/20261003T000000Z-c/site.json": "{}",
    });
    const base = String(dir);
    const flip = async (id: string, keep: number) => {
      await using proc = Bun.spawn({ cmd: ["sh", "-c", flipScript(base, id, keep, "test", false)], stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
      return { stdout: stdout.trim(), stderr, code };
    };
    expect(await flip("20261003T000000Z-c", 2)).toEqual({ stdout: "releases/20261003T000000Z-c", stderr: "", code: 0 });
    expect(existsSync(join(base, "releases/20261001T000000Z-a"))).toBe(false);
    expect(await flip("20261002T000000Z-b", 1)).toMatchObject({ code: 0 });
    expect(readlinkSync(join(base, "current"))).toBe("releases/20261002T000000Z-b");
    expect(existsSync(join(base, "releases/20261002T000000Z-b"))).toBe(true);
    expect((await flip("missing", 5)).code).not.toBe(0);
  });
});
