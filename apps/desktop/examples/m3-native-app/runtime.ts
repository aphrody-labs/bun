// SPDX-License-Identifier: Apache-2.0
export async function build(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [new URL("./index.html", import.meta.url).pathname],
    outdir: new URL("./dist/", import.meta.url).pathname,
    target: "browser",
    minify: true,
  });
  if (!result.success) throw new AggregateError(result.logs, "Échec de la compilation de l’interface M3.");
}
