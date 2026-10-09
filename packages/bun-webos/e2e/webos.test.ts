// SPDX-License-Identifier: Apache-2.0
/**
 * End-to-end: the real WebOS server (`startWebOS`, port 0) driven through `Bun.WebView`.
 * Every assertion compares what an app shows with what the same server's Bun APIs return,
 * and refuses responses flagged `simulated`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  APP_IDS,
  attributeValues,
  availableBackends,
  fill,
  inWindow,
  openApp,
  openWebOS,
  textOf,
  waitFor,
  waitForText,
  type BackendName,
  type WebOSSession,
} from "./harness.ts";

const backends = availableBackends();

function real<T extends Record<string, unknown>>(body: T): T {
  expect(body.simulated, JSON.stringify(body).slice(0, 300)).toBeUndefined();
  return body;
}

if (backends.length === 0) test.todo("WebOS e2e needs Chrome/Edge (or WebView2 on Windows)");

describe.each(backends)("WebOS on Bun.WebView (%s)", (backend: BackendName) => {
  let os: WebOSSession;
  // Starts Chrome and loads the bundled WebOS once for the whole suite.
  beforeAll(async () => {
    os = await openWebOS(backend);
  }, 60_000);
  afterAll(async () => {
    await os?.[Symbol.asyncDispose]();
  });

  test("DesktopOS mounts with a launcher for every app", async () => {
    const launchers = await attributeValues(os.view, "[data-webos-launch]", "data-webos-launch");
    expect(launchers).toEqual(expect.arrayContaining([...APP_IDS]));
  });

  test("KernelMonitor shows the measured host state of the serving Bun process", async () => {
    await openApp(os.view, "kernel-monitor");
    const snapshot = await os.api("/api/webos/system");
    expect(snapshot.runtime).toMatchObject({ bun: Bun.version, revision: Bun.revision, pid: process.pid });
    expect(snapshot.host.platform).toBe(process.platform);
    const shown = {
      bun: await textOf(os.view, inWindow("kernel-monitor", '[data-webos-result="bun-version"]')),
      platform: await textOf(os.view, inWindow("kernel-monitor", '[data-webos-result="platform"]')),
      hostname: await textOf(os.view, inWindow("kernel-monitor", '[data-webos-result="hostname"]')),
      cpus: await textOf(os.view, inWindow("kernel-monitor", '[data-webos-result="cpu-count"]')),
    };
    expect(shown).toEqual({
      bun: expect.stringContaining(Bun.version),
      platform: expect.stringContaining(process.platform),
      hostname: expect.stringContaining(snapshot.host.hostname),
      cpus: expect.stringContaining(String(snapshot.cpu.count)),
    });
  });

  test("BunRepl evaluates Bun.semver and writes a file through the WebOS Bun.write", async () => {
    await openApp(os.view, "bun-repl");
    const input = inWindow("bun-repl", "[data-webos-input]");
    const output = inWindow("bun-repl", '[data-webos-result="output"]');
    await fill(os.view, input, 'Bun.semver.satisfies("1.4.0", "^1.2") && Bun.semver.order("1.4.0", "1.10.0")');
    await os.view.click(inWindow("bun-repl", '[data-webos-action="run"]'));
    // The page's Bun.semver comes from bun_wasm; it must agree with the host runtime.
    const expected = String(Bun.semver.satisfies("1.4.0", "^1.2") && Bun.semver.order("1.4.0", "1.10.0"));
    expect(await waitForText(os.view, output, new RegExp(`(^|\s)${expected}(\s|$)`))).toContain(expected);

    await fill(
      os.view,
      input,
      'await Bun.write("/home/aphrody/e2e.txt", "bun-webos e2e"), await Bun.file("/home/aphrody/e2e.txt").text()',
    );
    await os.view.click(inWindow("bun-repl", '[data-webos-action="run"]'));
    await waitForText(os.view, output, /bun-webos e2e/);
  }, 30_000);

  test("Files lists the file BunRepl wrote", async () => {
    await openApp(os.view, "files");
    await waitFor(os.view, `document.querySelector('${inWindow("files", '[data-webos-entry="e2e.txt"]')}') !== null`);
  });

  test("Processes lists the wasm workers the open apps started", async () => {
    await openApp(os.view, "processes");
    await waitFor(os.view, `document.querySelectorAll('${inWindow("processes", "[data-webos-process]")}').length > 0`);
    const pids = await attributeValues(os.view, inWindow("processes", "[data-webos-process]"), "data-webos-process");
    for (const pid of pids) expect(pid).toMatch(/^\d+$/);
  });

  test("BunshTerminal runs a command through the server and prints its real output", async () => {
    const direct = real(
      await os.api("/api/os/exec", { method: "POST", body: JSON.stringify({ command: "echo bun-webos" }) }),
    );
    expect({ stdout: direct.stdout, exitCode: direct.exitCode }).toEqual({ stdout: "bun-webos\n", exitCode: 0 });

    await openApp(os.view, "bunsh");
    await fill(os.view, inWindow("bunsh", "[data-webos-input]"), "echo webos-e2e");
    await os.view.press("Enter");
    await waitForText(os.view, inWindow("bunsh", '[data-webos-result="output"]'), /webos-e2e/);
  });

  test("AlpinePackageManager shows the packages the server's apk database reports", async () => {
    const body = real(await os.api("/api/os/apk/packages"));
    const names = (body.packages as { name: string }[]).map(p => p.name);
    await openApp(os.view, "apk-manager");
    const shown = await attributeValues(os.view, inWindow("apk-manager", "[data-webos-package]"), "data-webos-package");
    expect(shown.toSorted()).toEqual(names.toSorted());
  });

  test("Diagnostics runs the server benchmarks and shows each measured result", async () => {
    await openApp(os.view, "diagnostics");
    await os.view.click(inWindow("diagnostics", '[data-webos-action="run"]'));
    await waitFor(
      os.view,
      `document.querySelectorAll('${inWindow("diagnostics", "[data-webos-bench]")}').length > 0`,
      60_000,
    );
    const shown = await attributeValues(os.view, inWindow("diagnostics", "[data-webos-bench]"), "data-webos-bench");

    const { results } = real(await os.api("/api/benchmarks/run", { method: "POST" }));
    for (const r of results as { name: string; iterations: number; opsPerSec: number }[]) {
      expect(r.iterations).toBeGreaterThan(0);
      expect(r.opsPerSec).toBeGreaterThan(0);
    }
    expect(shown.toSorted()).toEqual((results as { name: string }[]).map(r => r.name).toSorted());
  }, 120_000);

  test("no page error was reported while driving the apps", () => {
    expect(os.pageErrors).toEqual([]);
  });
});
