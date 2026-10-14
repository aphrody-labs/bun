import { buildSync } from "esbuild";
import { fileURLToPath } from "bun";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

process.chdir(dirname(import.meta.dirname));

buildSync({
  entryPoints: ["src/extension.ts", "src/web-extension.ts"],
  outdir: "dist",
  bundle: true,
  external: ["vscode"],
  platform: "node",
  format: "cjs",
  // The following settings are required to allow for extension debugging
  minify: false,
  sourcemap: true,
});

rmSync("extension", { recursive: true, force: true });
mkdirSync("extension", { recursive: true });
cpSync("dist", "extension/dist", { recursive: true });
cpSync("assets", "extension/assets", { recursive: true });
cpSync("README.md", "extension/README.md");
cpSync("LICENSE", "extension/LICENSE");
cpSync("package.json", "extension/package.json");

const packaging = Bun.spawn(
  [process.execPath, fileURLToPath(import.meta.resolve("@vscode/vsce/vsce")), "package", "--no-dependencies"],
  {
    cwd: "extension",
    stdout: "inherit",
    stderr: "inherit",
  },
);
const exitCode = await packaging.exited;
if (exitCode !== 0) throw new Error(`VS Code extension packaging exited with ${exitCode}`);
