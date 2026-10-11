// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { applyChromeVaultPlan, createChromeVaultPlan, type EnvelopeOwner, type VaultStore } from "./import";

function fixture(root: string) {
  const sourceFile = join(root, "passwords.csv");
  const privateRoot = join(root, "private");
  const raw = Buffer.from(
    '\ufeffname,url,username,password,note\r\n"Example","https://example.test","user","secret","first\nsecond"\r\n'.repeat(
      80,
    ),
  );
  writeFileSync(sourceFile, raw, { mode: 0o600 });
  const entries = new Map<string, string>();
  const writes: { name: string; persist: string; value: string }[] = [];
  const vault: VaultStore = {
    async get({ name }) {
      return entries.get(name) ?? null;
    },
    async set({ name, value, persist }) {
      entries.set(name, value);
      writes.push({ name, value, persist });
    },
    async delete({ name }) {
      return entries.delete(name);
    },
  };
  const envelope: EnvelopeOwner = {
    async encrypt(_service, input, output, passphrase) {
      expect(passphrase.length).toBeGreaterThan(32);
      writeFileSync(output, readFileSync(input), { flag: "wx", mode: 0o600 });
    },
    async decrypt(input, output) {
      writeFileSync(output, readFileSync(input), { flag: "wx", mode: 0o600 });
    },
  };
  const options = {
    sourceFile,
    privateRoot,
    allowedSourceFiles: [sourceFile],
    assertProtectedPath: () => {},
    protectDirectory: () => {},
  };
  return { raw, options, entries, writes, vault, envelope };
}

test("private snapshot preserves every CSV byte, bounds local vault chunks and removes plaintext temporaries", async () => {
  using directory = tempDir("chrome-vault", {});
  const f = fixture(String(directory));
  const plan = createChromeVaultPlan(f.options);
  expect(JSON.stringify(plan)).not.toContain(f.options.sourceFile);
  const receipt = await applyChromeVaultPlan(plan, f);
  const encoded = Array.from({ length: plan.chunks }, (_, index) =>
    f.entries.get("csv-" + String(index).padStart(5, "0")),
  ).join("");
  expect(Buffer.from(encoded, "base64").equals(f.raw)).toBe(true);
  expect(f.writes.every(write => write.persist === "local" && Buffer.byteLength(write.value) < 2048)).toBe(true);
  expect(readFileSync(f.options.sourceFile).equals(f.raw)).toBe(true);
  expect(receipt.envelopeVerified && receipt.vaultVerified && receipt.sourceUnchanged).toBe(true);
  const snapshot = join(f.options.privateRoot, plan.snapshotId);
  expect(existsSync(join(snapshot, ".input.env"))).toBe(false);
  expect(existsSync(join(snapshot, ".verified.env"))).toBe(false);
  expect(existsSync(join(snapshot, "chrome-passwords.enc.json"))).toBe(true);
  expect(JSON.parse(f.entries.get("manifest")!).sha256).toBe(
    new Bun.CryptoHasher("sha256").update(f.raw).digest("hex"),
  );
  await expect(applyChromeVaultPlan(plan, f)).rejects.toThrow("in-process");
});

test("existing vault namespace and changed source fail before writes", async () => {
  using directory = tempDir("chrome-vault-conflict", {});
  const f = fixture(String(directory));
  const plan = createChromeVaultPlan(f.options);
  f.entries.set("manifest", "foreign");
  await expect(applyChromeVaultPlan(plan, f)).rejects.toThrow("already exists");
  expect(f.entries.get("manifest")).toBe("foreign");
  expect(f.writes).toHaveLength(0);
  f.entries.clear();
  writeFileSync(f.options.sourceFile, "changed");
  await expect(applyChromeVaultPlan(plan, f)).rejects.toThrow("changed since plan");
  expect(f.writes).toHaveLength(0);
});

test("native envelope corruption rolls back only owned entries and private files", async () => {
  using directory = tempDir("chrome-vault-corrupt", {});
  const f = fixture(String(directory));
  const plan = createChromeVaultPlan(f.options);
  f.envelope.decrypt = async (_input, output) => {
    writeFileSync(output, "CHROME_PASSWORDS_CSV_BASE64=YQ==\n");
  };
  await expect(applyChromeVaultPlan(plan, f)).rejects.toThrow("envelope verification");
  expect(f.entries.size).toBe(0);
  expect(existsSync(join(f.options.privateRoot, plan.snapshotId))).toBe(false);
  expect(readFileSync(f.options.sourceFile).equals(f.raw)).toBe(true);
});

test("partially committed vault failures roll back without removing a changed foreign entry", async () => {
  using directory = tempDir("chrome-vault-partial", {});
  const f = fixture(String(directory));
  const plan = createChromeVaultPlan(f.options);
  const set = f.vault.set;
  f.vault.set = async options => {
    await set(options);
    if (options.name === "csv-00001") {
      f.entries.set("csv-00000", "foreign replacement");
      throw new Error("fixture storage failure");
    }
  };
  await expect(applyChromeVaultPlan(plan, f)).rejects.toThrow("fixture storage failure");
  expect([...f.entries]).toEqual([["csv-00000", "foreign replacement"]]);
  expect(existsSync(join(f.options.privateRoot, plan.snapshotId))).toBe(false);
});

test("protected-path refusal prevents planning and destination mutation", async () => {
  using directory = tempDir("chrome-vault-acl", {});
  const f = fixture(String(directory));
  expect(() => createChromeVaultPlan({ ...f.options, allowedSourceFiles: [] })).toThrow("Explicit protected");
  expect(() =>
    createChromeVaultPlan({
      ...f.options,
      assertProtectedPath: () => {
        throw new Error("private ACL refused");
      },
    }),
  ).toThrow("ACL refused");
  let refused = false;
  const plan = createChromeVaultPlan({
    ...f.options,
    assertProtectedPath: () => {
      if (refused) throw new Error("private ACL refused");
    },
  });
  refused = true;
  await expect(applyChromeVaultPlan(plan, f)).rejects.toThrow("ACL refused");
  expect(f.writes).toHaveLength(0);
  expect(existsSync(f.options.privateRoot)).toBe(false);
});

test("retained owned vault entries report incomplete cleanup", async () => {
  using directory = tempDir("chrome-vault-cleanup", {});
  const f = fixture(String(directory));
  const plan = createChromeVaultPlan(f.options);
  f.envelope.encrypt = async () => {
    throw new Error("fixture native failure");
  };
  f.vault.delete = async () => false;
  await expect(applyChromeVaultPlan(plan, f)).rejects.toThrow("cleanup incomplete");
  expect(f.entries.has("csv-00000")).toBe(true);
  expect(f.entries.has("manifest")).toBe(false);
  expect(existsSync(join(f.options.privateRoot, plan.snapshotId))).toBe(false);
});
