// rclone du fork : CLI (spawn) et librclone en FFI (RcloneRPCJSON, ajouté par le fork aphrody-labs/rclone).
import { dlopen, FFIType, ptr, CString } from "bun:ffi";
import { assetName, ensureAsset } from "./assets.ts";

export async function rcloneBin(): Promise<string> {
  return process.env.APHRODY_RCLONE ?? (await ensureAsset(assetName("rclone")));
}

/** Lance le CLI rclone ; renvoie code de sortie et sorties. */
export async function rclone(args: string[]) {
  const p = Bun.spawn([await rcloneBin(), ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([p.stdout.text(), p.stderr.text(), p.exited]);
  return { stdout, stderr, exitCode };
}

/** Appel RC en processus via librclone : `rcloneRpc("operations/list", { fs: ".", remote: "" })`. */
export async function rcloneRpc<T = unknown>(
  method: string,
  params: object = {},
): Promise<{ status: number; output: T }> {
  const lib = dlopen(process.env.APHRODY_LIBRCLONE ?? (await ensureAsset(assetName("librclone"))), {
    RcloneInitialize: { args: [], returns: FFIType.void },
    RcloneFinalize: { args: [], returns: FFIType.void },
    RcloneRPCJSON: { args: [FFIType.cstring, FFIType.cstring], returns: FFIType.ptr },
    RcloneFreeString: { args: [FFIType.ptr], returns: FFIType.void },
  });
  const z = (s: string) => Buffer.from(`${s}\0`);
  lib.symbols.RcloneInitialize();
  try {
    const out = lib.symbols.RcloneRPCJSON(ptr(z(method)), ptr(z(JSON.stringify(params))));
    if (!out) throw new Error("RcloneRPCJSON a renvoyé NULL");
    const json = new CString(out).toString();
    lib.symbols.RcloneFreeString(out);
    return JSON.parse(json);
  } finally {
    lib.symbols.RcloneFinalize();
    lib.close();
  }
}
