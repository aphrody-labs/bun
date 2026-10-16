import { describe, expect, test } from "bun:test";

const paragraph = (n: number) =>
  `<p>Paragraph ${n} of the article explains how the native runtime parses documents, scores candidate ` +
  `nodes by their text density and removes navigation, comments and advertising blocks before rendering ` +
  `the cleaned content for reading.</p>`;

const article = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Reading mode in Bun | Example News</title>
  <meta name="description" content="How Speedreader finds the main article.">
  <script type="application/ld+json">
    {"@context": "https://schema.org", "@type": "NewsArticle", "headline": "Reading mode in Bun",
     "author": {"@type": "Person", "name": "Ada Lovelace"}}
  </script>
  <script>window.tracker = 1;</script>
</head>
<body>
  <nav class="menu"><a href="/">Home</a> <a href="/news">News</a> <a href="/about">About</a></nav>
  <div class="sidebar ad-banner"><a href="/buy">Buy now</a></div>
  <article class="post-content">
    <h1>Reading mode in Bun</h1>
    ${[1, 2, 3, 4, 5, 6].map(paragraph).join("\n    ")}
  </article>
  <footer class="footer">Copyright Example News</footer>
</body>
</html>`;

describe("Bun.HTML.readability", () => {
  test("extracts the article and its metadata", () => {
    const result = Bun.HTML.readability(article, { url: "https://news.example/post" });
    expect(result).not.toBeNull();
    const r = result!;
    expect(r.title).toBe("Reading mode in Bun");
    expect(r.byline).toBe("Ada Lovelace");
    expect(r.excerpt).toBe("How Speedreader finds the main article.");
    expect(r.lang).toBe("fr");
    expect(r.text).toContain("Paragraph 1 of the article");
    expect(r.text).toContain("Paragraph 6 of the article");
    expect(r.text).not.toContain("Buy now");
    expect(r.text).not.toContain("Copyright Example News");
    expect(r.content).toContain("<p>");
    expect(r.content).not.toContain("window.tracker");
    expect(r.length).toBe(r.text.length);
    expect(r.readable).toBe(true);
    expect(r.score).toBeGreaterThan(20);
    expect(r.page).toBeUndefined();
  });

  test("accepts bytes and renders the reader page on request", () => {
    const bytes = new TextEncoder().encode(article);
    const r = Bun.HTML.readability(bytes, { url: "https://news.example/post", page: true, theme: "dark" })!;
    expect(r.title).toBe("Reading mode in Bun");
    expect(r.page).toContain('data-theme="dark"');
    expect(r.page).toContain("<title>Reading mode in Bun</title>");
    expect(r.page).toContain("By Ada Lovelace");
  });

  test("reports short pages as not readable", () => {
    const r = Bun.HTML.readability("<html><body><p>Short.</p></body></html>");
    if (r !== null) expect(r.readable).toBe(false);
    expect(Bun.HTML.readability(article, { minLength: 1_000_000 })).toBeNull();
  });

  test("validates arguments", () => {
    // @ts-expect-error
    expect(() => Bun.HTML.readability(42)).toThrow("markup must be a string");
    expect(() => Bun.HTML.readability(article, { url: "not a url" })).toThrow("Invalid URL");
    // @ts-expect-error
    expect(() => Bun.HTML.readability(article, { minLength: "x" })).toThrow("minLength");
  });
});

describe("Bun.HTML.extract", () => {
  const results = `<html><body>
    <div class="result"><a href="https://a.example/">First</a><span class="snippet">Alpha</span></div>
    <div class="result"><a href="https://b.example/">Second</a></div>
  </body></html>`;

  test("reads attributes and text of matched elements", () => {
    const out = Bun.HTML.extract(results, [
      {
        selector: ".result",
        attributes: [
          { key: "url", selector: "a", attribute: "href" },
          { key: "title", selector: "a", attribute: "textContent" },
          { key: "snippet", selector: ".snippet", attribute: "textContent" },
        ],
      },
      { selector: "a", attributes: [{ key: "href", attribute: "href" }, { key: "rel", attribute: "rel" }] },
      { selector: "[[invalid", attributes: [{ key: "x", attribute: "id" }] },
    ]);
    expect(out).toEqual([
      { selector: ".result", values: { url: "https://a.example/", title: "First", snippet: "Alpha" } },
      { selector: ".result", values: { url: "https://b.example/", title: "Second", snippet: "" } },
      { selector: "a", values: { href: "https://a.example/", rel: "" } },
      { selector: "a", values: { href: "https://b.example/", rel: "" } },
    ]);
  });

  test("validates requests", () => {
    // @ts-expect-error
    expect(() => Bun.HTML.extract(results, {})).toThrow("requests must be an array");
    // @ts-expect-error
    expect(() => Bun.HTML.extract(results, [1])).toThrow("requests[0] must be an object");
  });
});
