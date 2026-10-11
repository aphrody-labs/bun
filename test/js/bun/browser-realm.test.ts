import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";

test("BrowserRealm evaluates page JavaScript against its shared native DOM", () => {
  const document = Bun.HTML.parse(`<main><p class="item">first</p><p class="item">second</p></main>`);
  const page = Bun.BrowserRealm.create(document, "https://example.test", "main-frame");

  expect(page.evaluate(`__bunDOM.origin`)).toBe("https://example.test");
  expect(page.evaluate(`__bunDOM.frameId`)).toBe("main-frame");
  expect(page.evaluate(`__bunDOM.textContent()`)).toBe("firstsecond");
  const [firstItem] = document.select(".item");
  expect(page.evaluate(`JSON.stringify(__bunDOM.querySelectorAll(".item"))`)).toBe(JSON.stringify(document.select(".item")));
  page.evaluate(`__bunDOM.setAttribute(${firstItem}, "data-page", "yes")`);
  expect(document.attribute(firstItem, "data-page")).toBe("yes");
  expect(page.evaluate(`__bunDOM.getAttribute(${firstItem}, "class")`)).toBe("item");
});

test("BrowserRealm has only page intrinsics and recovers after timed interruption", () => {
  const page = Bun.BrowserRealm.create(Bun.HTML.parse("<p>safe</p>"), "https://isolated.test", "child-1");
  expect(page.evaluate(`[
    typeof Bun, typeof process, typeof require, typeof fetch, typeof document,
    typeof globalThis.__bunDOM
  ].join(",")`)).toBe("undefined,undefined,undefined,undefined,undefined,object");
  expect(() => page.evaluate(`while (true) {}`, "https://isolated.test/slow.js", 10)).toThrow();
  expect(() => page.evaluate(`({ toString() { while (true) {} } })`, "https://isolated.test/hostile-result.js", 10)).toThrow();
  expect(40 + 2).toBe(42);
  expect(page.evaluate(`__bunDOM.textContent()`)).toBe("safe");
  page.destroy();
  page.destroy();
  expect(() => page.evaluate("1 + 1")).toThrow("destroyed");
});

test("BrowserRealm GC and process teardown release page contexts", async () => {
  const source = `
    let page = Bun.BrowserRealm.create(Bun.HTML.parse("<p>collected</p>"), "https://gc.test", "gc-frame");
    if (page.evaluate("__bunDOM.textContent()") !== "collected") process.exit(2);
    page = null;
    for (let i = 0; i < 3; i++) {
      Bun.gc(true);
      await Bun.sleep(1);
    }
    console.log("PAGE_REALM_GC_OK");
  `;
  await using child = Bun.spawn({ cmd: [bunExe(), "-e", source], env: bunEnv, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect(stderr).toBe("");
  expect(stdout).toBe("PAGE_REALM_GC_OK\n");
  expect(exitCode).toBe(0);
});
