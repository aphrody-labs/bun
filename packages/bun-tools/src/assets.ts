import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { open } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import manifest from "./tool-assets.json";

export const RELEASE = process.env.APHRODY_TOOLS_RELEASE ?? "aphrody-tools-1";
const BASE = `https://github.com/aphrody-labs/bun/releases/download/${RELEASE}`;
export interface ToolAssetPin {
  bytes: number;
  sha256: string;
}
const pins: Record<string, ToolAssetPin> = manifest.assets;

export const platformTag = () => {
  const os = process.platform === "win32" ? "windows" : process.platform;
  if (process.arch !== "x64") throw new Error(`Unsupported tool architecture: ${process.arch}`);
  return `${os}-x64`;
};
export function toolsDirectory(): string {
  const configured = process.env.BUN_TOOLS_DIR ?? process.env.APHRODY_TOOLS_DIR;
  if (configured && !isAbsolute(configured)) throw new Error("Tool installation directory must be absolute");
  return configured ?? join(dirname(process.execPath), "lib", "tools");
}

export function installedAssetName(name: string): string {
  if (!pins[name]) throw new Error("Unsupported tool asset");
  if (name.startsWith("librclone-")) return name.endsWith(".dll") ? "librclone.dll" : "librclone.so";
  if (name.startsWith("rclone-")) return name.endsWith(".exe") ? "rclone.exe" : "rclone";
  return "rsync";
}

export function installedToolPath(name: string): string {
  return join(toolsDirectory(), installedAssetName(name));
}

export function assetName(tool: "rclone" | "rsync" | "librclone"): string {
  const target = platformTag();
  if (tool === "rsync") {
    if (target !== "linux-x64")
      throw new Error("Native rsync is unsupported on this target; use Bun's explicit native SSH delta protocol");
    return "rsync-linux-x64-musl";
  }
  if (target !== "linux-x64" && target !== "windows-x64") throw new Error("No qualified tool asset for this target");
  const ext =
    tool === "librclone" ? (target === "windows-x64" ? ".dll" : ".so") : target === "windows-x64" ? ".exe" : "";
  return `${tool}-${target}${ext}`;
}

export function toolAssetPin(name: string): ToolAssetPin {
  if (RELEASE !== "aphrody-tools-1" || !pins[name])
    throw new Error("Tool release/asset lacks immutable checksum and size pins");
  return { ...pins[name] };
}

async function verified(path: string, pin: ToolAssetPin): Promise<boolean> {
  if (!existsSync(path)) return false;
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Tool cache entry must be a regular file");
  if (info.size !== pin.bytes) return false;
  const hash = new Bun.CryptoHasher("sha256");
  for await (const bytes of Bun.file(path).stream()) hash.update(bytes);
  return hash.digest("hex") === pin.sha256;
}

/** Cache lookup never downloads. Installation requires download:true and pinned bytes. */
export async function ensureAsset(
  name: string,
  options: { download?: boolean; pin?: ToolAssetPin; signal?: AbortSignal } = {},
): Promise<string> {
  if (!pins[name]) throw new Error(`Unsupported tool asset: ${name}`);
  const pin = options.pin ?? toolAssetPin(name);
  if (
    !Number.isSafeInteger(pin.bytes) ||
    pin.bytes < 1 ||
    pin.bytes > 256 * 1024 ** 2 ||
    !/^[a-f0-9]{64}$/.test(pin.sha256)
  )
    throw new Error("Tool asset requires bounded size and SHA-256 pins");
  options.signal?.throwIfAborted();
  const dir = toolsDirectory();
  const dest = installedToolPath(name);
  if (await verified(dest, pin)) {
    options.signal?.throwIfAborted();
    return dest;
  }
  if (!options.download)
    throw new Error(`Tool cache missing or invalid: ${name}; install explicitly with bun-host tool install`);
  mkdirSync(dir, { recursive: true });
  if (lstatSync(dir).isSymbolicLink()) throw new Error("Tool cache root cannot be a symbolic link");
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)])
    : AbortSignal.timeout(120_000);
  const response = await fetch(`${BASE}/${name}`, { signal });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Tool asset download failed: HTTP ${response.status}`);
  }
  const tmp = `${dest}.${crypto.randomUUID()}.part`;
  const file = await open(tmp, "wx", 0o600).catch(async error => {
    await response.body!.cancel().catch(() => {});
    throw error;
  });
  const reader = response.body.getReader();
  const hash = new Bun.CryptoHasher("sha256");
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      signal.throwIfAborted();
      bytes += next.value.byteLength;
      if (bytes > pin.bytes) throw new Error("Tool asset exceeded its pinned size");
      hash.update(next.value);
      let offset = 0;
      while (offset < next.value.byteLength) {
        const written = await file.write(next.value, offset, next.value.byteLength - offset);
        if (!written.bytesWritten) throw new Error("Tool asset write made no progress");
        offset += written.bytesWritten;
      }
    }
    if (bytes !== pin.bytes || hash.digest("hex") !== pin.sha256) throw new Error("Tool asset size/SHA-256 mismatch");
    await file.sync();
    await file.close();
    if (process.platform !== "win32") chmodSync(tmp, 0o755);
    renameSync(tmp, dest);
    return dest;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await file.close().catch(() => {});
    rmSync(tmp, { force: true });
  }
}
