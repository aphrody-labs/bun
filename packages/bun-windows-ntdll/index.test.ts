import { describe, expect, test } from "bun:test";
import { enums, open, signatures, structs, wideAliases } from "./index";

describe("@aphrody/bun-windows-ntdll", () => {
  test("expose les signatures Win32 générées sur toute plateforme", () => {
    expect(Object.keys(signatures).length).toBeGreaterThan(0);
    expect(typeof wideAliases).toBe("object");
    expect(Object.keys(structs).length + Object.keys(enums).length).toBeGreaterThan(0);
  });


});
