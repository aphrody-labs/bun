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

test("vendor fork manifests retain library imports and dependency aliases", async () => {
  const { rewriteManifest, stringifyManifest } = await import("../../scripts/aphrody/publish-vendors.ts");
  const names = new Map([
    ["upstream", "aphrody-bun-upstream"],
    ["dep", "aphrody-bun-dep"],
  ]);
  const source = {
    package: { name: "upstream", version: "1.0.0" },
    dependencies: { alias: { package: "dep", version: "2.0.0" }, inherited: { workspace: true } },
    workspace: { dependencies: { dep: "2.0.0" } },
    target: { "cfg(windows)": { dependencies: { dep: { version: "2.0.0" } } } },
  };
  const rewritten = rewriteManifest(source, names, true);
  expect(rewritten.package.name).toBe("aphrody-bun-upstream");
  expect(rewritten.lib.name).toBe("upstream");
  expect(rewritten.dependencies.alias.package).toBe("aphrody-bun-dep");
  expect(rewritten.dependencies.inherited).toEqual({ workspace: true });
  expect(rewritten.workspace.dependencies.dep).toEqual({ version: "2.0.0", package: "aphrody-bun-dep" });
  expect(rewritten.target["cfg(windows)"].dependencies.dep.package).toBe("aphrody-bun-dep");
  expect(Bun.TOML.parse(stringifyManifest(rewritten))).toEqual(rewritten);
  expect(source.package.name).toBe("upstream");
  expect(rewriteManifest(source, names).lib).toBeUndefined();
});

test("vendor publication orders aliases and rejects dependency cycles", async () => {
  const { dependencyOrder } = await import("../../scripts/aphrody/publish-vendors.ts");
  const product = (original: string, dependencies: string[]) => ({
    original,
    name: `aphrody-bun-${original}`,
    version: "1.0.0",
    manifest: "Cargo.toml",
    dependencies,
  });
  expect(dependencyOrder([product("parent", ["leaf"]), product("leaf", [])]).map(p => p.original)).toEqual([
    "leaf",
    "parent",
  ]);
  expect(() => dependencyOrder([product("a", ["b"]), product("b", ["a"])])).toThrow("dependency cycle");
});
