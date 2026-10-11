// SPDX-License-Identifier: Apache-2.0
const result = await Bun.build({
  entrypoints: [new URL("./index.html", import.meta.url).pathname],
  outdir: new URL("./dist/", import.meta.url).pathname,
  target: "browser",
  minify: true,
});

if (!result.success) {
  console.error(result.logs.map(String).join("\n"));
  process.exit(1);
}

for (const output of result.outputs) console.log(`${output.path} ${(output.size / 1024).toFixed(1)} KiB`);
