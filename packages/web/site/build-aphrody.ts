// SPDX-License-Identifier: Apache-2.0
import { resolve, join } from "node:path";
import { mkdir, cp } from "node:fs/promises";

export function publicSiteEntries(consumer: string) {
  return [
    [join(import.meta.dir, "aphrody.ts"), "server.mjs"],
    [join(resolve(consumer), "packages/infra/product/src/downloads/server.ts"), "catalog.mjs"],
  ] as const;
}

export async function buildAphrodySite() {
  const consumer = process.env.APHRODY_SITE_CONSUMER_ROOT;
  if (!consumer) throw new Error("Explicit APHRODY_SITE_CONSUMER_ROOT required");
  const output = resolve(process.env.APHRODY_SITE_OUTPUT || join(import.meta.dir, "../../../build/site-aphrody"));
  await mkdir(output, { recursive: true });
  for (const [entry, name] of publicSiteEntries(consumer)) {
    const result = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      format: "esm",
      minify: false,
    });
    if (!result.success) throw new AggregateError(result.logs, `Build failed: ${name}`);
    if (result.outputs.length !== 1) throw new Error("Unexpected public site output graph");
    await Bun.write(join(output, name), result.outputs[0]!);
  }
  await Bun.write(
    join(output, "google-public-theme.css"),
    Bun.file(join(import.meta.dir, "../../../packages/bun-m3/src/google-public-theme.css")),
  );
  console.log(output);
  const uiArtifact = process.env.APHRODY_SITE_UI_ARTIFACT;
  if (!uiArtifact) throw new Error("Fresh APHRODY_SITE_UI_ARTIFACT required");
  const uiRoot = join(output, "app-ui");
  await cp(resolve(uiArtifact), uiRoot, { recursive: true });
  const chromeArtifact = process.env.APHRODY_SITE_CHROME_ARTIFACT;
  if (!chromeArtifact) throw new Error("Qualified APHRODY_SITE_CHROME_ARTIFACT required");
  const chromeReceipt = await Bun.file(join(chromeArtifact, "receipt.json")).json();
  for (const [source, destination] of [
    ["favicon.png", "favicon.png"],
    ["icons/icon-512.png", "icon-512.png"],
  ] as const) {
    const path = join(resolve(chromeArtifact), source);
    const bytes = await Bun.file(path).bytes();
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    if (chromeReceipt.files[path] !== hash) throw new Error("Chrome public asset receipt mismatch");
    await Bun.write(join(uiRoot, destination), bytes);
  }
  const generator = Bun.spawn(["aphrody", "site", "--root", resolve(consumer), "catalog", "templates"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [templates, diagnostics, code] = await Promise.all([
    generator.stdout.text(),
    generator.stderr.text(),
    generator.exited,
  ]);
  if (code !== 0) throw new Error(`Native template catalog failed: ${diagnostics}`);
  if (!Array.isArray(JSON.parse(templates))) throw new Error("Native template catalog must be an array");
  await Bun.write(join(uiRoot, "public-templates.json"), templates);
  // The public release has no registered dynamic assets; fonts are static build outputs.
  await Bun.write(join(uiRoot, "public-assets-manifest.json"), "[]\n");
  const manifest: Record<string, { path: string; sha256: string }> = {};
  for (const [key, path] of [
    ["docsFile", "public-docs.json"],
    ["templatesFile", "public-templates.json"],
    ["assetsFile", "public-assets-manifest.json"],
  ] as const) {
    const bytes = await Bun.file(join(uiRoot, path)).bytes();
    manifest[key] = { path, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") };
  }
  await Bun.write(join(output, "public-catalog.json"), JSON.stringify(manifest, null, 2));
}

if (import.meta.main) await buildAphrodySite();
