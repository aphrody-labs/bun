import { resolve, join, relative, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { migrateTables } from "./flatten-workspace";

/** One-time source migration. The existing workspace folder owns the actual manifest rewrite. */
const root = resolve(import.meta.dir, "../..");
const source = join(root, "src/media/filmcraft");
const sourceManifest = join(source, "Cargo.toml");
const text = await Bun.file(sourceManifest).text();
const nested = Bun.TOML.parse(text) as Record<string, any>;
if (!nested.workspace) throw new Error("FilmCraft is already folded or its source manifest is invalid");
const members: string[] = [];
for (const pattern of nested.workspace.members as string[]) {
  if (pattern.includes("*")) for await (const file of new Bun.Glob(`${pattern}/Cargo.toml`).scan({ cwd: source })) members.push(dirname(file));
  else members.push(pattern);
}
const crates = await Promise.all(members.sort().map(async path => {
  const manifest = Bun.TOML.parse(await Bun.file(join(source, path, "Cargo.toml")).text()) as Record<string, any>;
  return { component: manifest.package.name, path: `src/media/filmcraft/${path}`, type: path.startsWith("crates/") ? "library" : "application", sourceRepository: "https://github.com/aphrody-labs/filmcraft", revision: "9cfaa22b408a73b2b374dda0c81a6a1d06284f8b", cargoOwner: "Cargo.toml", bunOwner: "packages/bun-video", buildOwner: "vps factory", qualification: "pending", optional: true };
}));
const plan = { schema: "bun-filmcraft-absorption/v1", canonicalSource: "src/media/filmcraft", previousIntegrationRevision: "9b7893a2f67cb40832a4cd709f3ccfa7c96ce8e2", sourceRevision: crates[0]?.revision, members: crates };
console.log(JSON.stringify(plan, null, 2));
if (Bun.argv.includes("--apply")) {
  const rootFile = join(root, "Cargo.toml");
  const rootText = await Bun.file(rootFile).text();
  const parsed = Bun.TOML.parse(rootText) as Record<string, any>;
  if (parsed.profile?.filmcraft || parsed.profile?.["filmcraft-dev"]) throw new Error("Reconcile existing FilmCraft profiles before applying the migration");
  const profiles = [
    { key: ["profile", "filmcraft"], value: { ...nested.profile.release, inherits: "runtime", panic: "unwind" }, conflict: false },
    { key: ["profile", "filmcraft-dev"], value: { ...nested.profile.dev, inherits: "dev", panic: "unwind" }, conflict: false },
  ];
  await mkdir(join(source, "docs/bun-source"), { recursive: true });
  await Bun.write(join(source, "docs/bun-source/Cargo.toml.upstream"), text);
  await Bun.write(rootFile, migrateTables(rootText, profiles, source, root));
  const profileStart = text.search(/^\[profile\./m);
  if (profileStart < 0) throw new Error("Expected the inspected upstream profile declarations");
  await Bun.write(sourceManifest, text.slice(0, profileStart));
  const nativeManifest = join(root, "packages/bun-video/native/Cargo.toml");
  let native = await Bun.file(nativeManifest).text();
  for (const crate of crates.filter(crate => crate.type === "library")) {
    const expression = new RegExp(`(${crate.component} = \\{ )git = "https://github.com/aphrody-labs/filmcraft.git", rev = "[a-f0-9]+", `);
    native = native.replace(expression, `$1path = "${relative(dirname(nativeManifest), join(root, crate.path)).replaceAll("\\", "/")}", `);
  }
  if (native.includes('git = "https://github.com/aphrody-labs/filmcraft.git"')) throw new Error("An old FilmCraft Git dependency remains unresolved");
  await Bun.write(nativeManifest, native);
  await Bun.write(join(root, "docs/project/filmcraft-absorption.json"), JSON.stringify(plan, null, 2) + "\n");
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "flatten-workspace.ts"), source, "--heavy"], { cwd: root, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`FilmCraft fold needs reconciliation (exit ${code}); source checkpoints are preserved`);
}
