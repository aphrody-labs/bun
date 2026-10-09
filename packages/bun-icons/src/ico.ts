import { encodePng, isPng, pngSize } from "./png.ts";

export class IcoError extends Error {
  override name = "IcoError";
}

export interface IcoEntry {
  width: number;
  height: number;
  /** Bits per pixel: the directory's value, else the image header's. */
  bits: number;
  png: boolean;
  /** The entry's image: a whole PNG file, or a BMP without its file header (DIB + AND mask). */
  data: Uint8Array;
}

export interface Rgba {
  width: number;
  height: number;
  rgba: Uint8Array;
}

const MAX_SIDE = 4096;

/** `00 00 01 00` (icon) or `00 00 02 00` (cursor) followed by at least one entry. */
export function isIco(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0 &&
    bytes[1] === 0 &&
    (bytes[2] === 1 || bytes[2] === 2) &&
    bytes[3] === 0 &&
    (bytes[4] | (bytes[5] << 8)) > 0
  );
}

function pngBits(data: Uint8Array): number {
  if (data.length < 26) return 32;
  const depth = data[24];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[data[25]] ?? 4;
  return depth * channels;
}

/** Every entry of an ICO or CUR file, in directory order. */
export function parseIco(bytes: Uint8Array): IcoEntry[] {
  if (!isIco(bytes)) throw new IcoError("ICO: not an icon file (expected 00 00 01 00 and one entry or more)");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, true);
  if (6 + count * 16 > bytes.length) throw new IcoError(`ICO: directory of ${count} entries is truncated`);
  const entries: IcoEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const size = view.getUint32(at + 8, true);
    const offset = view.getUint32(at + 12, true);
    if (size === 0 || offset + size > bytes.length) {
      throw new IcoError(`ICO: entry ${i} points past the end of the file (${offset}+${size} > ${bytes.length})`);
    }
    const data = bytes.subarray(offset, offset + size);
    const png = isPng(data);
    let width = bytes[at] || 256;
    let height = bytes[at + 1] || 256;
    let bits = view.getUint16(at + 6, true);
    if (png) {
      const real = pngSize(data);
      if (!real) throw new IcoError(`ICO: entry ${i} has a truncated PNG header`);
      ({ width, height } = real);
      bits ||= pngBits(data);
    } else if (!bits && data.length >= 16) {
      bits = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(14, true);
    }
    entries.push({ width, height, bits, png, data });
  }
  return entries;
}

/**
 * Index of the entry to draw at `target` pixels: the smallest that covers it, else the largest;
 * between equal sizes, the deepest. Without a target, the largest. Same rule as the Rust loader
 * (`aphrody_identity::loader::meilleure_entree`).
 */
export function bestEntry(entries: readonly IcoEntry[], target?: number): number {
  if (entries.length === 0) return -1;
  const side = (e: IcoEntry) => Math.max(e.width, e.height);
  let best = -1;
  if (target !== undefined) {
    entries.forEach((e, i) => {
      if (side(e) < target) return;
      if (
        best < 0 ||
        side(e) < side(entries[best]) ||
        (side(e) === side(entries[best]) && e.bits > entries[best].bits)
      ) {
        best = i;
      }
    });
    if (best >= 0) return best;
  }
  entries.forEach((e, i) => {
    if (
      best < 0 ||
      side(e) > side(entries[best]) ||
      (side(e) === side(entries[best]) && e.bits >= entries[best].bits)
    ) {
      best = i;
    }
  });
  return best;
}

/** RGBA pixels of a BMP entry: 1, 4, 8, 24 and 32 bits, the AND mask applied. */
export function decodeBmp(entry: IcoEntry): Rgba {
  if (entry.png) throw new IcoError("ICO: decodeBmp on a PNG entry, use entry.data as is");
  const d = entry.data;
  if (d.length < 40) throw new IcoError(`ICO: BMP header truncated (${d.length} bytes)`);
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const headerSize = view.getUint32(0, true);
  const width = view.getInt32(4, true);
  const rawHeight = view.getInt32(8, true);
  const bits = view.getUint16(14, true);
  const compression = view.getUint32(16, true);
  const height = Math.floor(Math.abs(rawHeight) / 2);
  const topDown = rawHeight < 0;
  if (headerSize < 40 || headerSize > d.length) throw new IcoError(`ICO: BMP header size ${headerSize}`);
  if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE) {
    throw new IcoError(`ICO: BMP size ${width}x${height} out of range`);
  }
  if (![1, 4, 8, 24, 32].includes(bits)) throw new IcoError(`ICO: ${bits}-bit BMP is not supported`);
  if (compression !== 0 && !(compression === 3 && bits === 32)) {
    throw new IcoError(`ICO: compressed BMP (${compression}) is not supported`);
  }

  let at = headerSize + (compression === 3 && headerSize === 40 ? 12 : 0);
  let palette: Uint8Array | undefined;
  if (bits <= 8) {
    const colors = view.getUint32(32, true) || 1 << bits;
    if (colors > 1 << bits || at + colors * 4 > d.length) throw new IcoError("ICO: BMP palette truncated");
    palette = d.subarray(at, at + colors * 4);
    at += colors * 4;
  }
  const stride = Math.floor((width * bits + 31) / 32) * 4;
  const maskStride = Math.floor((width + 31) / 32) * 4;
  const xor = at;
  const and = xor + stride * height;
  if (and > d.length) throw new IcoError("ICO: BMP pixels truncated");
  const hasMask = and + maskStride * height <= d.length;

  const rgba = new Uint8Array(width * height * 4);
  let alphaSeen = false;
  for (let y = 0; y < height; y++) {
    const row = xor + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let b: number,
        g: number,
        r: number,
        a = 255;
      if (bits === 32 || bits === 24) {
        const p = row + x * (bits / 8);
        [b, g, r] = [d[p], d[p + 1], d[p + 2]];
        if (bits === 32) {
          a = d[p + 3];
          if (a) alphaSeen = true;
        }
      } else {
        const bit = x * bits;
        const index = (d[row + (bit >> 3)] >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
        if (!palette || index * 4 + 3 > palette.length) throw new IcoError(`ICO: palette index ${index} out of range`);
        [b, g, r] = [palette[index * 4], palette[index * 4 + 1], palette[index * 4 + 2]];
      }
      rgba.set([r, g, b, a], o);
    }
  }
  if (hasMask && (bits !== 32 || !alphaSeen)) {
    for (let y = 0; y < height; y++) {
      const row = and + (topDown ? y : height - 1 - y) * maskStride;
      for (let x = 0; x < width; x++) {
        const transparent = (d[row + (x >> 3)] >> (7 - (x & 7))) & 1;
        rgba[(y * width + x) * 4 + 3] = transparent ? 0 : 255;
      }
    }
  }
  return { width, height, rgba };
}

/** The entry as a PNG file: PNG entries as stored, BMP entries decoded and encoded. */
export function entryToPng(entry: IcoEntry): Uint8Array {
  if (entry.png) return entry.data;
  const { width, height, rgba } = decodeBmp(entry);
  return encodePng(width, height, rgba);
}

export function pngDataUrl(png: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(png.buffer, png.byteOffset, png.byteLength).toString("base64")}`;
}
