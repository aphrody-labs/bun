import { describe, expect, test } from "bun:test";

describe("Bun.HTML persistent browser DOM", () => {
  test("CSS uses the shared Bun AST and preserves rule boundaries", () => {
    const rules = Bun.HTML.parseCSS('[data-mark="{"] { content: "}"; width: 12px } .next { height: 8px }');
    expect(rules).toHaveLength(2);
    expect(rules[0].prelude).toContain("data-mark");
    expect(rules[0].body).toContain("12px");
    expect(rules[1].prelude).toBe(".next");
    const nested = Bun.HTML.parseCSS('@media (min-width: 1px) { .a { color: red } } @import "https://invalid.invalid/test.css";');
    expect(nested[0].prelude).toContain("@media");
    expect(nested[0].body).toContain("color");
    expect(() => Bun.HTML.parseCSS(null as any)).toThrow();
    Bun.gc(true);
    expect(rules[0].body).toContain("12px");
  });
  test.skipIf(process.env.BUN_LIVE_WEBSITE_TEST !== "1")("parses the requested Bun pages over HTTPS", async () => {
    for (const url of ["https://bun.sh", "https://bun.sh/blog/bun-v1.4.3"]) {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      expect(response.ok).toBe(true);
      const document = Bun.HTML.parse(await response.text());
      expect(document.select("title").length).toBeGreaterThan(0);
      expect(document.select("a[href]").length).toBeGreaterThan(0);
      expect(document.text()).toContain("Bun");
      if (url.includes("bun-v1.4.3")) {
        expect(document.text()).toContain("1.4.3");
        expect(document.text()).toContain("bun check");
      }
    }
  }, 70000);
  test("HTML attributes fold ASCII case while SVG attributes preserve case", () => {
    const document = Bun.HTML.parse("<p id='before'>test</p><svg viewBox='0 0 1 1'></svg>");
    const paragraph = document.select("p")[0];
    document.setAttribute(paragraph, "ID", "after");
    expect(document.attribute(paragraph, "Id")).toBe("after");
    expect(document.select("#after")).toEqual([paragraph]);
    expect(document.select("#before")).toEqual([]);
    const svg = document.select("svg")[0];
    document.setAttribute(svg, "viewBox", "0 0 2 2");
    expect(document.attribute(svg, "viewBox")).toBe("0 0 2 2");
    expect(document.attribute(svg, "viewbox")).toBeNull();
  });
  test("HTML5 recovery, selectors, text and serialization use the browser tree", () => {
    const document = Bun.HTML.parse("<!doctype html><table><tr><td>A &amp; B</table><p id='first'>one<p>two");
    expect(document.select("table > tbody > tr > td")).toHaveLength(1);
    const paragraphs = document.select("p");
    expect(paragraphs).toHaveLength(2);
    expect(document.text(paragraphs[0])).toBe("one");
    expect(document.text(document.select("td")[0])).toBe("A & B");
    document.setAttribute(paragraphs[0], "data-test", "<safe>&\"");
    expect(document.attribute(paragraphs[0], "data-test")).toBe("<safe>&\"");
    expect(document.select("p[data-test]")).toEqual([paragraphs[0]]);
    expect(document.html(paragraphs[0])).toContain("&amp;");
    document.setAttribute(paragraphs[0], "id", "changed");
    expect(document.select("#changed")).toEqual([paragraphs[0]]);
    expect(document.select("#first")).toEqual([]);
    expect(document.html()).toContain("<!DOCTYPE html>");
  });

  test("rejects invalid selectors, IDs and non-string inputs", () => {
    const document = Bun.HTML.parse("<p>test</p>");
    expect(() => document.select("[")).toThrow();
    for (const id of [-1, 1.5, NaN, Infinity, 4294967296, 100000]) {
      expect(() => document.html(id)).toThrow();
    }
    expect(() => Bun.HTML.parse(null as any)).toThrow();
    expect(() => document.setAttribute(0, "x", "y")).toThrow();
  });

  test("markup is inert and documents remain independent across GC", () => {
    const first = Bun.HTML.parse("<script>throw new Error('must stay inert')</script><p>A</p>");
    const second = Bun.HTML.parse("<p>B</p>");
    const node = first.select("p")[0];
    first.setAttribute(node, "title", "first");
    Bun.gc(true);
    expect(first.attribute(node, "title")).toBe("first");
    expect(second.attribute(second.select("p")[0], "title")).toBeNull();
    expect(second.text()).toBe("B");
  });
});

describe("HTMLRewriter DOCTYPE handler", () => {
  test("remove and removed property work on DOCTYPE", () => {
    const html = "<!DOCTYPE html><html><head></head><body>Hello</body></html>";
    let sawDoctype = false;
    let wasRemoved = false;

    const rewriter = new HTMLRewriter().onDocument({
      doctype(doctype) {
        sawDoctype = true;
        doctype.remove();
        wasRemoved = doctype.removed;
      },
    });

    const result = rewriter.transform(html);

    expect(sawDoctype).toBe(true);
    expect(wasRemoved).toBe(true);
    expect(result).not.toContain("<!DOCTYPE");
    expect(result).toContain("<html>");
  });
});
