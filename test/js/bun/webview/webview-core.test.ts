// Native backends ("webkitgtk", "webview2", "wkwebview", "cef") are served by
// packages/bun-webview-core's bun-webview-host, which speaks the same
// --remote-debugging-pipe CDP subset as Chrome. Its "mock" engine needs no
// display, so the transport and the backend-name routing run everywhere the
// host has been built (`cargo build --no-default-features` in that package).
import { expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows } from "harness";
import { existsSync } from "node:fs";
import { join } from "node:path";

const pkg = join(import.meta.dir, "..", "..", "..", "..", "packages", "bun-webview-core");
const exe = isWindows ? "bun-webview-host.exe" : "bun-webview-host";
const host =
  process.env.BUN_WEBVIEW_HOST ?? ["release", "debug"].map(p => join(pkg, "target", p, exe)).find(p => existsSync(p));

async function run(script: string, env: Record<string, string> = {}) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), "-e", script],
    env: { ...bunEnv, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout: stdout.trim(), stderr, exitCode };
}

test("backend accepts the bun-webview-core engine names", () => {
  expect(() => new Bun.WebView({ backend: "nope" as any })).toThrow(
    'backend.type must be "webkit", "chrome", "webkitgtk", "webview2", "wkwebview" or "cef"',
  );
  expect(() => new Bun.WebView({ backend: { type: "webkitgtk", url: "ws://127.0.0.1:1/x" } as any })).toThrow(
    'backend.url requires type: "chrome"',
  );
});

test("constructor rejects invalid dimensions before launching a browser", () => {
  for (const key of ["width", "height"] as const) {
    for (const value of [NaN, Infinity, -1, 0, 1.5, 16385, 4294967297]) {
      expect(() => new Bun.WebView({ [key]: value })).toThrow(RangeError);
    }
    expect(() => new Bun.WebView({ [key]: "800" } as any)).toThrow(`${key} must be a number`);
  }
});

test("constructor rejects unsupported backend and storage option types", () => {
  for (const backend of [null, false, 1]) {
    expect(() => new Bun.WebView({ backend } as any)).toThrow("backend must be a string or an object");
  }
  for (const dataStore of [null, false, 1]) {
    expect(() => new Bun.WebView({ dataStore } as any)).toThrow(
      'dataStore must be "ephemeral" or { directory: string }',
    );
  }
});

test("backend argv preserves owned transport and profile", () => {
  for (const flag of ["--remote-debugging-pipe", "--remote-debugging-port", "--user-data-dir"]) {
    for (const argument of [flag, `${flag}=override`]) {
      expect(() => new Bun.WebView({ backend: { type: "chrome", argv: [argument] } })).toThrow(
        "backend.argv cannot override the owned debugging transport or dataStore directory",
      );
    }
  }
});

test("WebKit rejects ignored Chrome spawn and connection options", () => {
  for (const option of [{ path: "browser" }, { argv: [] }, { url: false }]) {
    expect(() => new Bun.WebView({ backend: { type: "webkit", ...option } } as any)).toThrow(
      "backend.path, backend.argv and backend.url require a Chrome or native host backend",
    );
  }
});

test.skipIf(!host)("backend: webkitgtk resolves BUN_WEBVIEW_HOST and drives the host over the pipe", async () => {
  const { stdout, stderr, exitCode } = await run(
    `
    const view = new Bun.WebView({ backend: { type: "webkitgtk", argv: ["--backend=mock"] }, width: 320, height: 200 });
    await view.navigate("data:text/html,<title>wv</title>");
    const out = {
      title: view.title,
      sum: await view.evaluate("1 + 2"),
      obj: await view.evaluate("({ a: [1, 2] })"),
      png: (await view.screenshot()).byteLength > 0,
      product: (await view.cdp("Browser.getVersion")).product,
    };
    try { await view.evaluate("(() => { throw new TypeError('boom') })()"); } catch (e) { out.err = String(e.message); }
    view.close();
    console.log(JSON.stringify(out));
    process.exit(0);
  `,
    { BUN_WEBVIEW_HOST: host! },
  );
  if (exitCode !== 0) console.error(stderr);
  const out = JSON.parse(stdout);
  expect(out).toMatchObject({ sum: 3, obj: { a: [1, 2] }, png: true });
  expect(out.product).toStartWith("bun-webview-host/mock");
  expect(out.err).toContain("boom");
  expect(exitCode).toBe(0);
});

test.skipIf(!isWindows || !host || process.env.BUN_WEBVIEW_TEST_WEBVIEW2 !== "1")(
  "WebView2 navigates, awaits JavaScript promises, resizes and closes its native window",
  async () => {
    const { stdout, stderr, exitCode } = await run(
      `
      const view = new Bun.WebView({ backend: "webview2", headless: false, width: 320, height: 200 });
      try {
        await view.navigate("data:text/html,<title>native-webview2</title><p>ready</p>");
        const value = await view.evaluate("Promise.resolve({answer:42,text:document.querySelector('p').textContent})");
        await view.resize(480, 300);
        const viewport = await view.evaluate("new Promise((resolve,reject)=>{const deadline=performance.now()+5000;const check=()=>{if(innerWidth===480&&innerHeight===300)resolve({width:innerWidth,height:innerHeight,dpr:devicePixelRatio});else if(performance.now()>=deadline)reject(new Error('CSS viewport did not reach 480x300'));else requestAnimationFrame(check)};check()})");
        const screenshot = new Uint8Array(await view.screenshot());
        const history = await view.cdp("Page.getNavigationHistory");
        let error;
        try { await view.evaluate("Promise.reject(new TypeError('native-rejection'))"); }
        catch (caught) { error = caught.message; }
        console.log(JSON.stringify({value,error,viewport,png:Array.from(screenshot.subarray(0,8)),
          history:history.entries.some(entry=>entry.url.includes('native-webview2'))}));
      } finally { view.close(); }
    `,
      { BUN_WEBVIEW_HOST: host! },
    );
    if (exitCode !== 0) console.error(stderr);
    const result = JSON.parse(stdout);
    expect(result.value).toEqual({ answer: 42, text: "ready" });
    expect(result.error).toContain("native-rejection");
    expect(result.viewport).toMatchObject({ width: 480, height: 300 });
    expect(result.viewport.dpr).toBeGreaterThan(0);
    expect(result.png).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(result.history).toBe(true);
    expect(exitCode).toBe(0);
  },
  15_000,
);
