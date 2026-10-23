#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Writes the brand assets of the unified app into apps/desktop/public: the logo and favicon SVGs, PNG icons at every
 * size browsers and installers ask for, favicon.ico, the web app manifest and the social card. The SVG is the single
 * source; PNGs are rendered by Bun.WebView (Chrome backend) with a transparent background and the ICO container is
 * assembled here. Run `bun scripts/build-assets.ts` after changing the mark or the palette, and commit the output.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const out = resolve(import.meta.dir, "../public");
const icons = join(out, "icons");
await mkdir(icons, { recursive: true });

const BRAND = { surface: "#141218", primary: "#3186ff", onPrimary: "#001a41", accent: "#8b5cf6" };

/** The mark: an "A" whose counter is a play triangle, on a rounded tile. `pad` shrinks it into a maskable safe zone. */
const mark = (pad = 0) => {
  const scale = 1 - pad * 2;
  const shift = 32 * (1 - scale);
  return `<g transform="translate(${shift} ${shift}) scale(${scale})">
    <path fill="#fff" fill-rule="evenodd" d="M32 9.5c1.3 0 2.5.8 3 2L53 52.6a2.6 2.6 0 0 1-2.4 3.6h-5.2c-1.1 0-2-.6-2.4-1.6L39.8 47H24.2l-2.8 7.6c-.4 1-1.3 1.6-2.4 1.6h-5.2A2.6 2.6 0 0 1 11 52.600L29 11.500c.5-1.200 1.700-2 3-2zM28.600 29.500v11.400a1 1 0 0 0 1.500.9l9.300-5.700a1 1 0 0 0 0-1.700l-9.300-5.700a1 1 0 0 0-1.500.8z"/>
  </g>`;
};

const tile = (rx: number, pad = 0, background = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="8" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
      <stop stop-color="${BRAND.primary}"/>
      <stop offset="1" stop-color="${BRAND.accent}"/>
    </linearGradient>
  </defs>
  ${background ? `<rect width="64" height="64" rx="${rx}" fill="url(#g)"/>` : ""}
  ${mark(pad)}
</svg>
`;

const files = {
  "logo.svg": tile(14),
  "favicon.svg": tile(14),
  "maskable.svg": tile(0, 0.1),
} as const;
for (const [name, svg] of Object.entries(files)) await Bun.write(join(out, name), svg);

const page = (svg: string, size: number) =>
  `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)}`;

const view = new Bun.WebView({ backend: { type: "chrome" } } as ConstructorParameters<typeof Bun.WebView>[0]);
const png = async (url: string, width: number, height = width): Promise<Uint8Array> => {
  await view.resize(width, height);
  await view.navigate(url);
  return new Uint8Array(await ((await view.screenshot({ format: "png" })) as Blob).arrayBuffer());
};

try {
  await view.navigate("data:text/html,<title>assets</title>").catch(() => Bun.sleep(500).then(() => view.navigate("data:text/html,<title>assets</title>")));
  // Transparent corners: without this override the screenshot gets an opaque white page background.
  await view.cdp("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });

  const sizes: [string, number, string][] = [
    ["favicon-16.png", 16, files["favicon.svg"]],
    ["favicon-32.png", 32, files["favicon.svg"]],
    ["favicon-48.png", 48, files["favicon.svg"]],
    ["icons/icon-192.png", 192, files["logo.svg"]],
    ["icons/icon-512.png", 512, files["logo.svg"]],
    ["icons/maskable-512.png", 512, files["maskable.svg"]],
  ];
  const rendered = new Map<string, Uint8Array>();
  for (const [name, size, svg] of sizes) {
    const bytes = await png(page(svg, size), size);
    rendered.set(name, bytes);
    await Bun.write(join(out, name), bytes);
  }
  // iOS rounds the corners itself and fills transparency with black: ship a full-bleed tile.
  const touch = await png(page(tile(0), 180), 180);
  await Bun.write(join(out, "apple-touch-icon.png"), touch);

  // ICO: a directory of PNG images (16, 32, 48), supported since Windows Vista and by every browser.
  const entries = [16, 32, 48].map(size => ({ size, data: rendered.get(`favicon-${size}.png`)! }));
  const header = new DataView(new ArrayBuffer(6 + entries.length * 16));
  header.setUint16(2, 1, true);
  header.setUint16(4, entries.length, true);
  let offset = header.byteLength;
  entries.forEach(({ size, data }, index) => {
    const base = 6 + index * 16;
    header.setUint8(base, size);
    header.setUint8(base + 1, size);
    header.setUint16(base + 4, 1, true);
    header.setUint16(base + 6, 32, true);
    header.setUint32(base + 8, data.byteLength, true);
    header.setUint32(base + 12, offset, true);
    offset += data.byteLength;
  });
  await Bun.write(join(out, "favicon.ico"), Buffer.concat([Buffer.from(header.buffer), ...entries.map(entry => Buffer.from(entry.data))]));

  // Social card, 1200x630: opaque, so the transparent override must not leak into it.
  await view.cdp("Emulation.setDefaultBackgroundColorOverride", {});
  const card = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0}
    body{width:1200px;height:630px;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:56px;padding:0 96px;box-sizing:border-box;
      background:radial-gradient(900px 500px at 85% 10%, ${BRAND.accent}55, transparent 60%), radial-gradient(800px 500px at 0% 100%, ${BRAND.primary}44, transparent 60%), ${BRAND.surface};
      color:#e6e0e9;font-family:"Segoe UI",Roboto,system-ui,sans-serif}
    svg{width:240px;height:240px;filter:drop-shadow(0 18px 40px #0008)}
    h1{margin:0 0 18px;font-size:76px;line-height:1.05;font-weight:400;letter-spacing:-0.02em}
    p{margin:0;font-size:32px;line-height:1.35;color:#cac4d0}
    b{display:block;margin-bottom:22px;font-size:26px;letter-spacing:.18em;text-transform:uppercase;color:#a8c7ff;font-weight:600}
  </style>${files["logo.svg"]}<div><b>Aphrody</b><h1>Bun, de la vidéo native au bureau complet.</h1><p>Lecteur, studio, outils et Material 3 dans une seule application.</p></div>`;
  await Bun.write(join(out, "og.png"), await png(`data:text/html;charset=utf-8,${encodeURIComponent(card)}`, 1200, 630));
} finally {
  view.close();
}

const manifest = {
  name: "Aphrody — Bun, de la vidéo native au bureau complet",
  short_name: "Aphrody",
  description: "Lecteur, studio de montage, outils Bun Video, bureau WebOS et composants Material 3 dans une seule application.",
  id: "/",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "any",
  lang: "fr",
  dir: "ltr",
  background_color: BRAND.surface,
  theme_color: BRAND.surface,
  categories: ["entertainment", "multimedia", "developer"],
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  ],
  shortcuts: [
    { name: "Vidéo", url: "/video", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    { name: "Outils", url: "/tools", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    { name: "Bureau", url: "/os", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
  ],
};
await Bun.write(join(out, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);
await Bun.write(join(out, "robots.txt"), "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /media/\n");
console.log(`assets written to ${out}`);
