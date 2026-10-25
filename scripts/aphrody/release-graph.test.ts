import { expect, test } from "bun:test";
import { BunPython } from "bun:graph";
import { tempDir } from "../../test/harness";
import { join } from "node:path";
import { mkdirSync, statSync } from "node:fs";
import { Database } from "bun:sqlite";
import { GitTree } from "../../packages/bun-ui/packages/web/site/collect";
import { indexDetachedRelease, verifyReleaseCatalog, writeRelativeReferences } from "./release-graph";

test("an exported release graph keeps its revision when the ancestor checkout advances", async () => {
  using parent = tempDir("release-graph-parent", { "source.ts": "export const value = 1;\n" });
  const root = String(parent);
  const git = async (...args: string[]) => {
    const child = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
    const [output, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(error);
    return output.trim();
  };
  await git("init");
  await git("add", "source.ts");
  await git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const revision = await git("rev-parse", "HEAD");
  const snapshot = join(root, "build", "source");
  await Bun.write(join(snapshot, "src", "build", "owner.ts"), "export function answer() { return 42; }\n");
  await git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--allow-empty",
    "-m",
    "advanced",
  );
  expect(await git("rev-parse", "HEAD")).not.toBe(revision);
  using registry = new BunPython(join(root, "registry.sqlite"));
  const ceiling = process.env.GIT_CEILING_DIRECTORIES;
  const result = await indexDetachedRelease(registry, snapshot, revision, root);
  expect(result.revision).toBe(revision);
  expect(result.domains.map(domain => domain.domain)).toEqual(["src/build"]);
  expect(result.domains[0].coverage.nativeFiles).toBe(1);
  expect(process.env.GIT_CEILING_DIRECTORIES).toBe(ceiling);
  mkdirSync(join(snapshot, ".git"));
  await expect(indexDetachedRelease(registry, snapshot, revision, root)).rejects.toThrow("detached");
  expect(process.env.GIT_CEILING_DIRECTORIES).toBe(ceiling);
});

test("relative references commit bounded batches and release the WAL reader", () => {
  using directory = tempDir("release-links", {});
  const location = join(String(directory), "catalog.sqlite");
  using db = new Database(location);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE release_files(path TEXT PRIMARY KEY,content TEXT); CREATE TABLE release_links(source TEXT,target TEXT,kind TEXT,PRIMARY KEY(source,target,kind))",
  );
  const insert = db.prepare("INSERT INTO release_files VALUES(?,?)");
  const available = new Set<string>(["src/target.ts"]);
  db.transaction(() => {
    insert.run("src/target.ts", "export const target = 42;");
    for (let index = 0; index < 385; index++) {
      const path = "src/owner-" + String(index).padStart(3, "0") + ".ts";
      available.add(path);
      insert.run(path, "import { target } from './target'; import './absent'; export { target };");
    }
    insert.run("src/notes.md", "Documentation './target' is not an import.");
  })();
  writeRelativeReferences(db, available);
  expect(db.query("SELECT count(*) AS count FROM release_links").get()).toEqual({ count: 385 });
  expect(db.query("SELECT DISTINCT target,kind FROM release_links").all()).toEqual([
    { target: "src/target.ts", kind: "relative-reference" },
  ]);
  expect(statSync(location + "-wal").size).toBe(0);
  writeRelativeReferences(db, available);
  expect(db.query("SELECT count(*) AS count FROM release_links").get()).toEqual({ count: 385 });
});

test("resume validates all catalog identities and exported bytes against Git", async () => {
  using directory = tempDir("release-resume", {
    "src/owner.ts": "\uFEFFexport const value = 42;\n",
    "image.dat": "metadata-only",
  });
  const root = String(directory);
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  git("init");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const tree = new GitTree(root, "HEAD");
  const snapshot = join(root, "snapshot");
  const body = "\uFEFFexport const value = 42;\n";
  await Bun.write(join(snapshot, "src/owner.ts"), body);
  using db = new Database(":memory:");
  db.exec("CREATE TABLE release_files(path TEXT PRIMARY KEY,blob TEXT,domain TEXT,sha256 TEXT,content TEXT)");
  const hash = new Bun.CryptoHasher("sha256").update(body).digest("hex");
  db.prepare("INSERT INTO release_files VALUES(?,?,?,?,?)").run(
    "src/owner.ts",
    tree.files.get("src/owner.ts"),
    "src/owner.ts",
    hash,
    body,
  );
  await expect(verifyReleaseCatalog(db, tree, snapshot)).rejects.toThrow("Incomplete");
  db.prepare("INSERT INTO release_files VALUES(?,?,?,?,?)").run(
    "image.dat",
    tree.files.get("image.dat"),
    "root",
    null,
    null,
  );
  expect(await verifyReleaseCatalog(db, tree, snapshot)).toEqual({ readable: 1, excludedInvalidUtf8Files: 0 });
  expect(
    db
      .query<{ prefix: string }, []>(
        "SELECT substr(hex(content),1,6) AS prefix FROM release_files WHERE path='src/owner.ts'",
      )
      .get(),
  ).toEqual({ prefix: "EFBBBF" });
  db.exec("UPDATE release_files SET blob='forged' WHERE path='image.dat'");
  await expect(verifyReleaseCatalog(db, tree, snapshot)).rejects.toThrow("immutable Git source: image.dat");
  db.prepare("UPDATE release_files SET blob=? WHERE path='image.dat'").run(tree.files.get("image.dat"));
  await Bun.write(join(snapshot, "src/owner.ts"), "export const value = 0;\n");
  await expect(verifyReleaseCatalog(db, tree, snapshot)).rejects.toThrow("Detached source differs");
  await Bun.write(join(snapshot, "src/owner.ts"), body);
  await Bun.write(join(snapshot, "extra.ts"), "export const unexpected = true;");
  await expect(verifyReleaseCatalog(db, tree, snapshot)).rejects.toThrow("Unexpected file");
});
