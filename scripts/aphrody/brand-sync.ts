// Synchronise la marque Aphrody (logo, favicon, thème M3) dans ce dépôt. Le jeu est généré par aphrody-identity
// (aphrody-labs/aphrody crates/ui/identity, `export-assets`) et publié sur cdn.aphrody.com sous /s/aphrody/brand/ :
//   docs/logo/                      favicon.ico, icon.svg, icon-{192,512}.png, maskable-{192,512}.png,
//                                   apple-touch-icon.png, site.webmanifest (servis à la racine du site par
//                                   site/build.ts) et logo-wordmark-{light,dark}.svg (docs.json, README)
//   src/bun.ico                     icône de l'exécutable Windows (src/windows-app-info.rc)
//   scripts/aphrody/site/brand.ts   URL immuables /h/ de m3-tokens.css et aphrody-fonts.css, theme-color
//
//   bun scripts/aphrody/brand-sync.ts [--from <dossier assets/brand>] [--cdn https://cdn.aphrody.com] [--check]
// Sans --from, les fichiers viennent du manifeste du CDN (/s/manifest.json), sha256 vérifié. Avec --from, les URL /h/
// sont calculées du contenu local : le CDN doit déjà servir ces octets. --check n'écrit rien et sort en 1 si un
// fichier diffère ou si docs/logo contient un fichier hors de la marque.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

export const DEFAULT_CDN = "https://cdn.aphrody.com";
export const SITE_ROOT_FILES = [
  "favicon.ico",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "maskable-192.png",
  "maskable-512.png",
  "apple-touch-icon.png",
  "site.webmanifest",
] as const;
export const DOCS_LOGO_FILES = [...SITE_ROOT_FILES, "logo-wordmark-light.svg", "logo-wordmark-dark.svg"] as const;
const SOURCE_FILES = [...DOCS_LOGO_FILES, "m3-tokens.css", "aphrody-fonts.css", "m3-tokens.json"];

export type BrandFile = { bytes: Uint8Array; hashed: string };
export type Brand = Map<string, BrandFile>;

const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
/** Chemin content-addressed du CDN : `/h/<sha256[..16]><ext>` (scripts/tools/infra/cdn.ts). */
export const hashedPath = (name: string, bytes: Uint8Array) =>
  `/h/${sha256(bytes).slice(0, 16)}${extname(name).toLowerCase()}`;

export function fromDir(dir: string): Brand {
  const brand: Brand = new Map();
  for (const name of SOURCE_FILES) {
    const bytes = new Uint8Array(readFileSync(join(dir, name)));
    brand.set(name, { bytes, hashed: hashedPath(name, bytes) });
  }
  return brand;
}

export async function fromCdn(cdn = DEFAULT_CDN): Promise<Brand> {
  const res = await fetch(`${cdn}/s/manifest.json`);
  if (!res.ok) throw new Error(`${cdn}/s/manifest.json : HTTP ${res.status}`);
  const { files } = (await res.json()) as { files: Record<string, { sha256: string; hashed: string }> };
  const entries = await Promise.all(
    SOURCE_FILES.map(async name => {
      const entry = files[`aphrody/brand/${name}`];
      if (!entry) throw new Error(`aphrody/brand/${name} absent du manifeste de ${cdn}`);
      const file = await fetch(cdn + entry.hashed);
      if (!file.ok) throw new Error(`${cdn}${entry.hashed} : HTTP ${file.status}`);
      const bytes = await file.bytes();
      if (sha256(bytes) !== entry.sha256) throw new Error(`${cdn}${entry.hashed} : sha256 différent du manifeste`);
      return [name, { bytes, hashed: entry.hashed }] as const;
    }),
  );
  return new Map(entries);
}

function brandModule(brand: Brand, cdn: string): string {
  const get = (name: string) => brand.get(name)!;
  const tokens = JSON.parse(new TextDecoder().decode(get("m3-tokens.json").bytes)) as {
    seed: string;
    light: { surface: string };
    dark: { surface: string };
  };
  return `// Généré par scripts/aphrody/brand-sync.ts depuis la marque publiée sur ${cdn} : ne pas éditer.
// Thème M3 tonal-spot de la graine ${tokens.seed} (aphrody-identity), polices servies par le CDN.
export const BRAND = {
  tokensCss: "${cdn}${get("m3-tokens.css").hashed}",
  fontsCss: "${cdn}${get("aphrody-fonts.css").hashed}",
  themeColor: { light: "${tokens.light.surface}", dark: "${tokens.dark.surface}" },
} as const;

/** Fichiers de docs/logo servis à la racine du site. */
export const SITE_ROOT_FILES = [
${SITE_ROOT_FILES.map(name => `  "${name}",\n`).join("")}] as const;
`;
}

/** Contenu attendu de chaque fichier du dépôt, chemins relatifs à la racine. */
export function plan(brand: Brand, cdn = DEFAULT_CDN): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const name of DOCS_LOGO_FILES) out.set(`docs/logo/${name}`, brand.get(name)!.bytes);
  out.set("src/bun.ico", brand.get("favicon.ico")!.bytes);
  out.set("scripts/aphrody/site/brand.ts", new TextEncoder().encode(brandModule(brand, cdn)));
  return out;
}

export function sync(root: string, files: Map<string, Uint8Array>, { check = false } = {}) {
  const changed: string[] = [];
  for (const [path, bytes] of files) {
    const target = join(root, path);
    if (existsSync(target) && Buffer.from(readFileSync(target)).equals(bytes)) continue;
    changed.push(path);
    if (!check) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
  }
  const logo = join(root, "docs", "logo");
  const removed = existsSync(logo)
    ? readdirSync(logo)
        .filter(name => !(DOCS_LOGO_FILES as readonly string[]).includes(name))
        .map(name => `docs/logo/${name}`)
    : [];
  if (!check) for (const path of removed) rmSync(join(root, path), { recursive: true, force: true });
  return { changed, removed };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const option = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const cdn = (option("cdn") ?? DEFAULT_CDN).replace(/\/+$/, "");
  const from = option("from");
  const check = args.includes("--check");
  const brand = from ? fromDir(resolve(from)) : await fromCdn(cdn);
  const { changed, removed } = sync(resolve(import.meta.dir, "..", ".."), plan(brand, cdn), { check });
  for (const path of changed) console.log(`${check ? "diffère" : "écrit"}  ${path}`);
  for (const path of removed) console.log(`${check ? "en trop" : "retiré"}  ${path}`);
  if (!changed.length && !removed.length) console.log("marque à jour");
  if (check && (changed.length || removed.length)) process.exit(1);
}
