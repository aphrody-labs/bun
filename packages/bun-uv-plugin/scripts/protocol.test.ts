// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { declarations } from "./docs.ts";
import { installPlugin, parseInstallArgs, pluginDestination } from "./install.ts";
import { configuration, NativePeer, resolveData, unwrapData } from "./lsp.ts";
import { frame, Frames, mapURIs, originalURI, virtualURI, type Message } from "./protocol.ts";

test("LSP framing measures UTF-8 bytes and survives every split boundary", () => {
  const message: Message = { jsonrpc: "2.0", id: 1, result: "été 😺" };
  const data = frame(message);
  for (let split = 0; split <= data.length; split++) {
    const reader = new Frames();
    const decoded = [...reader.push(data.subarray(0, split)), ...reader.push(data.subarray(split))];
    reader.finish();
    expect(decoded).toEqual([message]);
  }
});

test("multiple messages and body boundaries remain independent", () => {
  const a: Message = { jsonrpc: "2.0", method: "initialized", params: {} };
  const b: Message = { jsonrpc: "2.0", id: "same", result: null };
  const reader = new Frames();
  expect(reader.push(Buffer.concat([frame(a), frame(b)]))).toEqual([a, b]);
  reader.finish();
});

test("framing rejects duplicate lengths, oversized bodies, other charsets and truncated data", () => {
  for (const input of [
    "Content-Length: 1\r\nContent-Length: 1\r\n\r\n{",
    "Content-Length: 64\r\n\r\n",
    "Content-Length: 1\r\nContent-Type: application/vscode-jsonrpc; charset=utf-16\r\n\r\n{",
  ]) {
    expect(() => new Frames(32).push(Buffer.from(input))).toThrow();
  }
  const reader = new Frames();
  reader.push(Buffer.from("Content-Length: 40\r\n\r\n{"));
  expect(() => reader.finish()).toThrow("truncated");
  expect(() => new Frames().push(Buffer.alloc(8196, 65))).toThrow("header exceeds");
  expect(() => frame({ jsonrpc: "2.0", result: "large" }, 1)).toThrow("byte limit");
});

test("PyJS URI projection preserves editor identities and workspace edit keys", () => {
  for (const [original, extension] of [
    ["file:///C:/work/sample.pyjs", ".js"],
    ["file:///C:/work/sample.pyts", ".ts"],
    ["file:///C:/work/sample.pytsx", ".tsx"],
  ]) {
    expect(virtualURI(original!)).toBe(original! + extension);
    expect(originalURI(virtualURI(original!))).toBe(original!);
  }
  const uri = "file:///C:/work/name%20with%20spaces.pyts";
  const edit = { changes: { [uri]: [{ newText: "literal code remains intact", range: {} }] }, data: { uri } };
  expect(mapURIs(mapURIs(edit, virtualURI), originalURI)).toEqual(edit);
  expect(mapURIs({ newText: uri, text: uri, uri }, virtualURI)).toEqual({
    newText: uri,
    text: uri,
    uri: virtualURI(uri),
  });
  expect(virtualURI("untitled:sample.pyts")).toBe("untitled:sample.pyts");
});

test("configuration never installs missing backends and declarations remain source-backed", () => {
  expect(() => configuration({ typescript: ["missing-buv-lsp-executable-9e71"] }, {})).toThrow("unavailable");
  expect(() => configuration({ maxPending: 0 }, {})).toThrow("LSP limit");
  expect(
    declarations(
      "  export class Python {\n    run(code: string): void;\n    evalJSON<T = unknown>(expression: string): T;\n  }",
    ),
  ).toEqual([
    "  export class Python {",
    "    run(code: string): void;",
    "    evalJSON<T = unknown>(expression: string): T;",
  ]);
});

test("installation arguments accept both path forms and reject missing values before IO", () => {
  expect(parseInstallArgs(["--workspace", "selected checkout", "--buv=qualified core", "--apply"])).toEqual({
    workspace: "selected checkout",
    executable: "qualified core",
    apply: true,
  });
  expect(parseInstallArgs(["--workspace=selected checkout", "--buv", "qualified core"])).toEqual({
    workspace: "selected checkout",
    executable: "qualified core",
    apply: false,
  });
  for (const args of [["--buv"], ["--buv="], ["--workspace", "--apply"], ["--unknown"]])
    expect(() => parseInstallArgs(args)).toThrow();
});

test("installation preview delegates fork candidates without inspecting PATH or installing", async () => {
  const workspace = resolve(import.meta.dir, "../../..");
  const home = join(workspace, "tmp", "__buv_plugin_preview_home__");
  const env = { APHRODY_HOME: home, PATH: join(workspace, "__upstream_bun_path__") };
  expect(pluginDestination(env)).toBe(join(home, "plugins", "bun-uv"));
  const preview = await installPlugin({ workspace, env });
  const extension = process.platform === "win32" ? ".exe" : "";
  expect(preview.candidates).toEqual([
    join(workspace, "build", "debug", `bun-debug${extension}`),
    join(workspace, "build", "release", `bun${extension}`),
  ]);
  expect(preview.executable).toBeNull();
  expect(preview.apply).toBe(false);
  const executable = join(workspace, "__explicit_core__");
  const explicit = await installPlugin({ workspace, executable, env: { ...env, BUV_EXECUTABLE: "ignored" } });
  expect(explicit.candidates).toEqual([executable]);
  expect(explicit.executable).toBe(executable);
  await expect(installPlugin({ workspace, executable: "", env })).rejects.toThrow("invalid native core");
});

const tsgo = Bun.which("tsgo");
const ruff = process.env["BUV_TEST_RUFF"] ?? Bun.which("ruff");
test.skipIf(!ruff || process.env["BUV_TEST_NATIVE_LSP"] !== "1")(
  "configured native Ruff completes a real initialize and shutdown exchange",
  async () => {
    const config = configuration({ ruff: [ruff!, "server"], requestTimeoutMs: 5000 });
    let peer: NativePeer;
    peer = new NativePeer("ruff", config.ruff!, config, async message => {
      if (message.id !== undefined && message.method) await peer.send({ jsonrpc: "2.0", id: message.id, result: null });
    });
    try {
      const initialized = await peer.request("initialize", { processId: process.pid, rootUri: null, capabilities: {} });
      expect(initialized.error).toBeUndefined();
      expect(initialized.result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+/);
      await peer.send({ jsonrpc: "2.0", method: "initialized", params: {} });
      const shutdown = await peer.request("shutdown");
      expect(shutdown.error).toBeUndefined();
      expect(shutdown.result).toBeNull();
      await peer.send({ jsonrpc: "2.0", method: "exit" });
    } finally {
      await peer.close();
    }
  },
);
test("resolve requests return to their producing native backend without losing opaque data", () => {
  const item = { label: "value", data: { opaque: [1, 2] } };
  const routed = resolveData({ isIncomplete: false, items: [item] }, "python");
  expect(unwrapData(routed.items[0])).toEqual({ backend: "python", params: item });
  const hierarchy = { item: resolveData({ name: "symbol" }, "ruff"), fromRanges: [] };
  expect(unwrapData(hierarchy)).toEqual({ backend: "ruff", params: { item: { name: "symbol" }, fromRanges: [] } });
});
test.skipIf(!tsgo || process.env["BUV_TEST_NATIVE_LSP"] !== "1")(
  "native TS7 server completes a real initialize and shutdown exchange",
  async () => {
    const config = configuration({
      root: resolve(import.meta.dir, ".."),
      typescript: [tsgo!, "--lsp", "-stdio"],
      requestTimeoutMs: 5000,
    });
    let peer: NativePeer;
    peer = new NativePeer("typescript", config.typescript!, config, async message => {
      if (message.id !== undefined && message.method)
        await peer.send({
          jsonrpc: "2.0",
          id: message.id,
          result: message.method === "workspace/configuration" ? message.params.items.map(() => null) : null,
        });
    });
    try {
      const initialized = await peer.request("initialize", {
        processId: process.pid,
        rootUri: null,
        capabilities: { general: { positionEncodings: ["utf-16"] } },
      });
      expect(initialized.error).toBeUndefined();
      expect(initialized.result.capabilities).toBeDefined();
      await peer.send({ jsonrpc: "2.0", method: "initialized", params: {} });
      const shutdown = await peer.request("shutdown");
      expect(shutdown.error).toBeUndefined();
      expect(shutdown.result).toBeNull();
      await peer.send({ jsonrpc: "2.0", method: "exit" });
    } finally {
      await peer.close();
    }
  },
);

test.skipIf(!tsgo || process.env["BUV_TEST_NATIVE_LSP"] !== "1")(
  "native broker checks PyTS and PyTSX editor buffers with real TS7 diagnostics",
  async () => {
    const config = configuration({ root: resolve(import.meta.dir, ".."), requestTimeoutMs: 5000 });
    let client: NativePeer;
    client = new NativePeer(
      "typescript",
      [process.execPath, join(import.meta.dir, "lsp.ts")],
      config,
      async message => {
        if (message.id !== undefined && message.method)
          await client.send({
            jsonrpc: "2.0",
            id: message.id,
            result: message.method === "workspace/configuration" ? message.params.items.map(() => null) : null,
          });
      },
    );
    try {
      const initialized = await client.request("initialize", {
        processId: process.pid,
        rootUri: pathToFileURL(config.root).href,
        capabilities: { general: { positionEncodings: ["utf-16"] } },
      });
      expect(initialized.error).toBeUndefined();
      await client.send({ jsonrpc: "2.0", method: "initialized", params: {} });
      for (const extension of ["pyts", "pytsx"]) {
        const uri = pathToFileURL(join(config.root, `__buv_protocol_buffer__.${extension}`)).href;
        await client.send({
          jsonrpc: "2.0",
          method: "textDocument/didOpen",
          params: {
            textDocument: {
              uri,
              languageId: extension === "pytsx" ? "typescriptreact" : "typescript",
              version: 1,
              text: 'const value: number = "incorrect";\n',
            },
          },
        });
        const diagnostics = await client.request("textDocument/diagnostic", { textDocument: { uri } });
        expect(diagnostics.error).toBeUndefined();
        expect(diagnostics.result.items.some((item: { code: number }) => item.code === 2322)).toBe(true);
        const diagnostic = diagnostics.result.items.find((item: { code: number }) => item.code === 2322);
        expect(diagnostic.range.start.line).toBe(0);
        await client.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } });
      }
      const shutdown = await client.request("shutdown");
      expect(shutdown.error).toBeUndefined();
      await client.send({ jsonrpc: "2.0", method: "exit" });
    } finally {
      await client.close();
    }
  },
);
