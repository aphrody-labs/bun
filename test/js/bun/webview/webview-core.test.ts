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
