// SPDX-License-Identifier: Apache-2.0
import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const CHUNK_SIZE = 1800;
const MAX_BYTES = 4 * 1024 * 1024;
const ENV_KEY = "CHROME_PASSWORDS_CSV_BASE64";
class EnvelopeWriterActiveError extends Error {}

export interface ChromeVaultOptions {
  sourceFile: string;
  allowedSourceFiles: readonly string[];
  privateRoot: string;
  assertProtectedPath(path: string): void;
  protectDirectory(path: string): void | Promise<void>;
}
export interface ChromeVaultPlan {
  readonly snapshotId: string;
  readonly service: string;
  readonly bytes: number;
  readonly chunks: number;
  readonly localOnly: true;
}
export interface VaultStore {
  get(options: { service: string; name: string }): Promise<string | null>;
  set(options: { service: string; name: string; value: string; persist: "local" }): Promise<void>;
  delete(options: { service: string; name: string }): Promise<boolean>;
}
export interface EnvelopeOwner {
  encrypt(service: string, input: string, output: string, passphrase: string): Promise<void>;
  decrypt(input: string, output: string, passphrase: string): Promise<void>;
}
const plans = new WeakMap<ChromeVaultPlan, { options: ChromeVaultOptions; sha256: string }>();
const digest = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const canonical = (path: string) => (process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path));

function readProtectedSource(options: ChromeVaultOptions): Buffer {
  options.assertProtectedPath(options.sourceFile);
  const before = lstatSync(options.sourceFile);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_BYTES)
    throw new Error("Unsafe private source");
  const descriptor = openSync(options.sourceFile, "r");
  let bytes: Buffer | undefined;
  let returned = false;
  try {
    const stat = fstatSync(descriptor);
    if (stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size || stat.nlink !== 1)
      throw new Error("Private source changed");
    bytes = Buffer.alloc(stat.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = readSync(descriptor, bytes, count, bytes.length - count, null);
      if (!read) break;
      count += read;
    }
    const after = fstatSync(descriptor);
    if (count !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
      bytes.fill(0);
      throw new Error("Private source changed");
    }
    options.assertProtectedPath(options.sourceFile);
    returned = true;
    return bytes.subarray(0, count);
  } finally {
    if (!returned) bytes?.fill(0);
    closeSync(descriptor);
  }
}

function assertDirectAncestors(path: string) {
  for (let current = resolve(path); ; current = dirname(current)) {
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Unsafe private destination ancestor");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (dirname(current) === current) break;
  }
}

export function createChromeVaultPlan(options: ChromeVaultOptions): ChromeVaultPlan {
  if (
    !isAbsolute(options.sourceFile) ||
    !isAbsolute(options.privateRoot) ||
    !Array.isArray(options.allowedSourceFiles) ||
    !options.allowedSourceFiles.some(path => isAbsolute(path) && canonical(path) === canonical(options.sourceFile)) ||
    typeof options.assertProtectedPath !== "function" ||
    typeof options.protectDirectory !== "function"
  )
    throw new Error("Explicit protected source and private destination required");
  const copied = { ...options, sourceFile: resolve(options.sourceFile), privateRoot: resolve(options.privateRoot) };
  const bytes = readProtectedSource(copied);
  try {
    const snapshotId = crypto.randomUUID();
    const plan = Object.freeze({
      snapshotId,
      service: "com.aphrody.browser-passwords." + snapshotId,
      bytes: bytes.length,
      chunks: Math.ceil((Math.ceil(bytes.length / 3) * 4) / CHUNK_SIZE),
      localOnly: true as const,
    });
    plans.set(plan, { options: copied, sha256: digest(bytes) });
    return plan;
  } finally {
    bytes.fill(0);
  }
}

/** Native Aphrody owns envelope encryption; passwords are passed only in the child environment. */
export function nativeEnvelopeOwner(executable: string): EnvelopeOwner {
  if (!isAbsolute(executable)) throw new Error("Absolute native Aphrody executable required");
  async function run(args: string[], passphrase: string) {
    const child = Bun.spawn({
      cmd: [executable, "infra", "secrets", ...args],
      env: { ...process.env, APHRODY_SECRETS_PASSWORD: passphrase },
      stdout: "ignore",
      stderr: "ignore",
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const exit = await Promise.race([
        child.exited,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Native envelope command timed out")), 60000);
        }),
      ]);
      if (exit !== 0) throw new Error("Native envelope command failed: " + exit);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) {
        let stopTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          try {
            child.kill();
          } catch {
            throw new EnvelopeWriterActiveError("Native writer stop unconfirmed; protected snapshot preserved");
          }
          await Promise.race([
            child.exited,
            new Promise<never>((_, reject) => {
              stopTimer = setTimeout(
                () =>
                  reject(new EnvelopeWriterActiveError("Native writer stop unconfirmed; protected snapshot preserved")),
                5000,
              );
            }),
          ]);
        } catch {
          throw new EnvelopeWriterActiveError("Native writer stop unconfirmed; protected snapshot preserved");
        } finally {
          clearTimeout(stopTimer);
          child.unref();
        }
      }
      child.unref();
    }
  }
  return {
    encrypt: (service, input, output, passphrase) =>
      run(["encrypt", "--service", service, "--in", input, "--out", output], passphrase),
    decrypt: (input, output, passphrase) => run(["decrypt", "--in", input, "--out", output], passphrase),
  };
}

function removeOwnedFile(path: string) {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Private temporary cleanup failed");
  }
}

export async function applyChromeVaultPlan(
  plan: ChromeVaultPlan,
  options: { envelope: EnvelopeOwner; vault?: VaultStore },
) {
  const state = plans.get(plan);
  if (!state) throw new Error("An unchanged in-process private snapshot plan is required");
  const vault = options.vault ?? Bun.secrets;
  const chunks = Array.from({ length: plan.chunks }, (_, index) => "csv-" + String(index).padStart(5, "0"));
  const names = [...chunks, "envelope-passphrase", "manifest"];
  for (const name of names)
    if ((await vault.get({ service: plan.service, name })) !== null)
      throw new Error("Snapshot namespace already exists");
  const bytes = readProtectedSource(state.options);
  if (bytes.length !== plan.bytes || digest(bytes) !== state.sha256) {
    bytes.fill(0);
    throw new Error("Private source changed since plan");
  }
  const directory = join(state.options.privateRoot, plan.snapshotId);
  const input = join(directory, ".input.env"),
    verified = join(directory, ".verified.env"),
    encrypted = join(directory, "chrome-passwords.enc.json");
  const created = new Map<string, string>();
  let directoryCreated = false,
    success = false,
    writerUncertain = false;
  async function store(name: string, value: string) {
    if (Buffer.byteLength(value) >= 2048) throw new Error("Snapshot vault entry exceeds limit");
    if ((await vault.get({ service: plan.service, name })) !== null) throw new Error("Snapshot namespace changed");
    created.set(name, value);
    await vault.set({ service: plan.service, name, value, persist: "local" });
    if ((await vault.get({ service: plan.service, name })) !== value)
      throw new Error("Snapshot vault verification failed");
  }
  try {
    assertDirectAncestors(state.options.privateRoot);
    let rootExists = true;
    try {
      lstatSync(state.options.privateRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      rootExists = false;
    }
    if (rootExists) state.options.assertProtectedPath(state.options.privateRoot);
    else {
      mkdirSync(state.options.privateRoot, { mode: 0o700 });
      await state.options.protectDirectory(state.options.privateRoot);
      state.options.assertProtectedPath(state.options.privateRoot);
    }
    assertDirectAncestors(state.options.privateRoot);
    mkdirSync(directory, { mode: 0o700 });
    directoryCreated = true;
    await state.options.protectDirectory(directory);
    state.options.assertProtectedPath(directory);
    const encoded = bytes.toString("base64");
    for (let index = 0; index < chunks.length; index++)
      await store(chunks[index]!, encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
    const random = crypto.getRandomValues(new Uint8Array(32));
    const passphrase = Buffer.from(random).toString("base64");
    random.fill(0);
    await store("envelope-passphrase", passphrase);
    writeFileSync(input, ENV_KEY + "=" + encoded + "\n", { flag: "wx", mode: 0o600 });
    state.options.assertProtectedPath(input);
    await options.envelope.encrypt(plan.service, input, encrypted, passphrase);
    state.options.assertProtectedPath(encrypted);
    const storedPassphrase = await vault.get({ service: plan.service, name: "envelope-passphrase" });
    if (storedPassphrase !== passphrase) throw new Error("Snapshot passphrase verification failed");
    await options.envelope.decrypt(encrypted, verified, storedPassphrase);
    state.options.assertProtectedPath(verified);
    const decodedEnv = await Bun.file(verified).text();
    const values = [
      ...decodedEnv.matchAll(
        /^CHROME_PASSWORDS_CSV_BASE64=(?:"([A-Za-z0-9+/=]*)"|'([A-Za-z0-9+/=]*)'|([A-Za-z0-9+/=]*))\r?$/gm,
      ),
    ];
    if (values.length !== 1) throw new Error("Native envelope verification failed");
    const decoded = Buffer.from(values[0]![1] ?? values[0]![2] ?? values[0]![3]!, "base64");
    const envelopeEqual = decoded.equals(bytes);
    decoded.fill(0);
    if (!envelopeEqual) throw new Error("Native envelope verification failed");
    let reassembled = "";
    for (const name of chunks) {
      const part = await vault.get({ service: plan.service, name });
      if (part === null || part.length > CHUNK_SIZE || !/^[A-Za-z0-9+/=]*$/.test(part))
        throw new Error("Snapshot vault verification failed");
      reassembled += part;
    }
    const recovered = Buffer.from(reassembled, "base64");
    const vaultEqual = recovered.equals(bytes);
    recovered.fill(0);
    if (!vaultEqual) throw new Error("Snapshot vault verification failed");
    const current = readProtectedSource(state.options);
    const unchanged = current.equals(bytes);
    current.fill(0);
    if (!unchanged) throw new Error("Private source changed during snapshot");
    removeOwnedFile(input);
    removeOwnedFile(verified);
    const manifest = {
      schemaVersion: 1,
      snapshotId: plan.snapshotId,
      bytes: plan.bytes,
      chunks: chunks.length,
      encoding: "base64",
      sha256: state.sha256,
      encryptedFile: "chrome-passwords.enc.json",
      localOnly: true,
      createdAt: new Date().toISOString(),
    };
    await store("manifest", JSON.stringify(manifest));
    const receipt = {
      schemaVersion: 1,
      ...plan,
      vaultVerified: true,
      envelopeVerified: true,
      sourceUnchanged: true,
      plaintextTemporariesRemoved: true,
    };
    writeFileSync(join(directory, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    state.options.assertProtectedPath(join(directory, "receipt.json"));
    success = true;
    plans.delete(plan);
    return receipt;
  } catch (error) {
    writerUncertain = error instanceof EnvelopeWriterActiveError;
    throw error;
  } finally {
    bytes.fill(0);
    const cleanupErrors: unknown[] = [];
    const attempt = async (operation: () => void | Promise<unknown>) => {
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(error);
      }
    };
    if (directoryCreated && !writerUncertain) {
      await attempt(() => removeOwnedFile(input));
      await attempt(() => removeOwnedFile(verified));
    }
    if (!success && !writerUncertain) {
      for (const [name, value] of created)
        await attempt(async () => {
          if ((await vault.get({ service: plan.service, name })) === value) {
            await vault.delete({ service: plan.service, name });
            if ((await vault.get({ service: plan.service, name })) === value)
              throw new Error("Owned vault entry cleanup failed");
          }
        });
      if (directoryCreated) {
        await attempt(() => removeOwnedFile(encrypted));
        await attempt(() => removeOwnedFile(join(directory, "receipt.json")));
        try {
          rmdirSync(directory);
        } catch {
          /* Preserve unexpected files in the privately reserved snapshot directory. */
        }
      }
    }
    if (cleanupErrors.length) throw new Error("Private snapshot cleanup incomplete");
  }
}
