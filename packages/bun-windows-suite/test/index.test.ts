import { describe, expect, test } from "bun:test";
import { capabilityNames, parseCapabilities, sourceCheckouts } from "../src";

describe("Windows capability activation", () => {
  test("is opt-in", () => {
    expect(parseCapabilities("")).toEqual([]);
    expect(parseCapabilities("winrt,dotnet")).toEqual(["winrt", "dotnet"]);
    expect(parseCapabilities("all")).toEqual(capabilityNames);
  });

  test("rejects misspelled capabilities", () => {
    expect(() => parseCapabilities("winrt,wine")).toThrow("wine");
  });

  test("owns the pinned source checkout map", () => {
    expect(sourceCheckouts().terminal.pathname.replaceAll("\\", "/")).toEndWith("/vendor/windows-terminal/");
  });
});
