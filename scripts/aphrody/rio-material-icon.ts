import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseIco } from "../../packages/bun-ui/packages/bun-icons/src/ico.ts";
import { pngSize } from "../../packages/bun-ui/packages/bun-icons/src/png.ts";

const material = process.argv.find(arg => arg.startsWith("--material="))?.slice(11);
if (!material) throw new Error("Pass --material=<Material workspace>");
const root = resolve(material);
const indexBytes = await Bun.file(join(root, "packages/m3-fonts/src/material-symbols-index.json")).arrayBuffer();
const index = JSON.parse(new TextDecoder().decode(indexBytes));
const name = index.icons.shell?.rounded ? "shell" : "terminal";
if (!index.icons[name]?.rounded) throw new Error("Material's catalogue has no Shell or Terminal symbol");
const { loadIcon, iconUrl } = await import(pathToFileURL(join(root, "packages/m3-bun/src/icons.ts")).href);
const request = { name, style: "rounded", fill: false, weight: 400 };
const symbol = await loadIcon(request, null);
const paths = [...symbol.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)];
const path = paths.length === 1 ? paths[0][1] : undefined;
const viewBox = symbol.match(/\bviewBox="([^"]+)"/)?.[1];
if (!path || !viewBox || !/^[\d\s.,+-]+$/.test(viewBox) || !/^[MmLlHhVvCcSsQqTtAaZz\d\s,.+\-eE]+$/.test(path))
  throw new Error("Expected a Material Symbol with a numeric viewBox and one vector path");
const themeBytes = await Bun.file(
  join(root, "packages/app-ui/src/generated/brand-theme-high-contrast.json"),
).arrayBuffer();
const theme = JSON.parse(new TextDecoder().decode(themeBytes));
if (
  theme.schema_version !== 1 ||
  theme.contrast_level !== 1 ||
  ![theme.dark.primaryContainer, theme.dark.onPrimaryContainer].every(color => /^#[\da-f]{6}$/i.test(color))
)
  throw new Error("Expected Material's native high-contrast brand ThemeExport");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect x="8" y="8" width="240" height="240" rx="48" fill="${theme.dark.primaryContainer}"/>
  <svg x="40" y="40" width="176" height="176" viewBox="${viewBox}">
    <path fill="${theme.dark.onPrimaryContainer}" d="${path}"/>
  </svg>
</svg>
`;
const assets = resolve(import.meta.dir, "../../src/rio/frontends/rioterm/src/router/resources/images");
const scratchRoot = resolve(tmpdir());
const scratch = await mkdtemp(join(scratchRoot, "rio-material-icon-"));
if (dirname(scratch) !== scratchRoot || !basename(scratch).startsWith("rio-material-icon-"))
  throw new Error("Icon generation scratch directory is outside its temporary root");
const hash = (bytes: string | ArrayBuffer | Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
try {
  const input = join(scratch, "rio-logo.svg");
  await Bun.write(input, svg);
  const tauri = Bun.which("tauri");
  if (!tauri) throw new Error("Material's SVG-to-ICO pipeline requires the native Tauri CLI on PATH");
  const run = Bun.spawnSync([tauri, "icon", input, "--output", join(scratch, "icons")], {
    windowsHide: true,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (run.exitCode !== 0) throw new Error(new TextDecoder().decode(run.stderr));
  const ico = new Uint8Array(await Bun.file(join(scratch, "icons/icon.ico")).arrayBuffer());
  const png = new Uint8Array(await Bun.file(join(scratch, "icons/128x128@2x.png")).arrayBuffer());
  const entries = parseIco(ico);
  if (![16, 32, 48, 256].every(size => entries.some(entry => entry.width === size && entry.height === size)))
    throw new Error("Generated ICO lacks native Windows small/taskbar/large resolutions");
  const size = pngSize(png);
  if (size?.width !== 256 || size.height !== 256) throw new Error("Runtime icon must be a 256x256 PNG");
  const version = Bun.spawnSync([tauri, "--version"], { stdout: "pipe", stderr: "pipe", windowsHide: true });
  if (version.exitCode !== 0) throw new Error("Could not identify the native Tauri rasterizer");
  const receipt = {
    symbol: name,
    codepoint: index.icons[name].rounded,
    style: "rounded",
    weight: 400,
    source: iconUrl(request),
    source_sha256: hash(symbol),
    catalogue_sha256: hash(indexBytes),
    license: "Apache-2.0",
    theme_sha256: hash(themeBytes),
    seed: theme.seed,
    contrast: theme.contrast_level,
    background: theme.dark.primaryContainer,
    foreground: theme.dark.onPrimaryContainer,
    rasterizer: new TextDecoder().decode(version.stdout).trim(),
    assets: { svg_sha256: hash(svg), ico_sha256: hash(ico), png_sha256: hash(png) },
    ico_entries: entries.map(({ width, height, bits, png }) => ({ width, height, bits, png })),
  };
  const outputs = [
    ["material-terminal.svg", symbol],
    ["rio-logo.svg", svg],
    ["rio-logo.ico", ico],
    ["rio-logo.png", png],
    ["rio-logo.json", JSON.stringify(receipt, null, 2) + "\n"],
  ] as const;
  if (process.argv.includes("--check")) {
    for (const [file, bytes] of outputs) {
      if (hash(await Bun.file(join(assets, file)).arrayBuffer()) !== hash(bytes))
        throw new Error(`Rio Material icon drift: ${file}`);
    }
  } else {
    for (const [file, bytes] of outputs) await Bun.write(join(assets, file), bytes);
  }
  console.log(`Rio Material ${name} icon ${process.argv.includes("--check") ? "verified" : "generated"}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
