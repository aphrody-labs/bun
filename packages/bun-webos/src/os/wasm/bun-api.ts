// SPDX-License-Identifier: Apache-2.0
/**
 * The subset of `globalThis.Bun` the WebOS offers on the page's own JS engine.
 * Logic that exists in Bun's Rust crates comes from bun_wasm; files go to the
 * WebOS home on the server (vfs-client.ts). Anything not listed throws a clear error.
 */
import type { BunWasm } from "./bun-wasm";
import type { Vfs } from "./vfs-client";

export interface WebBunFile {
  readonly name: string;
  exists(): Promise<boolean>;
  size(): Promise<number>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  bytes(): Promise<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export function createBunApi(core: BunWasm, fs: Vfs, cwd = "/") {
  const resolve = (path: string) => (path.startsWith("/") ? path : `${cwd.replace(/\/$/, "")}/${path}`);
  const file = (path: string): WebBunFile => {
    const abs = resolve(path);
    return {
      name: abs,
      exists: () => fs.exists(abs),
      size: () => fs.size(abs),
      text: async () => new TextDecoder().decode(await fs.read(abs)),
      json: async () => JSON.parse(new TextDecoder().decode(await fs.read(abs))),
      bytes: () => fs.read(abs),
      arrayBuffer: async () => (await fs.read(abs)).slice().buffer as ArrayBuffer,
    };
  };
  const unsupported = (name: string) => () => {
    throw new Error(`Bun.${name} is not available in the WebOS yet (no wasm backing)`);
  };

  return {
    version: core.version,
    revision: "wasm",
    env: {} as Record<string, string>,
    cwd: () => cwd,
    semver: { order: core.semverOrder, satisfies: core.semverSatisfies },
    markdown: { html: core.markdownHtml },
    /** Not a public Bun API: Bun Shell's parser, exposed for the WebOS tools. */
    shellParse: core.shellParse,
    file,
    async write(target: string | WebBunFile, data: string | Uint8Array | ArrayBuffer | WebBunFile): Promise<number> {
      const path = typeof target === "string" ? resolve(target) : target.name;
      const bytes =
        typeof data === "string"
          ? new TextEncoder().encode(data)
          : data instanceof Uint8Array
            ? data
            : data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : await data.bytes();
      await fs.write(path, bytes);
      return bytes.byteLength;
    },
    sleep: (ms: number) => new Promise<void>(r => setTimeout(r, ms)),
    nanoseconds: () => Math.round(performance.now() * 1e6),
    spawn: unsupported("spawn"),
    serve: unsupported("serve"),
    Transpiler: unsupported("Transpiler"),
    build: unsupported("build"),
  };
}

export type WebBun = ReturnType<typeof createBunApi>;
