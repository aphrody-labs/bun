// SPDX-License-Identifier: Apache-2.0
import { manifests } from "bun:chromium";
import { mkdir, lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export function schemeColors(css: string) {
  const colors = new Map<string, [number, number, number]>();
  for (const match of css.matchAll(/--md-sys-color-([\w-]+):\s*#([a-fA-F0-9]{6})\s*;/g)) {
    if (colors.has(match[1]!)) throw new Error("Ambiguous M3 scheme colors");
    colors.set(
      match[1]!,
      [0, 2, 4].map(offset => Number.parseInt(match[2]!.slice(offset, offset + 2), 16)) as [number, number, number],
    );
  }
  const color = (role: string) => {
    const value = colors.get(role);
    if (!value) throw new Error(`Native M3 scheme missing ${role}`);
    return value;
  };
  return {
    frame: color("surface-container"),
    toolbar: color("surface"),
    tab_text: color("on-surface"),
    ntp_background: color("background"),
    ntp_text: color("on-background"),
    ntp_link: color("primary"),
    button_background: color("primary-container"),
  };
}
function chunk(name: string, data: Uint8Array) {
  const output = new Uint8Array(data.length + 12),
    view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  output.set(new TextEncoder().encode(name), 4);
  output.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of output.subarray(4, 8 + data.length)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(data.length + 8, (crc ^ 0xffffffff) >>> 0);
  return output;
}
export function iconPNG(size: number, background: readonly number[], foreground: readonly number[]) {
  if (![16, 32, 48, 128, 192, 512].includes(size)) throw new Error("Unsupported icon dimensions");
  const rows = new Uint8Array(size * (size * 4 + 1)),
    glyph = [14, 17, 17, 31, 17, 17, 17];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - size * 0.25) / (size * 0.1)),
        gy = Math.floor((y - size * 0.15) / (size * 0.1));
      const ink = gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && (glyph[gy]! >>> (4 - gx)) & 1;
      const color = ink ? foreground : background;
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      rows[offset] = color[0]!;
      rows[offset + 1] = color[1]!;
      rows[offset + 2] = color[2]!;
      rows[offset + 3] = 255;
    }
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header[8] = 8;
  header[9] = 6;
  return new Blob([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", Bun.deflateSync(rows, { library: "zlib", windowBits: 15 })),
    chunk("IEND", new Uint8Array()),
  ]);
}
export async function extensionIdentity(publicKey: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey) || publicKey.length > 8192)
    throw new Error("Valid public SPKI key required");
  const bytes = Uint8Array.from(atob(publicKey), letter => letter.charCodeAt(0));
  await crypto.subtle.importKey("spki", bytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  return new Bun.CryptoHasher("sha256")
    .update(bytes)
    .digest("hex")
    .slice(0, 32)
    .split("")
    .map(hex => String.fromCharCode(97 + parseInt(hex, 16)))
    .join("");
}
export async function generateChromeApp(options: {
  cssFile: string;
  cssSha256: string;
  outputRoot: string;
  publicKey: string;
}) {
  if (![options.cssFile, options.outputRoot].every(isAbsolute) || !/^[a-f0-9]{64}$/.test(options.cssSha256))
    throw new Error("Absolute paths and pinned native CSS required");
  const cssStat = await lstat(options.cssFile);
  if (!cssStat.isFile() || cssStat.isSymbolicLink() || cssStat.size > 512 * 1024)
    throw new Error("Invalid native CSS file");
  const css = await Bun.file(options.cssFile).text();
  if (new Bun.CryptoHasher("sha256").update(css).digest("hex") !== options.cssSha256)
    throw new Error("Native CSS SHA256 mismatch");
  const colors = schemeColors(css),
    id = await extensionIdentity(options.publicKey),
    files: Record<string, string> = {};
  const extension = join(options.outputRoot, "extension"),
    theme = join(options.outputRoot, "theme");
  await mkdir(join(extension, "icons"), { recursive: true });
  await mkdir(theme, { recursive: true });
  await mkdir(join(options.outputRoot, "icons"), { recursive: true });
  const write = async (path: string, data: string | Blob) => {
    await Bun.write(path, data);
    files[path] = new Bun.CryptoHasher("sha256").update(await Bun.file(path).bytes()).digest("hex");
  };
  for (const size of [16, 32, 48, 128, 192, 512]) {
    const image = iconPNG(size, colors.ntp_link, colors.ntp_background);
    await write(join(extension, "icons", `icon-${size}.png`), image);
    await write(join(options.outputRoot, "icons", `icon-${size}.png`), image);
  }
  await write(join(options.outputRoot, "favicon.png"), iconPNG(32, colors.ntp_link, colors.ntp_background));
  const icons = Object.fromEntries([16, 32, 48, 128].map(size => [size, `icons/icon-${size}.png`]));
  const manifest = manifests.createExtension({
    name: "Aphrody Chrome",
    version: "1.4.4",
    description: "Open Aphrody search and save selected browser data privately with Bun.",
    key: options.publicKey,
    icons,
    permissions: ["storage"],
    optional_permissions: ["bookmarks", "history", "tabs", "sessions", "nativeMessaging"],
    action: { default_popup: "popup.html", default_title: "Aphrody", default_icon: icons },
    background: { service_worker: "worker.js", type: "module" },
    chrome_url_overrides: { newtab: "newtab.html" },
    chrome_settings_overrides: {
      homepage: "https://aphrody.com",
      startup_pages: ["https://aphrody.com"],
      search_provider: {
        name: "Aphrody",
        keyword: "aphrody.com",
        search_url: "https://aphrody.com/?q={searchTerms}",
        favicon_url: "https://aphrody.com/favicon.png",
        encoding: "UTF-8",
        is_default: true,
      },
    },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" },
  });
  await write(join(extension, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await write(
    join(theme, "manifest.json"),
    JSON.stringify(manifests.createTheme({ name: "Aphrody native M3", version: "1.4.4", theme: { colors } }), null, 2) +
      "\n",
  );
  for (const name of ["popup", "worker"]) {
    const build = await Bun.build({
      entrypoints: [join(import.meta.dir, name + ".ts")],
      target: "browser",
      format: "esm",
      minify: false,
    });
    if (!build.success || build.outputs.length !== 1) throw new AggregateError(build.logs, "Extension build failed");
    await write(join(extension, name + ".js"), build.outputs[0]!);
  }
  const html = (page: string) =>
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aphrody</title><link rel="stylesheet" href="app.css"></head><body class="${page}"><main><h1>Aphrody</h1><form><label>Rechercher<input type="search" name="q" maxlength="1024" required></label><button>Rechercher</button></form><p><a href="https://aphrody.com" target="_blank" rel="noopener">Ouvrir Aphrody</a> · <a href="https://aphrody.com/auth/google/login" target="_blank" rel="noopener">Connexion Google</a></p><h2>Export privé vers Bun</h2><p>Archive locale uniquement. Les mots de passe et les connexions restent gérés par Chrome.</p><button type="button" data-export="bookmarks">500 favoris récents</button><button type="button" data-export="history">200 pages d’historique</button><button type="button" data-export="tabs">100 onglets</button><button type="button" data-export="sessions">25 sessions fermées</button><output aria-live="polite">Le pont Bun local doit être installé et autorisé. Google demande une configuration OAuth valide.</output></main><script type="module" src="popup.js"></script></body></html>`;
  await write(join(extension, "popup.html"), html("popup"));
  await write(join(extension, "newtab.html"), html("newtab"));
  await write(
    join(extension, "app.css"),
    css +
      "\nbody{margin:0;background:var(--md-sys-color-background);color:var(--md-sys-color-on-background);font:16px system-ui}body.popup{width:380px}main{padding:24px;max-width:720px;margin:auto}input,button{font:inherit;border-radius:20px;padding:12px;margin:6px;border:1px solid var(--md-sys-color-outline)}button{background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container)}a{color:var(--md-sys-color-primary)}output{display:block;padding-top:12px}label{display:block}",
  );
  const receipt = {
    schemaVersion: 1,
    extensionId: id,
    allowedOrigin: `chrome-extension://${id}/`,
    nativeHost: "com.bun.aphrody",
    cssSha256: options.cssSha256,
    files,
    qualified: false,
    installed: false,
  };
  await Bun.write(join(options.outputRoot, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}
if (import.meta.main) {
  const path = process.argv[2];
  if (!path || !isAbsolute(path)) throw new Error("Absolute generator config JSON path required");
  console.log(JSON.stringify(await generateChromeApp(await Bun.file(path).json()), null, 2));
}
