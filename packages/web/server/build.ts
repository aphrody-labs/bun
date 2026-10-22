// Builds the single self-hostable executable: the bun.aphrody.app site and every route are embedded.
//   bun packages/web/server/build.ts [--out <dir>] [--assets <built site>] [--target <bun-target>] [--origin <url>]
// Writes <out>/aphrody (aphrody.exe on Windows). Default out: ./build/aphrody-server.
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../..");

function arg(name: string) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

export function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [relative(base, full).replaceAll("\\", "/")];
  });
}

/** Source of the generated compile entry: one file import per site asset. */
export function entrySource(assetsDir: string, files: string[]) {
  const imports = files.map((f, i) => `import a${i} from ${JSON.stringify(join(assetsDir, f))} with { type: "file" };`);
  const map = files.map((f, i) => `  ${JSON.stringify(f)}: a${i},`);
  return `${imports.join("\n")}
import { main } from ${JSON.stringify(join(import.meta.dir, "main.ts"))};
main({
${map.join("\n")}
});
`;
}

if (import.meta.main) {
  const out = resolve(arg("--out") ?? "build/aphrody-server");
  const target = arg("--target");
  let assets = arg("--assets") ? resolve(arg("--assets")!) : join(out, "site");
  mkdirSync(out, { recursive: true });
  if (!arg("--assets")) {
    rmSync(assets, { recursive: true, force: true });
    const site = Bun.spawn({
      cmd: [
        process.execPath,
        join(repo, "packages/web/site/build.ts"),
        "--src",
        repo,
        "--out",
        assets,
        "--origin",
        arg("--origin") ?? "https://bun.aphrody.app",
      ],
      cwd: repo,
      stdio: ["ignore", "inherit", "inherit"],
    });
    if ((await site.exited) !== 0) throw new Error("site build failed");
  }
  const files = walk(assets).sort();
  if (!files.includes("index.html")) throw new Error(`${assets} is not a built site (index.html missing)`);
  const entry = join(out, "entry.gen.ts");
  await Bun.write(entry, entrySource(assets, files));
  const exe = join(out, process.platform === "win32" && !target?.includes("linux") ? "aphrody.exe" : "aphrody");
  const built = await Bun.build({
    entrypoints: [entry],
    compile: target ? { target: target as never, outfile: exe } : { outfile: exe },
    minify: true,
  });
  if (!built.success) throw new Error(built.logs.map(String).join("\n"));
  rmSync(entry);
  console.log(`${exe} (${files.length} embedded files)`);
}
