import { expect, test } from "bun:test";
import { tempDir } from "harness";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stage } from "../../scripts/aphrody/publish-crates.ts";

test("staged crates are renamed but keep their library names", () => {
  using dir = tempDir("aphrody-crates", {});
  const out = String(dir);
  stage(out);

  const plugin = Bun.TOML.parse(readFileSync(join(out, "aphrody-bun-native-plugin", "Cargo.toml"), "utf8")) as any;
  expect(plugin.package.name).toBe("aphrody-bun-native-plugin");
  expect(plugin.package.repository).toBe("https://github.com/aphrody-labs/bun");
  expect(plugin.lib.name).toBe("bun_native_plugin");

  const macro = Bun.TOML.parse(readFileSync(join(out, "aphrody-bun-macro", "Cargo.toml"), "utf8")) as any;
  expect(macro.package.name).toBe("aphrody-bun-macro");
  expect(macro.lib).toEqual({ "proc-macro": true, name: "bun_macro" });
  expect(plugin.dependencies["bun-macro"]).toEqual({
    package: "aphrody-bun-macro",
    version: `=${macro.package.version}`,
    path: "../aphrody-bun-macro",
  });

  const readme = readFileSync(join(out, "aphrody-bun-native-plugin", "README.md"), "utf8");
  expect(readme).toContain("cargo add aphrody-bun-native-plugin");
  expect(readme).not.toContain("cargo add bun-native-plugin");

  const root = Bun.TOML.parse(readFileSync(join(out, "Cargo.toml"), "utf8")) as any;
  expect(root.workspace.members).toEqual(["aphrody-bun-macro", "aphrody-bun-native-plugin"]);
});
