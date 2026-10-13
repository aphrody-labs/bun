// rclone du fork : CLI (spawn) et librclone en FFI (RcloneRPCJSON, ajouté par le fork aphrody-labs/rclone).
import { dlopen, FFIType, ptr, CString } from "bun:ffi";
import { assetName, ensureAsset, installedToolPath } from "./assets.ts";
import { existsSync, realpathSync } from "node:fs";
import { runTool, type ToolRunOptions } from "./process.ts";
import { isAbsolute } from "node:path";

const librarySymbols = {
  RcloneInitialize: { args: [], returns: FFIType.void },
  RcloneRPCJSON: { args: [FFIType.cstring, FFIType.cstring], returns: FFIType.ptr },
  RcloneFreeString: { args: [FFIType.ptr], returns: FFIType.void },
} as const;
type RcloneLibrary = ReturnType<typeof dlopen<typeof librarySymbols>>;
const libraryKey = Symbol.for("bun-tools.librclone.process-library");
const libraryOwner = globalThis as typeof globalThis & {
  [libraryKey]?: { path: string; library: Promise<RcloneLibrary> };
};

async function retainedLibrary(path: string): Promise<RcloneLibrary> {
  const canonical = realpathSync(path);
  const retained = libraryOwner[libraryKey];
  if (retained) {
    if (retained.path !== canonical) throw new Error("Librclone is already initialized from another library path");
    return retained.library;
  }
  // Go c-shared libraries cannot be unloaded safely; Bun retains unclosed FFI handles at VM teardown.
  const library = Promise.resolve().then(() => {
    const lib = dlopen(canonical, librarySymbols);
    lib.symbols.RcloneInitialize();
    return lib;
  });
  libraryOwner[libraryKey] = { path: canonical, library };
  return library;
}

export async function rcloneBin(): Promise<string> {
  const configured = process.env.BUN_RCLONE_BIN ?? process.env.APHRODY_RCLONE;
  if (configured && !isAbsolute(configured)) throw new Error("Rclone executable override must be absolute");
  if (configured) return configured;
  if (process.arch !== "x64" || !["win32", "linux"].includes(process.platform)) {
    const executable = Bun.which("rclone");
    if (!executable) throw new Error("Rclone backend unavailable on this target; install it explicitly");
    return executable;
  }
  const name = assetName("rclone");
  if (existsSync(installedToolPath(name))) return ensureAsset(name);
  return Bun.which("rclone") ?? (await ensureAsset(name));
}

/** Lance le CLI rclone ; renvoie code de sortie et sorties. */
export async function rclone(args: string[], options: ToolRunOptions = {}) {
  return runTool(await rcloneBin(), args, options);
}

/** Appel RC en processus via librclone : `rcloneRpc("operations/list", { fs: ".", remote: "" })`. */
export async function rcloneRpc<T = unknown>(
  method: string,
  params: object = {},
): Promise<{ status: number; output: T }> {
  if (!Bun.isMainThread) throw new Error("Librclone RPC requires the main thread; use the rclone CLI from workers");
  let parameters: string;
  try {
    parameters = JSON.stringify(params);
  } catch {
    throw new Error("Rclone RPC parameters must be JSON serializable");
  }
  if (
    typeof method !== "string" ||
    !method ||
    method.includes("\0") ||
    Buffer.byteLength(method) > 4096 ||
    typeof parameters !== "string" ||
    Buffer.byteLength(parameters) > 2 * 1024 * 1024
  )
    throw new Error("Invalid or oversized Rclone RPC input");
  const configuredLibrary = process.env.APHRODY_LIBRCLONE;
  if (configuredLibrary && !isAbsolute(configuredLibrary))
    throw new Error("Librclone override must be an absolute library path");
  const lib = await retainedLibrary(configuredLibrary ?? (await ensureAsset(assetName("librclone"))));
  const z = (s: string) => Buffer.from(`${s}\0`);
  const methodBytes = z(method);
  const parameterBytes = z(parameters);
  const out = lib.symbols.RcloneRPCJSON(ptr(methodBytes), ptr(parameterBytes));
  if (!out) throw new Error("RcloneRPCJSON a renvoyé NULL");
  try {
    const json = new CString(out).toString();
    if (Buffer.byteLength(json) > 8 * 1024 * 1024) throw new Error("Rclone RPC response exceeded its result bound");
    try {
      return JSON.parse(json);
    } catch {
      throw new Error("Rclone RPC returned invalid JSON");
    }
  } finally {
    lib.symbols.RcloneFreeString(out);
  }
}
