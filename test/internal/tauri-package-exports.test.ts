// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bunEnv, bunExe, tempDir } from "../harness";

test("consolidated Tauri package exposes every API namespace and plugin subpaths", async () => {
  using directory = tempDir("tauri-package-exports", {
    "package.json": '{"type":"module"}',
    "consumer.ts": `
      import * as tauri from "@aphrody/tauri";
      import * as api from "@aphrody/tauri/api";
      import { invoke } from "@aphrody/tauri/api/core";
      import { Menu } from "@aphrody/tauri/api/menu";
      import { Store } from "@aphrody/tauri/plugins/store";
      import { serveForTauri } from "@aphrody/tauri/server";
      const names = Object.keys(api).sort();
      if (!names.every(name => api[name] === tauri[name])) throw Error("API namespace mismatch");
      console.log(JSON.stringify({ names, invoke: invoke === api.core.invoke, menu: Menu === api.menu.Menu, store: typeof Store, serve: typeof serveForTauri }));
    `,
  });
  const scope = join(String(directory), "node_modules/@aphrody");
  await mkdir(scope, { recursive: true });
  await symlink(
    resolve(import.meta.dir, "../../packages/bun-tauri"),
    join(scope, "tauri"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await using child = Bun.spawn({
    cmd: [bunExe(), "consumer.ts"],
    cwd: String(directory),
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(stdout.trim(), stderr).toBe(
    '{"names":["app","core","dpi","event","image","menu","mocks","path","tray","webview","webviewWindow","window"],"invoke":true,"menu":true,"store":"function","serve":"function"}',
  );
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});
