// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";

test("build plugins preserve native symlink paths while formatting canonical display paths", async () => {
  using directory = tempDir("plugin-symlink-pretty", {
    "entry.js": 'export { answer } from "linked-package";',
    "store/linked/index.js": 'export { answer } from "framework-utils";',
    "store/linked/package.json": '{"name":"linked-package","main":"index.js"}',
    "store/linked/node_modules/framework-utils/package.json":
      '{"name":"framework-utils","main":"dist/utils.cjs.js","module":"dist/utils.esm.js"}',
    "store/linked/node_modules/framework-utils/dist/utils.cjs.js": "exports.answer = 42;",
    "store/linked/node_modules/framework-utils/dist/utils.esm.js": "export const answer = 42;",
    "build.ts": `
      import { dirname, resolve } from "node:path";
      const result = await Bun.build({
        entrypoints: ["./entry.js"], outdir: "./out", target: "browser",
        plugins: [{ name: "resolve-linked", setup(builder) {
          builder.onResolve({ filter: /^linked-package$/ }, () => ({
            path: resolve("node_modules/linked-package/index.js").replaceAll("\\\\", "/"),
          }));
          builder.onResolve({ filter: /^framework-utils$/ }, args => ({
            path: Bun.resolveSync(args.path, dirname(args.importer)),
          }));
        }}],
      });
      if (!result.success) throw new AggregateError(result.logs);
      const { answer } = await import(resolve("out/entry.js"));
      if (answer !== 42) throw new Error("wrong linked module");
      console.log(answer);
    `,
  });
  const root = String(directory);
  mkdirSync(join(root, "node_modules"), { recursive: true });
  mkdirSync(join(root, "store/linked/node_modules"), { recursive: true });
  symlinkSync(join(root, "store/linked"), join(root, "node_modules/linked-package"), "junction");
  await using child = Bun.spawn({
    cmd: [bunExe(), "build.ts"],
    cwd: root,
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(stderr).not.toContain("Expected pretty file path");
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe("42");
});
