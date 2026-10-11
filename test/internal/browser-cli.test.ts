// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { parseArguments, runBrowser, type Owner } from "../../scripts/aphrody/browser";

test("browser CLI leaves Chrome visibility and WebGPU defaults to its builtin", () => {
  expect(parseArguments(["chrome", "launch"]).launch).toEqual({});
  expect(
    parseArguments([
      "chrome",
      "launch",
      "--headless",
      "--no-webgpu",
      "--extension",
      "a path",
      "--extension",
      "b",
    ]).launch,
  ).toEqual({ headless: true, webgpu: false, extensions: ["a path", "b"] });
});

test("browser CLI rejects incompatible options before loading any owner", () => {
  for (const args of [
    ["obscura", "launch", "--headless"],
    ["chrome", "launch", "--workers", "2"],
    ["chrome", "connect"],
    ["obscura", "launch", "--timeout", "0"],
    ["obscura", "launch", "--workers", "65"],
    ["chrome", "launch", "--executable"],
  ])
    expect(() => parseArguments(args)).toThrow();
});

test("help does not load builtin modules", async () => {
  expect(parseArguments(["chrome", "connect", "--help"]).command).toBe("help");
  const output: string[] = [];
  expect(
    await runBrowser(
      parseArguments(["obscura", "help"]),
      async () => {
        throw new Error("must not load");
      },
      (value) => output.push(value),
    ),
  ).toBe(0);
  expect(output[0]).toContain("bun:obscura");
});

test("connect delegates the endpoint and timeout, probes then closes", async () => {
  const calls: unknown[] = [];
  const owner: Owner = {
    async connect(endpoint, options) {
      calls.push(endpoint, options.timeout);
      return {
        async send(method) {
          calls.push(method);
          return { product: "fixture" };
        },
        close() {
          calls.push("close");
        },
      };
    },
    async launch() {
      throw new Error("must not launch");
    },
  };
  const result = await runBrowser(
    parseArguments([
      "obscura",
      "connect",
      "ws://127.0.0.1:123/devtools/browser",
      "--timeout",
      "17",
    ]),
    async (engine) => {
      calls.push(engine);
      return owner;
    },
    (value) => calls.push(value),
  );
  expect(calls).toEqual([
    "obscura",
    "ws://127.0.0.1:123/devtools/browser",
    17,
    "Browser.getVersion",
    '{"product":"fixture"}',
    "close",
  ]);
  expect(result).toBe(0);
});

test("connect closes even when the handshake probe fails", async () => {
  let closed = false;
  const owner: Owner = {
    async connect() {
      return {
        async send() {
          throw new Error("probe failed");
        },
        close() {
          closed = true;
        },
      };
    },
    async launch() {
      throw new Error("must not launch");
    },
  };
  await expect(
    runBrowser(parseArguments(["chrome", "connect", "ws://127.0.0.1:123"]), async () => owner),
  ).rejects.toThrow("probe failed");
  expect(closed).toBe(true);
});

test("launch preserves selected executable arguments and waits before closing", async () => {
  const calls: unknown[] = [];
  const owner: Owner = {
    async connect() {
      throw new Error("must not connect");
    },
    async launch(options) {
      calls.push(options);
      return {
        process: { exited: Promise.resolve(7) },
        async close() {
          calls.push("close");
        },
      };
    },
  };
  const options = parseArguments([
    "obscura",
    "launch",
    "--executable",
    "a path/owner",
    "--workers",
    "1",
  ]);
  expect(
    await runBrowser(
      options,
      async () => owner,
      () => {},
    ),
  ).toBe(7);
  expect(calls).toEqual([{ executable: "a path/owner", workers: 1 }, "close"]);
});
