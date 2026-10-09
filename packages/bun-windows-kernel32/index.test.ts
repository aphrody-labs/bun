import { describe, expect, test } from "bun:test";
import { enums, open, signatures, structs, wideAliases } from "./index";

describe("@aphrody/bun-windows-kernel32", () => {
  test("expose les signatures Win32 générées sur toute plateforme", () => {
    expect(Object.keys(signatures).length).toBeGreaterThan(0);
    expect(typeof wideAliases).toBe("object");
    expect(Object.keys(structs).length + Object.keys(enums).length).toBeGreaterThan(0);
  });

  test.skipIf(process.platform !== "win32")("GetCurrentProcessId renvoie un PID", () => {
    const process = open()["kernel32.dll"]!.symbols.GetCurrentProcessId();
    expect(process).toBeGreaterThan(0);
  });
  test("FILETIME garde sa taille ABI x64", () => {
    expect(structs.FILETIME?.size).toBe(8);
    expect(structs.FILETIME?.fields[1]?.offset).toBe(4);
  });
});
