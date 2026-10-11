// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { bunEnv, bunExe, tempDir } from "../harness";

test("public Google and Chromium password subpaths resolve and share an explicit fixture provider", async () => {
  using directory = tempDir("google-password-package-exports", {
    "package.json": '{"type":"module"}',
    "fixture.csv":
      "name,url,username,password\nFixture,https://example.test/login,fixture-user,synthetic-password\n",
    "consumer.ts": `
      import { createChromePasswordProvider, createConfiguredChromePasswordProvider } from "@aphrody/bun-google/password-store";
      import { createChromiumPasswordConnection } from "@aphrody/bun-chromium/passwords";
      import { chmodSync } from "node:fs";
      import { join } from "node:path";
      const filename = join(import.meta.dir, "fixture.csv");
      chmodSync(filename, 0o600);
      const provider = createChromePasswordProvider({ filename, allowedPaths: [filename], assertProtectedPath() {} });
      const connection = createChromiumPasswordConnection(provider);
      let consumed = false;
      await connection.withCredential({ url: "https://example.test/other", username: "fixture-user" }, credential => {
        if (credential.password !== "synthetic-password") throw Error("Wrong fixture credential");
        consumed = true;
      });
      let checks = 0;
      createConfiguredChromePasswordProvider({ allowedPaths: [filename], assertProtectedPath() { checks++; } }, { BUN_BROWSER_PASSWORDS_FILE: filename });
      const plan = connection.importPlan();
      console.log(JSON.stringify({ consumed, records: plan.records, imported: plan.imported, browserValidated: plan.browserValidated, configurationReads: checks }));
    `,
  });
  const checkout = resolve(import.meta.dir, "../..");
  const scope = join(String(directory), "node_modules/@aphrody");
  await mkdir(scope, { recursive: true });
  for (const name of ["bun-google", "bun-chromium"]) {
    await symlink(
      join(checkout, "packages", name),
      join(scope, name),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  await using child = Bun.spawn({
    cmd: [bunExe(), "consumer.ts"],
    cwd: String(directory),
    env: { ...bunEnv, BUN_BROWSER_PASSWORDS_FILE: join(String(directory), "not-created.csv") },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(stdout.trim(), stderr).toBe(
    '{"consumed":true,"records":1,"imported":false,"browserValidated":false,"configurationReads":0}',
  );
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});
