// SPDX-License-Identifier: Apache-2.0
// @aphrody/next-bun/crawl: sitemap.xml, robots.txt, llms.txt and JSON-LD for an App Router site.
import { describe, expect, test } from "bun:test";
import {
  SITEMAP_MAX_URLS,
  absoluteUrl,
  jsonLd,
  llmsTxt,
  robotsTxt,
  sitemapXml,
} from "../../../packages/bun-next/lib/crawl";

const origin = "https://example.com";

describe("sitemapXml", () => {
  test("resolves, de-duplicates, sorts and escapes", () => {
    const xml = sitemapXml(
      [
        "/b",
        "/a?x=1&y=2",
        { path: "/b", lastmod: "2026-10-01", changefreq: "weekly", priority: 0.8 },
        "https://example.com/c#frag",
      ],
      origin,
    );
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ),
    ).toBe(true);
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
    expect(locs).toEqual(["https://example.com/a?x=1&amp;y=2", "https://example.com/b", "https://example.com/c"]);
    expect(xml).toContain("<lastmod>2026-10-01</lastmod>");
    expect(xml).toContain("<priority>0.8</priority>");
    expect(sitemapXml(["/z", "/a"], origin)).toBe(sitemapXml(["/a", "/z"], origin));
  });

  test("rejects foreign origins, bad dates, bad priorities and oversized lists", () => {
    expect(() => sitemapXml(["https://other.com/x"], origin)).toThrow(RangeError);
    expect(() => sitemapXml([{ path: "/a", lastmod: "yesterday" }], origin)).toThrow(RangeError);
    expect(() => sitemapXml([{ path: "/a", priority: 2 }], origin)).toThrow(RangeError);
    expect(() =>
      sitemapXml(
        Array.from({ length: SITEMAP_MAX_URLS + 1 }, (_, i) => `/p${i}`),
        origin,
      ),
    ).toThrow(RangeError);
    expect(() => absoluteUrl("/a", "ftp://x")).toThrow(TypeError);
  });

  test("an empty route list is still a valid urlset", () => {
    expect(sitemapXml([], origin)).toContain("<urlset");
  });
});

describe("robotsTxt", () => {
  test("defaults allow everything and reference the sitemap", () => {
    expect(robotsTxt({ origin })).toBe("User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n");
  });

  test("groups, crawl delay and custom sitemaps", () => {
    const txt = robotsTxt({
      origin,
      rules: [
        { userAgent: "*", disallow: ["/private/"] },
        { userAgent: ["GPTBot", "ClaudeBot"], disallow: ["/"], crawlDelay: 10 },
      ],
      sitemaps: ["/sitemap.xml", "https://example.com/news.xml"],
    });
    expect(txt).toContain("User-agent: *\nDisallow: /private/\n");
    expect(txt).toContain("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\nCrawl-delay: 10");
    expect(txt.trimEnd().endsWith("Sitemap: https://example.com/news.xml")).toBe(true);
    expect(robotsTxt({ origin, sitemaps: [] })).not.toContain("Sitemap:");
  });

  test("rejects header injection", () => {
    expect(() => robotsTxt({ origin, rules: [{ userAgent: "*", disallow: ["/a\nAllow: /"] }] })).toThrow(TypeError);
    expect(() => robotsTxt({ origin, rules: [{ userAgent: [] }] })).toThrow(TypeError);
  });
});

describe("llmsTxt (llmstxt.org)", () => {
  test("H1, blockquote summary, details, sections and Optional last", () => {
    const txt = llmsTxt({
      origin,
      name: "Example",
      summary: "One line summary.",
      details: ["First paragraph.", "Second paragraph."],
      sections: [
        { title: "Extras", links: [{ title: "Changelog", path: "/changelog" }], optional: true },
        {
          title: "Docs",
          links: [
            { title: "Guide [v2]", path: "/docs/guide", notes: "Start here" },
            { title: "API", path: "https://api.example.org/ref" },
          ],
        },
      ],
    });
    expect(txt).toBe(
      [
        "# Example",
        "> One line summary.",
        "First paragraph.",
        "Second paragraph.",
        "## Docs\n\n- [Guide \\[v2\\]](https://example.com/docs/guide): Start here\n- [API](https://api.example.org/ref)",
        "## Optional\n\n- [Changelog](https://example.com/changelog)",
      ].join("\n\n") + "\n",
    );
  });

  test("requires a name and forbids headings in details", () => {
    expect(() => llmsTxt({ origin, name: " " })).toThrow(TypeError);
    expect(() => llmsTxt({ origin, name: "X", details: "# not allowed" })).toThrow(TypeError);
    expect(llmsTxt({ origin, name: "X" })).toBe("# X\n");
  });
});

describe("jsonLd", () => {
  test("escapes markup so the payload cannot close the script tag", () => {
    const json = jsonLd({ name: "</script><b>&", sep: "\u2028" });
    expect(json).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(json)).toEqual({ name: "</script><b>&", sep: "\u2028" });
    expect(() => jsonLd(undefined)).toThrow(TypeError);
  });
});
