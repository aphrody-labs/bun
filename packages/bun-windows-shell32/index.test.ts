import { describe, expect, test } from "bun:test";
import { ptr } from "bun:ffi";
import { enums, open, signatures, structs, wideAliases } from "./index";

describe("@aphrody/bun-windows-shell32", () => {
  test("expose les signatures Win32 générées sur toute plateforme", () => {
    expect(Object.keys(signatures).length).toBeGreaterThan(0);
    expect(typeof wideAliases).toBe("object");
    expect(Object.keys(structs).length + Object.keys(enums).length).toBeGreaterThan(0);
  });

  test.skipIf(process.platform !== "win32")("SHGetKnownFolderPath résout le Bureau", () => {
    const folder = new Uint8Array([0x3a, 0xcc, 0xbf, 0xb4, 0x2c, 0xdb, 0x4c, 0x42, 0xb0, 0x29, 0x7f, 0xe9, 0x9a, 0x87, 0xc6, 0x41]);
    const output = new BigUint64Array(1);
    const status = open()["shell32.dll"]!.symbols.SHGetKnownFolderPath(ptr(folder), 0, 0n, ptr(output));
    expect(status).toBe(0);
    expect(output[0]).not.toBe(0n);
  });
});
