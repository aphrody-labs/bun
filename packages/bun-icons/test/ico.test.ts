import { describe, expect, test } from "bun:test";
import { bestEntry, decodeBmp, entryToPng, IcoError, isIco, parseIco, pngDataUrl } from "../src/ico.ts";
import { encodePng, isPng, pngSize } from "../src/png.ts";
import { bmpEntry, decodeOwnPng, icoFile, rgbaOf, sampleIco } from "./helpers.ts";

describe("parseIco", () => {
  test("reads every entry with its size, depth and kind", () => {
    const { bytes } = sampleIco();
    expect(isIco(bytes)).toBe(true);
    const entries = parseIco(bytes).map(({ width, height, bits, png }) => ({ width, height, bits, png }));
    expect(entries).toEqual([
      { width: 16, height: 16, bits: 1, png: false },
      { width: 24, height: 24, bits: 4, png: false },
      { width: 32, height: 32, bits: 8, png: false },
      { width: 48, height: 48, bits: 24, png: false },
      { width: 64, height: 64, bits: 32, png: false },
      { width: 256, height: 256, bits: 32, png: true },
    ]);
  });

  test("decodes 1, 4, 8, 24 and 32-bit BMP entries with their AND mask", () => {
    const { bytes, pixels } = sampleIco();
    const entries = parseIco(bytes);
    const expected = [pixels.b1, pixels.b4, pixels.b8, pixels.b24, pixels.b32];
    expected.forEach((pixel, i) => {
      const { width, height, rgba } = decodeBmp(entries[i]);
      expect({ width, height }).toEqual({ width: entries[i].width, height: entries[i].height });
      expect(rgba).toEqual(rgbaOf(width, height, pixel));
    });
  });

  test("32-bit entries without alpha fall back to the AND mask", () => {
    const data = bmpEntry(8, 8, 32, x => [x * 10, 20, 30, x < 2 ? 0 : 255]);
    for (let i = 0; i < 64; i++) data[40 + i * 4 + 3] = 0;
    const [entry] = parseIco(icoFile([{ width: 8, height: 8, bits: 32, data }]));
    expect(decodeBmp(entry).rgba).toEqual(rgbaOf(8, 8, x => [x * 10, 20, 30, x < 2 ? 0 : 255]));
  });

  test("bestEntry: smallest covering entry, deepest on ties, else the largest", () => {
    const entries = parseIco(sampleIco().bytes);
    expect([16, 17, 32, 33, 64, 100, 256, 300].map(px => bestEntry(entries, px))).toEqual([0, 1, 2, 3, 4, 5, 5, 5]);
    expect(bestEntry(entries)).toBe(5);
    expect(bestEntry([])).toBe(-1);
    const twins = parseIco(
      icoFile([
        { width: 32, height: 32, bits: 8, data: bmpEntry(32, 32, 8, () => [0, 0, 0, 255], [[0, 0, 0]]) },
        { width: 32, height: 32, bits: 32, data: bmpEntry(32, 32, 32, () => [0, 0, 0, 255]) },
        { width: 16, height: 16, bits: 32, data: bmpEntry(16, 16, 32, () => [0, 0, 0, 255]) },
      ]),
    );
    expect(bestEntry(twins, 24)).toBe(1);
    expect(bestEntry(twins, 8)).toBe(2);
    expect(bestEntry(twins)).toBe(1);
  });

  test("entryToPng: PNG entries as stored, BMP entries re-encoded losslessly", () => {
    const { bytes, pixels } = sampleIco();
    const entries = parseIco(bytes);
    expect(entryToPng(entries[5])).toBe(entries[5].data);
    const png = entryToPng(entries[4]);
    expect(isPng(png)).toBe(true);
    expect(pngSize(png)).toEqual({ width: 64, height: 64 });
    expect(decodeOwnPng(png).rgba).toEqual(rgbaOf(64, 64, pixels.b32));
    expect(pngDataUrl(png)).toStartWith("data:image/png;base64,iVBORw0KGgo");
  });

  test("malformed input throws IcoError, never a RangeError", () => {
    const { bytes } = sampleIco();
    const cases: Uint8Array[] = [
      new Uint8Array(),
      new Uint8Array([0, 0, 1, 0, 0, 0]),
      bytes.subarray(0, 40),
      bytes.subarray(0, bytes.length - 10),
    ];
    for (const c of cases) expect(() => parseIco(c)).toThrow(IcoError);

    const bad = (patch: (d: Uint8Array) => void) => {
      const data = bmpEntry(8, 8, 8, () => [0, 0, 0, 255], [[0, 0, 0]]);
      patch(data);
      return () => decodeBmp(parseIco(icoFile([{ width: 8, height: 8, bits: 8, data }]))[0]);
    };
    expect(bad(d => new DataView(d.buffer).setUint16(14, 16, true))).toThrow("16-bit BMP");
    expect(bad(d => new DataView(d.buffer).setUint32(16, 1, true))).toThrow("compressed BMP");
    expect(bad(d => new DataView(d.buffer).setInt32(4, 100000, true))).toThrow("out of range");
    expect(bad(d => new DataView(d.buffer).setUint32(32, 300, true))).toThrow("palette");
    expect(bad(d => d.fill(1, 44, 48))).toThrow("palette index");
    expect(() => decodeBmp(parseIco(sampleIco().bytes)[5])).toThrow(IcoError);
  });
});

describe("encodePng", () => {
  test("round-trips RGBA and rejects inconsistent sizes", () => {
    const rgba = rgbaOf(3, 2, (x, y) => [x * 80, y * 120, 7, 255 - x]);
    expect(decodeOwnPng(encodePng(3, 2, rgba))).toEqual({ width: 3, height: 2, rgba });
    expect(() => encodePng(3, 3, rgba)).toThrow(RangeError);
    expect(() => encodePng(0, 2, new Uint8Array())).toThrow(RangeError);
  });
});
