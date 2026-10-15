import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { publicSiteEntries } from "./build-aphrody";

test("public site bundles the canonical product catalog without the retired workspace owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "aphrody-site-owner-"));
  try {
    const entries = publicSiteEntries(root);
    const [entry, filename] = entries[1];
    expect(entry).toBe(join(root, "packages/infra/product/src/downloads/server.ts"));
    expect(filename).toBe("catalog.mjs");
    await mkdir(dirname(entry), { recursive: true });
    await Bun.write(entry, 'export const createHandler = () => () => new Response("canonical catalog");');
    const result = await Bun.build({ entrypoints: [entry], target: "bun", format: "esm" });
    expect(result.success).toBe(true);
    expect(result.outputs).toHaveLength(1);
    const output = join(root, filename);
    await Bun.write(output, result.outputs[0]!);
    const catalog = await import(output);
    expect(await catalog.createHandler()(new Request("http://localhost/")).text()).toBe("canonical catalog");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
