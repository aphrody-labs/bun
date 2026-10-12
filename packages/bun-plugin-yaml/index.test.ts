import type { PluginBuilder } from "bun";
import { expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YamlPlugin from ".";

test("yaml loader - built-in, no plugin", async () => {
  const { default: mod } = await import("./data.yml");
  expect(mod.doe).toEqual("a deer, a female deer");
});

test("yaml loader", async () => {
  // Bun loads YAML natively, so count the plugin's onLoad calls to prove it handled the import.
  const plugin = YamlPlugin();
  let loads = 0;
  Bun.plugin({
    name: plugin.name,
    setup(builder) {
      const counting: PluginBuilder = Object.create(builder);
      counting.onLoad = (options, callback) =>
        builder.onLoad(options, args => {
          loads++;
          return callback(args);
        });
      return plugin.setup(counting);
    },
  });
  const dir = mkdtempSync(join(tmpdir(), "bun-plugin-yaml-"));
  try {
    const path = join(dir, "data.yml");
    copyFileSync(join(import.meta.dir, "data.yml"), path);
    const { default: mod } = await import(path);

    expect(mod.doe).toEqual("a deer, a female deer");
    expect(mod.ray).toEqual("a drop of golden sun");
    expect(mod.pi).toEqual(3.14159);
    expect(loads).toBe(1);
  } finally {
    Bun.plugin.clearAll();
    rmSync(dir, { recursive: true, force: true });
  }
});
