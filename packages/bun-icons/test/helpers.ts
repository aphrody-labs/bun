import { inflateSync } from "node:zlib";
import { crc32, encodePng } from "../src/png.ts";

export type Pixel = (x: number, y: number) => [number, number, number, number];

export function rgbaOf(width: number, height: number, pixel: Pixel): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(pixel(x, y), (y * width + x) * 4);
  return out;
}

/** A BMP icon entry (DIB header, palette, bottom-up XOR rows, AND mask), as Windows writes them. */
export function bmpEntry(
  width: number,
  height: number,
  bits: 1 | 4 | 8 | 24 | 32,
  pixel: Pixel,
  palette: [number, number, number][] = [],
): Uint8Array {
  const stride = Math.floor((width * bits + 31) / 32) * 4;
  const maskStride = Math.floor((width + 31) / 32) * 4;
  const out = new Uint8Array(40 + palette.length * 4 + stride * height + maskStride * height);
  const view = new DataView(out.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, width, true);
  view.setInt32(8, height * 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, bits, true);
  view.setUint32(32, palette.length, true);
  palette.forEach(([r, g, b], i) => out.set([b, g, r, 0], 40 + i * 4));
  const xor = 40 + palette.length * 4;
  const and = xor + stride * height;
  for (let y = 0; y < height; y++) {
    const row = xor + (height - 1 - y) * stride;
    const maskRow = and + (height - 1 - y) * maskStride;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      if (bits >= 24) {
        out.set(bits === 32 ? [b, g, r, a] : [b, g, r], row + x * (bits / 8));
      } else {
        const index = palette.findIndex(([pr, pg, pb]) => pr === r && pg === g && pb === b);
        if (index < 0) throw new Error(`colour ${r},${g},${b} not in palette`);
        const bit = x * bits;
        out[row + (bit >> 3)] |= index << (8 - bits - (bit & 7));
      }
      if (a === 0) out[maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

export interface FixtureEntry {
  width: number;
  height: number;
  bits: number;
  data: Uint8Array;
}

export function icoFile(entries: FixtureEntry[]): Uint8Array {
  const header = 6 + entries.length * 16;
  const out = new Uint8Array(header + entries.reduce((n, e) => n + e.data.length, 0));
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = header;
  entries.forEach((e, i) => {
    const at = 6 + i * 16;
    out[at] = e.width >= 256 ? 0 : e.width;
    out[at + 1] = e.height >= 256 ? 0 : e.height;
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, e.bits, true);
    view.setUint32(at + 8, e.data.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(e.data, offset);
    offset += e.data.length;
  });
  return out;
}

/** Decode a PNG written by `encodePng` (RGBA 8-bit, filter 0), checking every chunk CRC. */
export function decodeOwnPng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + length);
    if ((crc32(png.subarray(at + 4, at + 8 + length)) ^ 0xffffffff) >>> 0 !== view.getUint32(at + 8 + length)) {
      throw new Error(`bad CRC in ${type}`);
    }
    if (type === "IHDR") [width, height] = [view.getUint32(at + 8), view.getUint32(at + 12)];
    if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    if (raw[y * (width * 4 + 1)] !== 0) throw new Error("unexpected PNG filter");
    rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  }
  return { width, height, rgba };
}

/** The six-entry icon of the tests: 1, 4, 8, 24 and 32-bit BMPs and a 256 px PNG. */
export function sampleIco() {
  const pixels: Record<string, Pixel> = {
    b1: (x, y) => (x < 4 && y < 4 ? [0, 0, 0, 0] : (x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]),
    b4: (x, y) => [((x + y) % 16) * 16, 0, 255 - ((x + y) % 16) * 16, y === 23 ? 0 : 255],
    b8: x => [(x * 8) & 255, (x * 8) & 255, (x * 8) & 255, 255],
    b24: (x, y) => [x * 5, y * 5, 128, x === 0 ? 0 : 255],
    b32: (x, y) => [x * 4, 0, 255, y * 4],
    png: (x, y) => [x, y, 255 - x, 200],
  };
  const pal4 = Array.from({ length: 16 }, (_, i) => [i * 16, 0, 255 - i * 16] as [number, number, number]);
  const pal8 = Array.from({ length: 256 }, (_, i) => [i, i, i] as [number, number, number]);
  const entries: FixtureEntry[] = [
    {
      width: 16,
      height: 16,
      bits: 1,
      data: bmpEntry(16, 16, 1, pixels.b1, [
        [0, 0, 0],
        [255, 255, 255],
      ]),
    },
    { width: 24, height: 24, bits: 4, data: bmpEntry(24, 24, 4, pixels.b4, pal4) },
    { width: 32, height: 32, bits: 8, data: bmpEntry(32, 32, 8, pixels.b8, pal8) },
    { width: 48, height: 48, bits: 24, data: bmpEntry(48, 48, 24, pixels.b24) },
    { width: 64, height: 64, bits: 32, data: bmpEntry(64, 64, 32, pixels.b32) },
    { width: 256, height: 256, bits: 32, data: encodePng(256, 256, rgbaOf(256, 256, pixels.png)) },
  ];
  return { bytes: icoFile(entries), pixels };
}

export const SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M240-200h480v-360L480-740 240-560v360Z"/></svg>`;

/** A local CDN with the gstatic layout: `home` in every style and variant, everything else 404. */
export function fakeCdn() {
  const hits: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      hits.push(path);
      const m =
        /^\/s\/i\/short-term\/release\/materialsymbols(outlined|rounded|sharp)\/home\/[a-zN0-9]+\/\d+px\.svg$/.exec(
          path,
        );
      return m ? new Response(SVG.replace("<path", `<path data-variant="${path}"`)) : new Response("", { status: 404 });
    },
  });
  return { server, hits, origin: server.url.href };
}
