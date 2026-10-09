import { expect, test } from "bun:test";
import { assetName, platformTag } from "../src/assets.ts";
import { toWslPath } from "../src/rsync.ts";

test("toWslPath convertit les chemins Windows seulement", () => {
  expect(toWslPath("C:\\Users\\a\\x")).toBe("/mnt/c/Users/a/x");
  expect(toWslPath("-avz")).toBe("-avz");
  expect(toWslPath("host:/srv")).toBe("host:/srv");
});

test("assetName suit la plateforme", () => {
  const t = platformTag();
  expect(assetName("rclone")).toBe(`rclone-${t}${t === "windows-x64" ? ".exe" : ""}`);
  expect(assetName("librclone")).toBe(`librclone-${t}${t === "windows-x64" ? ".dll" : ".so"}`);
});
