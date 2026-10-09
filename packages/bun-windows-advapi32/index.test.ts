import { describe, expect, test } from "bun:test";
import { ptr } from "bun:ffi";
import { enums, open, signatures, structs, wideAliases } from "./index";

describe("@aphrody/bun-windows-advapi32", () => {
  test("expose les signatures Win32 générées sur toute plateforme", () => {
    expect(Object.keys(signatures).length).toBeGreaterThan(0);
    expect(typeof wideAliases).toBe("object");
    expect(Object.keys(structs).length + Object.keys(enums).length).toBeGreaterThan(0);
  });
  test("RegOpenKeyEx choisit W et garde la variante A", () => {
    expect(wideAliases.RegOpenKeyEx).toBe("RegOpenKeyExW");
    expect(signatures["advapi32.dll"]?.RegOpenKeyExA).toBeDefined();
    expect(signatures["advapi32.dll"]?.RegOpenKeyExW).toBeDefined();
  });
  test.skipIf(process.platform !== "win32")("RegOpenKeyExW ouvre HKCU Software", () => {
    const library = open()["advapi32.dll"]!.symbols;
    const path = new Uint16Array([83, 111, 102, 116, 119, 97, 114, 101, 0]);
    const output = new BigUint64Array(1);
    const status = library.RegOpenKeyExW(0x80000001n, ptr(path), 0, 0x20019, ptr(output));
    expect(status).toBe(0);
    expect(library.RegCloseKey(output[0]!)).toBe(0);
  });
});
