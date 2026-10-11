import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyRelease } from "./release-verify.ts";

export async function packageRelease(directory: string, archive: string) {
  const root = resolve(directory);
  const output = resolve(archive);
  const receipt = await verifyRelease(root);
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  const paths = ["manifest.json", ...Object.keys(manifest.artifacts)];
  for (const path of paths) {
    if (
      /[:\\\x00-\x1f\x7f]/.test(path) ||
      path.startsWith("/") ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    )
      throw new Error("Unsafe package path");
    if (resolve(root, path) === output)
      throw new Error("Archive would overwrite a release artifact");
  }
  const list = `${output}.files`;
  writeFileSync(list, `${paths.map((path) => `./${path}`).join("\n")}\n`, { flag: "wx" });
  try {
    const child = Bun.spawn(["tar", "-czf", output, "-C", root, "--no-recursion", "-T", list], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await child.exited) !== 0) throw new Error("Release packaging failed");
  } finally {
    rmSync(list);
  }
  return { ...receipt, archive: output };
}

if (import.meta.main) {
  const [directory, archive] = process.argv.slice(2);
  if (!directory || !archive)
    throw new Error("Usage: bun release-package.ts <verified-artifacts> <archive.tar.gz>");
  console.log(JSON.stringify(await packageRelease(directory, archive)));
}
