// Mirrors aphrody's crates/pkg/system (aphrody-pkg-system) into packages/aphrody-pkg-system.
// The crate is edited in the aphrody repository only; this copy is regenerated, never edited.
//
//   bun scripts/aphrody/sync-pkg-system.ts [aphrody checkout, default ../aphrody or $APHRODY_DIR]
import { $ } from "bun";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "..", "..");
const aphrody = resolve(process.argv[2] ?? process.env.APHRODY_DIR ?? join(repo, "..", "aphrody"));
const src = join(aphrody, "crates", "pkg", "system");
const dst = join(repo, "packages", "aphrody-pkg-system");

if (!(await Bun.file(join(src, "Cargo.toml")).exists())) {
  console.error(`aphrody-pkg-system not found at ${src}`);
  process.exit(1);
}
const rev = (await $`git -C ${aphrody} log -1 --format=%H -- crates/pkg/system`.text()).trim();
const dirty = (await $`git -C ${aphrody} status --porcelain -- crates/pkg/system`.text()).trim();
if (dirty) {
  console.error(`crates/pkg/system has uncommitted changes in ${aphrody}; commit them first:\n${dirty}`);
  process.exit(1);
}

await $`rm -rf ${join(dst, "src")}`;
const files = ["Cargo.toml", ...Array.from(new Bun.Glob("src/**/*.rs").scanSync({ cwd: src })).map(f => f.replaceAll("\\", "/")).sort()];
for (const f of files) await Bun.write(join(dst, f), Bun.file(join(src, f)));
await Bun.write(
  join(dst, "UPSTREAM"),
  `aphrody-labs/aphrody crates/pkg/system @ ${rev}\nRegenerate with: bun scripts/aphrody/sync-pkg-system.ts\n`,
);
console.log(`synced ${files.length} files from ${rev.slice(0, 10)}`);
