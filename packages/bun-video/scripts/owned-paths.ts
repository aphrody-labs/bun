import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dir, "../../..");
const root = resolve(import.meta.dir, "..");
const paths = new Set<string>();
for (const name of ["remotion", "hyperframes"]) {
  const manifest = await Bun.file(resolve(root, name, "UPSTREAM.json")).json();
  const baseline = resolve(root, name, manifest.baseline ?? "../../../tmp/hyperframes-upstream");
  const git = Bun.spawnSync(["git", "-C", baseline, "ls-files", "-z"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (git.exitCode !== 0) throw new Error("Pinned baseline unavailable");
  const excluded = new Set<string>(
    name === "remotion"
      ? JSON.parse(readFileSync(resolve(root, name, ".aphrody/excluded-files.json"), "utf8")).map(
          (entry: { path: string }) => entry.path,
        )
      : [],
  );
  for (const path of git.stdout.toString().split("\0")) {
    if (path && !excluded.has(path) && existsSync(resolve(root, name, path)))
      paths.add(`packages/bun-video/${name}/${path}`);
  }
}
const extraPatterns = [
  "docs/*.md",
  "docs/*.json",
  "infra/*.md",
  "src/*.ts",
  "scripts/*.ts",
  "plugin/**/*.md",
  "plugin/**/*.json",
  "native/src/*.rs",
  "native/Cargo.toml",
  "native/Cargo.lock",
  "native/clippy.toml",
  "native/README.md",
  "video-benchmark/*.ts",
  "video-benchmark/*.json",
  "video-benchmark/*.md",
  "video-benchmark/bun.lock",
  "video-benchmark/.gitignore",
  "video-benchmark/.formatignore",
  "*.md",
  "package.json",
  ".gitignore",
  "remotion/UPSTREAM.json",
  "packages/remotion/.aphrody/*.ts",
  "packages/remotion/.aphrody/*.md",
  "packages/remotion/.aphrody/*.json",
  "packages/remotion/.aphrody/.oxfmtrc.json",
  "packages/remotion/.aphrody/build-deps/package.json",
  "packages/remotion/.aphrody/build-deps/bun.lock",
  "hyperframes/UPSTREAM.json",
  "hyperframes/aphrody/*.ts",
  "hyperframes/aphrody/*.json",
  "hyperframes/aphrody/*.txt",
];
for (const pattern of extraPatterns)
  for await (const path of new Bun.Glob(pattern).scan({ cwd: root }))
    paths.add(`packages/bun-video/${path.replaceAll("\\", "/")}`);
for await (const path of new Bun.Glob("**/*").scan({
  cwd: resolve(workspace, "packages/bun-video"),
  onlyFiles: true,
}))
  paths.add(`packages/bun-video/${path.replaceAll("\\", "/")}`);
for (const path of paths)
  if (
    /(?:^|\/)(?:node_modules|target|dist)(?:\/|$)|\.(?:exe|dll|node|log)$/.test(path) &&
    !path.startsWith("packages/bun-video/hyperframes/") &&
    !path.startsWith("packages/bun-video/remotion/packages/")
  )
    throw new Error(`Generated path rejected: ${path}`);
const output = resolve(workspace, "tmp/bun-video-owned-paths.txt");
await Bun.write(output, [...paths].sort().join("\n") + "\n");
console.log(JSON.stringify({ output, paths: paths.size }));
