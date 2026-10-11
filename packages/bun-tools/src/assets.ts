// Résout les binaires rclone/rsync/librclone du fork : cache local, sinon téléchargement depuis la release aphrody-tools
// d'aphrody-labs/bun avec vérification SHA256SUMS.txt.
import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

export const RELEASE = process.env.APHRODY_TOOLS_RELEASE ?? "aphrody-tools-1";
const BASE = `https://github.com/aphrody-labs/bun/releases/download/${RELEASE}`;

export const platformTag = () => {
  const os = process.platform === "win32" ? "windows" : process.platform;
  if (process.arch !== "x64") throw new Error(`architecture non prise en charge: ${process.arch}`);
  return os === "linux" ? "linux-x64" : `${os}-x64`;
};

const cacheDir = () =>
  process.env.APHRODY_TOOLS_DIR ??
  join(
    process.env.LOCALAPPDATA ?? join(process.env.HOME ?? ".", ".cache"),
    "aphrody",
    "tools",
    RELEASE,
  );

/** Nom de l'asset de la release pour un outil sur la plateforme courante. */
export function assetName(tool: "rclone" | "rsync" | "librclone"): string {
  const t = platformTag();
  if (tool === "rsync") {
    if (t !== "linux-x64")
      throw new Error(
        "Native rsync is unsupported on this target; a qualified native producer is required",
      );
    return "rsync-linux-x64-musl";
  }
  const ext =
    tool === "librclone"
      ? t === "windows-x64"
        ? ".dll"
        : ".so"
      : t === "windows-x64"
        ? ".exe"
        : "";
  return `${tool}-${t}${ext}`;
}

/** Chemin local du binaire (téléchargé et vérifié au premier appel). */
export async function ensureAsset(name: string): Promise<string> {
  if (
    !/^(?:rclone-(?:linux|windows)-x64(?:\.exe)?|librclone-(?:linux|windows)-x64\.(?:so|dll)|rsync-linux-x64-musl)$/.test(
      name,
    )
  ) {
    throw new Error(`Unsupported tool asset: ${name}`);
  }
  const dir = cacheDir();
  const dest = join(dir, name);
  mkdirSync(dir, { recursive: true });
  const sums = new Map<string, string>();
  const sumsRes = await fetch(`${BASE}/SHA256SUMS.txt`);
  if (!sumsRes.ok) throw new Error(`SHA256SUMS.txt: HTTP ${sumsRes.status}`);
  for (const l of (await sumsRes.text()).split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(l.trim());
    if (m) sums.set(m[2]!, m[1]!);
  }
  const want = sums.get(name);
  if (!want) throw new Error(`${name} absent de SHA256SUMS.txt`);
  if (existsSync(dest)) {
    if (!lstatSync(dest).isFile())
      throw new Error(`Tool cache entry is not a regular file: ${name}`);
    const cached = await Bun.file(dest).arrayBuffer();
    const cachedHash = new Bun.CryptoHasher("sha256").update(cached).digest("hex");
    if (cachedHash === want) return dest;
  }
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const got = new Bun.CryptoHasher("sha256").update(buf).digest("hex");
  if (got !== want) throw new Error(`${name}: SHA256 ${got} ≠ ${want}`);
  const tmp = `${dest}.${crypto.randomUUID()}.part`;
  try {
    await Bun.write(tmp, buf);
    if (process.platform !== "win32") chmodSync(tmp, 0o755);
    renameSync(tmp, dest);
  } finally {
    rmSync(tmp, { force: true });
  }
  return dest;
}
