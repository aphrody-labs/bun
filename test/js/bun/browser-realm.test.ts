import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";

test("BrowserRealm evaluates page JavaScript against its shared native DOM", () => {
  const document = Bun.HTML.parse(
    `<main><p class="item">first</p><p class="item">second</p></main>`,
  );
  const page = Bun.BrowserRealm.create(document, "https://example.test", "main-frame");

  expect(page.evaluate(`__bunDOM.origin`)).toBe("https://example.test");
  expect(page.evaluate(`__bunDOM.frameId`)).toBe("main-frame");
  expect(page.evaluate(`__bunDOM.textContent()`)).toBe("firstsecond");
  const [firstItem] = document.select(".item");
  expect(page.evaluate(`JSON.stringify(__bunDOM.querySelectorAll(".item"))`)).toBe(
    JSON.stringify(document.select(".item")),
  );
  page.evaluate(`__bunDOM.setAttribute(${firstItem}, "data-page", "yes")`);
  expect(document.attribute(firstItem, "data-page")).toBe("yes");
  expect(page.evaluate(`__bunDOM.getAttribute(${firstItem}, "class")`)).toBe("item");
});

test("BrowserRealm has only page intrinsics and recovers after timed interruption", () => {
  const page = Bun.BrowserRealm.create(
    Bun.HTML.parse("<p>safe</p>"),
    "https://isolated.test",
    "child-1",
  );
  expect(
    page.evaluate(`[
    typeof Bun, typeof process, typeof require, typeof fetch, typeof document,
    typeof globalThis.__bunDOM
  ].join(",")`),
  ).toBe("undefined,undefined,undefined,undefined,undefined,object");
  expect(() => page.evaluate(`while (true) {}`, "https://isolated.test/slow.js", 10)).toThrow();
  expect(() =>
    page.evaluate(
      `({ toString() { while (true) {} } })`,
      "https://isolated.test/hostile-result.js",
      10,
    ),
  ).toThrow();
  expect(() =>
    page.evaluate(
      `Promise.resolve().then(() => { while (true) {} }); "queued"`,
      "https://isolated.test/hostile-promise.js",
      10,
    ),
  ).toThrow("timed out");
  expect(40 + 2).toBe(42);
  expect(page.evaluate(`__bunDOM.textContent()`)).toBe("safe");
  page.destroy();
  page.destroy();
  expect(() => page.evaluate("1 + 1")).toThrow("destroyed");
});

test("BrowserRealm checkpoints page callbacks before destruction without running host callbacks", async () => {
  const document = Bun.HTML.parse('<p id="target">safe</p>');
  const [target] = document.select("#target");
  const page = Bun.BrowserRealm.create(document, "https://checkpoint.test", "main-frame");
  let hostRan = false;
  const hostJob = Promise.resolve().then(() => {
    hostRan = true;
  });
  expect(
    page.evaluate(
      `Promise.resolve().then(() => __bunDOM.setAttribute(${target}, "data-page", "checkpoint")); "queued"`,
    ),
  ).toBe("queued");
  expect(hostRan).toBe(false);
  page.destroy();
  expect(document.attribute(target, "data-page")).toBe("checkpoint");
  await hostJob;
  expect(hostRan).toBe(true);
});

test("BrowserRealm rejects invalid native DOM node IDs before integer conversion", () => {
  const page = Bun.BrowserRealm.create(
    Bun.HTML.parse("<p>safe</p>"),
    "https://ids.test",
    "main-frame",
  );
  try {
    for (const id of ["NaN", "Infinity", "-Infinity", "-1", "0.5", "4294967296", '"0"']) {
      expect(() => page.evaluate(`__bunDOM.textContent(${id})`)).toThrow(
        "node ID must be an unsigned integer",
      );
    }
    expect(page.evaluate("__bunDOM.textContent()")).toBe("safe");
  } finally {
    page.destroy();
  }
});

test("BrowserRealm rejects callable objects as native DOM receivers", () => {
  const page = Bun.BrowserRealm.create(
    Bun.HTML.parse("<p>safe</p>"),
    "https://receiver.test",
    "main-frame",
  );
  try {
    expect(() =>
      page.evaluate("Function.prototype.call.call(__bunDOM.textContent, __bunDOM.outerHTML)"),
    ).toThrow("Illegal __bunDOM receiver");
    expect(() =>
      page.evaluate("Function.prototype.call.call(__bunDOM.querySelectorAll, {}, 'p')"),
    ).toThrow("Illegal __bunDOM receiver");
    expect(page.evaluate("__bunDOM.textContent()")).toBe("safe");
  } finally {
    page.destroy();
  }
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
  await using child = Bun.spawn({
    cmd: [bunExe(), "-e", source],
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(stdout).toBe("PAGE_REALM_GC_OK\n");
  expect(exitCode).toBe(0);
});
