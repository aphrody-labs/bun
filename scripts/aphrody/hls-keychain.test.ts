// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { tempDir } from "../../test/harness";
import { migrateCookieInput } from "./hls-keychain";
import { normalizeCookieExport } from "./hls-lab-core";
import type { JsonSecretStore } from "../../packages/bun-video/src/secrets";

function memoryStore() {
  const values = new Map<string, string>();
  let writes = 0;
  const store: JsonSecretStore = {
    async get(ref) {
      return values.get(`${ref.service}/${ref.name}`) ?? null;
    },
    async set(ref) {
      expect(ref.persist).toBe("local");
      writes++;
      values.set(`${ref.service}/${ref.name}`, ref.value);
    },
    async delete(ref) {
      return values.delete(`${ref.service}/${ref.name}`);
    },
  };
  return { store, values, writes: () => writes };
}
const bundle = (domain = ".crunchyroll.com", value = "synthetic") =>
  normalizeCookieExport([
    { name: "session", value, domain, path: "/", secure: true, httpOnly: true, session: true },
  ]);

test("cookie migration verifies keychain data, preserves its source and can reuse an identical credential", async () => {
  const input = JSON.stringify(bundle());
  using directory = tempDir("video-keychain", { "cookies.json": input });
  const source = `${directory}/cookies.json`;
  const memory = memoryStore();
  expect(await migrateCookieInput(source, memory.store)).toEqual({
    provider: "bun.secrets",
    service: "@aphrody/bun-video",
    name: "crunchyroll.cookies",
    cookieCount: 1,
    verified: true,
    originalPreserved: true,
  });
  expect(await Bun.file(source).text()).toBe(input);
  const writes = memory.writes();
  expect((await migrateCookieInput(source, memory.store)).verified).toBe(true);
  expect(memory.writes()).toBe(writes);
});

test("cookie migration refuses other domains and never writes or reads credentials for that input", async () => {
  using directory = tempDir("video-keychain-scope", {
    "cookies.json": JSON.stringify(bundle(".crunchyroll.com.evil.test")),
  });
  let called = false;
  const forbidden = async () => {
    called = true;
    throw new Error("Unexpected credential access");
  };
  await expect(
    migrateCookieInput(`${directory}/cookies.json`, {
      get: forbidden,
      set: forbidden,
      delete: forbidden,
    }),
  ).rejects.toThrow("Crunchyroll cookies only");
  expect(called).toBe(false);
  await expect(
    migrateCookieInput("relative.json", { get: forbidden, set: forbidden, delete: forbidden }),
  ).rejects.toThrow("absolute path");
});

test("a different existing keychain credential is preserved instead of overwritten", async () => {
  using directory = tempDir("video-keychain-existing", {
    "first.json": JSON.stringify(bundle()),
    "second.json": JSON.stringify(bundle(".crunchyroll.com", "different")),
  });
  const memory = memoryStore();
  await migrateCookieInput(`${directory}/first.json`, memory.store);
  const original = new Map(memory.values);
  await expect(migrateCookieInput(`${directory}/second.json`, memory.store)).rejects.toThrow(
    "already exists",
  );
  expect(memory.values).toEqual(original);
});
