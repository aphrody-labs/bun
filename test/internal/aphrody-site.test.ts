import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { isWindows, tempDir } from "harness";
import { build, describeAsset, pageUrl, parseSums, readNavigation } from "../../scripts/aphrody/site/build.ts";
import {
  absolutizeMarkdownLinks,
  mdxToHtmlMarkdown,
  parseFenceInfo,
  rewriteUpstreamUrls,
} from "../../scripts/aphrody/site/mdx.ts";
import { highlight, highlightHtml } from "../../scripts/aphrody/site/highlight.ts";
import { flipScript, parseTarget, releaseId, sameStamp } from "../../scripts/aphrody/site/publish.ts";

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
    expect(result).toMatchObject({ pages: 2, latest: null, reports: 0 });
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
    for (const p of [
      "index.html",
      "404.html",
      "downloads/index.html",
      "blog/index.html",
      "assets/site.css",
      "site.json",
    ])
      expect(existsSync(join(out, p))).toBe(true);
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
  });

  test("targets and release ids", () => {
    expect(parseTarget("dbfr")).toEqual({ kind: "ssh", host: "dbfr", base: "/srv/aphrody-downloads/site" });
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
