// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { createChromePasswordProvider } from "../../bun-google/src/password-store.ts";
import { createChromiumPasswordConnection } from "../src/passwords.ts";

test("Chromium shares the private owner provider without claiming browser import or exposing credential metadata", async () => {
  const csv = "name,url,username,password\nFixture,https://example.test/login,fixture-user,fixture-password\n";
  using directory = tempDir("chromium-passwords", { "private.csv": csv });
  const filename = join(String(directory), "private.csv");
  chmodSync(filename, 0o600);
  const provider = createChromePasswordProvider({ filename, allowedPaths: [filename], assertProtectedPath() {} });
  const connection = createChromiumPasswordConnection(provider);
  const plan = connection.importPlan();
  expect(plan.records).toBe(1);
  expect(plan.nativeManagerURL).toBe("chrome://password-manager/settings");
  expect(plan.requiresNativeFileSelection).toBe(true);
  expect(plan.imported).toBe(false);
  expect(plan.browserValidated).toBe(false);
  expect(Object.isFrozen(plan)).toBe(true);
  expect(JSON.stringify(plan)).not.toContain("fixture-user");
  expect(JSON.stringify(plan)).not.toContain("fixture-password");
  expect(JSON.stringify(plan)).not.toContain("example.test");
  let consumed = false;
  const returned = await connection.withCredential(
    { url: "https://example.test/other", username: "fixture-user" },
    credential => {
      expect(credential.password).toBe("fixture-password");
      consumed = true;
    },
  );
  expect(consumed).toBe(true);
  expect(returned).toBeUndefined();
  expect(await Bun.file(filename).text()).toBe(csv);
});

test("Chromium retains shared provider origin and private-path boundaries", async () => {
  using directory = tempDir("chromium-password-boundaries", {
    "private.csv": "name,url,username,password\nFixture,https://example.test/login,user,password\n",
  });
  const filename = join(String(directory), "private.csv");
  chmodSync(filename, 0o600);
  let protectedPath = true;
  const provider = createChromePasswordProvider({
    filename,
    allowedPaths: [filename],
    assertProtectedPath() {
      if (!protectedPath) throw new Error("Protected source unavailable");
    },
  });
  const connection = createChromiumPasswordConnection(provider);
  await expect(connection.withCredential({ url: "https://other.test" }, () => {})).rejects.toThrow();
  protectedPath = false;
  expect(() => connection.importPlan()).toThrow("Protected source unavailable");
  await expect(connection.withCredential({ url: "https://example.test" }, () => {})).rejects.toThrow();
  expect(() => createChromiumPasswordConnection(null as never)).toThrow("explicit shared Chrome password provider");
});
