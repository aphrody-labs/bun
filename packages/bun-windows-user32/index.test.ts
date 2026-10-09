import { describe, expect, test } from "bun:test";
import { enums, open, signatures, structs, wideAliases } from "./index";

describe("@aphrody/bun-windows-user32", () => {
  test("expose les signatures Win32 générées sur toute plateforme", () => {
    expect(Object.keys(signatures).length).toBeGreaterThan(0);
    expect(typeof wideAliases).toBe("object");
    expect(Object.keys(structs).length + Object.keys(enums).length).toBeGreaterThan(0);
  });

  test.skipIf(process.platform !== "win32")("GetSystemMetrics lit la largeur de l'écran", () => {
    expect(open()["user32.dll"]!.symbols.GetSystemMetrics(0)).toBeGreaterThan(0);
  });
  test("SYSTEM_METRICS_INDEX et RECT gardent l'ABI Win32 x64", () => {
    expect(enums.SYSTEM_METRICS_INDEX?.SM_CXSCREEN).toBe(0);
    expect(signatures["user32.dll"]?.GetSystemMetrics.args).toEqual(["Windows.Win32.UI.WindowsAndMessaging.SYSTEM_METRICS_INDEX"]);
    expect(structs.RECT?.size).toBe(16);
    expect(structs.RECT?.fields.map(field => field.offset)).toEqual([0, 4, 8, 12]);
  });
});
