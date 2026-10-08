import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Shape of the Node-API addon (`crates/napi`). */
export interface NativeAddon {
  version(): string;
  transform(source: string, filename: string, options?: object | null): { code: string; map?: string | null };
  minify(source: string, filename: string): string;
  format(source: string, filename: string): string;
  lint(source: string, filename: string): string[];
  analyze(source: string, filename: string): unknown;
  parse(source: string, filename: string): unknown;
}

const NAME = "bun-plugin-oxc";
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/** napi-rs platform keys to try on this machine, in order. */
export function platformKeys(platform: string = process.platform, arch: string = process.arch): string[] {
  switch (platform) {
    case "win32":
      return [`win32-${arch}-msvc`];
    case "darwin":
      return [`darwin-${arch}`];
    case "linux":
      return [`linux-${arch}-gnu`, `linux-${arch}-musl`];
    default:
      return [];
  }
}

/** Where the addon may live, most specific first: env override, package root, optional package. */
function candidates(): string[] {
  const list: string[] = [];
  const override = process.env.APHRODY_BUN_PLUGIN_OXC_NATIVE;
  if (override) list.push(override);
  for (const key of platformKeys()) {
    list.push(join(PACKAGE_ROOT, `${NAME}.${key}.node`));
    list.push(`@aphrody/${NAME}-${key}`);
  }
  return list;
}

let cached: { addon: NativeAddon; path: string } | undefined;

function load(): { addon: NativeAddon; path: string } {
  if (cached) return cached;
  const errors: string[] = [];
  for (const candidate of candidates()) {
    const isPackage = candidate.startsWith("@");
    try {
      const path = isPackage ? require.resolve(candidate) : candidate;
      if (!isPackage && !existsSync(path)) continue;
      // The optional package exports its .node file as `main`; requiring it yields the addon.
      const addon = require(path) as NativeAddon;
      return (cached = { addon, path });
    } catch (error) {
      if (isPackage && (error as { code?: string }).code === "MODULE_NOT_FOUND") continue;
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const keys = platformKeys();
  throw new Error(
    keys.length === 0
      ? `bun-plugin-oxc has no native build for ${process.platform}-${process.arch}`
      : `bun-plugin-oxc native addon not found for ${keys.join(" / ")}. Build it with ` +
        `\`bun scripts/aphrody/build-napi.ts packages/bun-oxc\`, install ` +
        `@aphrody/${NAME}-${keys[0]}, or set APHRODY_BUN_PLUGIN_OXC_NATIVE.` +
        (errors.length ? `\n${errors.join("\n")}` : ""),
  );
}

/** The loaded addon. Throws with the searched locations when none is found. */
export function native(): NativeAddon {
  return load().addon;
}

/** Absolute path of the loaded `.node` file. */
export function nativePath(): string {
  return load().path;
}
