// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { createChromePasswordProvider, createConfiguredChromePasswordProvider } from "../src/password-store";

function provider(directory: string, content: string) {
  const filename = join(directory, "fixture.csv");
  writeFileSync(filename, content, { mode: 0o600 });
  chmodSync(filename, 0o600);
  return createChromePasswordProvider({
    filename,
    allowedPaths: [filename],
    assertProtectedPath() {},
  });
}
const header = "name,url,username,password\r\n";

test("audit exposes only counters, handles BOM, quotes, commas, Unicode and multiline cells", async () => {
  using directory = tempDir("chrome-password-csv", {});
  const source = provider(
    String(directory),
    "\uFEFF" +
      header +
      '"Fixture, 日本",https://example.test/login,fixture,"a""b\r\nc"\r\n' +
      "Mobile,android://fixture,other,second\r\n",
  );
  expect(source.audit()).toEqual({
    records: 2,
    supportedWebOrigins: 1,
    credentialsWithPassword: 2,
    unsupportedRecords: 1,
  });
  let observed = false;
  expect(
    await source.withCredential({ url: "https://example.test/other" }, credential => {
      expect(credential.name).toBe("Fixture, 日本");
      expect(credential.password).toBe('a"b\r\nc');
      expect(Object.isFrozen(credential)).toBe(true);
      observed = true;
    }),
  ).toBeUndefined();
  expect(observed).toBe(true);
});

test("origin and username selectors never fallback across unrelated origins or ambiguous accounts", async () => {
  using directory = tempDir("chrome-password-selection", {});
  const source = provider(
    String(directory),
    header + "One,https://example.test,a,first\nTwo,https://example.test,b,second\n",
  );
  for (const url of [
    "https://example.test",
    "https://other.test",
    "https://child.example.test",
    "http://example.test",
    "https://user:pass@example.test",
    "javascript:alert(1)",
  ])
    await expect(
      source.withCredential({ url }, () => {
        throw new Error("must not execute");
      }),
    ).rejects.toThrow();
  let selected = "";
  await source.withCredential({ url: "https://example.test", username: "b" }, value => {
    selected = value.password;
  });
  expect(selected).toBe("second");
});

test("strict CSV failures reveal no field values", () => {
  using directory = tempDir("chrome-password-invalid", {});
  for (const content of [
    "password,url,username,name\n",
    header + "private,https://example.test,secret\n",
    header + 'private,https://example.test,secret,"unterminated',
    header + 'private,https://example.test,secret,"password"tail\n',
    header + "private,https://example.test,secret,password,extra\n",
    header + "private,https://example.test,secret,pass\0word\n",
  ])
    expect(() => provider(String(directory), content).audit()).toThrow("Invalid Chrome password CSV");
});

test("requires explicit path allowlist and owner protection validation before any private read", () => {
  using directory = tempDir("chrome-password-owner", {});
  const filename = join(String(directory), "missing.csv");
  expect(() => createChromePasswordProvider({ filename, allowedPaths: [], assertProtectedPath() {} })).toThrow(
    "allowlisted",
  );
  const source = createChromePasswordProvider({
    filename,
    allowedPaths: [filename],
    assertProtectedPath() {
      throw new Error("owner denied");
    },
  });
  expect(() => source.audit()).toThrow("owner denied");
});

test("credential callback errors are redacted and never return consumer values", async () => {
  using directory = tempDir("chrome-password-callback", {});
  const source = provider(String(directory), header + "Fixture,https://example.test,fixture,synthetic-secret\n");
  await expect(
    source.withCredential({ url: "https://example.test" }, value => {
      throw new Error(value.password);
    }),
  ).rejects.toThrow("Chrome credential consumer failed");
  expect(
    await source.withCredential({ url: "https://example.test" }, (() => "synthetic-secret") as () => void),
  ).toBeUndefined();
});

test("rejects oversized credential cells without yielding a credential", () => {
  using directory = tempDir("chrome-password-bound", {});
  const source = provider(String(directory), header + "Fixture,https://example.test,fixture," + "x".repeat(16385));
  expect(() => source.audit()).toThrow("exceeds limit");
});

test("current Chrome optional note column is accepted and never reaches the credential consumer", async () => {
  using directory = tempDir("chrome-password-note", {});
  const source = provider(
    String(directory),
    "name,url,username,password,note\r\n" + 'Fixture,https://example.test,fixture,password,"private, note"\r\n',
  );
  expect(source.audit().records).toBe(1);
  await source.withCredential({ url: "https://example.test" }, value => {
    expect(Object.keys(value).sort()).toEqual(["name", "password", "url", "username"]);
  });
});

test("common environment binding requires explicit configuration and performs no import-time private read", () => {
  using directory = tempDir("chrome-password-binding", {});
  const filename = join(String(directory), "not-created.csv");
  let checks = 0;
  const options = {
    allowedPaths: [filename],
    assertProtectedPath() {
      checks++;
      throw new Error("owner denied");
    },
  };
  expect(() => createConfiguredChromePasswordProvider(options, {})).toThrow("not configured");
  const source = createConfiguredChromePasswordProvider(options, {
    BUN_BROWSER_PASSWORDS_FILE: filename,
  });
  expect(checks).toBe(0);
  expect(() => source.audit()).toThrow("owner denied");
  expect(checks).toBe(1);
});
