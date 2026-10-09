import { lstat, readlink } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { BunPython } from "./pyjs-store.ts";

export async function git(root: string, ...args: string[]) {
  await using proc = Bun.spawn({ cmd: ["git", "-C", root, ...args], stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  if (code !== 0) throw new Error(`git ${args[0]}: ${stderr}`);
  return args.includes("-z") ? stdout : stdout.trim();
}

export async function indexFiles(registry: BunPython, name: string, root: string) {
  const absolute = resolve(root);
  const revision = await git(absolute, "rev-parse", "HEAD");
  const repository = registry.repository(
    name,
    "source",
    absolute,
    revision,
    { dirty: await git(absolute, "status", "--porcelain=v1") },
    await git(absolute, "branch", "--show-current"),
  );
  const files = (await git(absolute, "ls-files", "--stage", "-z"))
    .split("\0")
    .filter(Boolean)
    .map(entry => {
      const tab = entry.indexOf("\t");
      const [mode, object, stage] = entry.slice(0, tab).split(" ");
      if (tab < 0 || stage !== "0") throw new Error(`Unmerged or malformed Git entry ${entry}`);
      return { path: entry.slice(tab + 1), mode, object };
    });
  const insert = registry.db.query(
    "INSERT INTO files VALUES(?,?,?,?,?,?,?) ON CONFLICT(repository_id,path) DO UPDATE SET sha256=excluded.sha256,language=excluded.language,bytes=excluded.bytes,metadata=excluded.metadata",
  );
  let indexed = 0;
  let missing = 0;
  for (let offset = 0; offset < files.length; offset += 32) {
    const rows = await Promise.all(
      files.slice(offset, offset + 32).map(async entry => {
        const { path, mode, object } = entry;
        const file = Bun.file(resolve(absolute, path));
        const hasher = new Bun.CryptoHasher("sha256");
        let size = 0;
        if (mode === "160000") {
          const bytes = new TextEncoder().encode(`gitlink:${object}`);
          size = bytes.length;
          hasher.update(bytes);
        } else {
          let info;
          try {
            info = await lstat(resolve(absolute, path));
          } catch (error) {
            if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
            missing++;
            return null;
          }
          if (info.isSymbolicLink()) {
            const bytes = new TextEncoder().encode(await readlink(resolve(absolute, path)));
            size = bytes.length;
            hasher.update(bytes);
          } else {
            for await (const chunk of file.stream()) {
              size += chunk.byteLength;
              hasher.update(chunk);
            }
          }
        }
        const hash = hasher.digest("hex");
        return {
          path,
          hash,
          bytes: size,
          language: mode === "160000" ? "gitlink" : extname(path).slice(1) || "text",
          mode,
          object,
        };
      }),
    );
    registry.db.transaction(() => {
      for (const row of rows) {
        if (!row) continue;
        insert.run(
          `${repository}:${row.path}`,
          repository,
          row.path,
          row.hash,
          row.language,
          row.bytes,
          JSON.stringify({ revision, gitMode: row.mode, gitObject: row.object }),
        );
        indexed++;
      }
    })();
  }
  const finishedRevision = await git(absolute, "rev-parse", "HEAD");
  registry.event("source-index", {
    repository,
    root: absolute,
    revision,
    finishedRevision,
    indexed,
    missing,
    stableRevision: revision === finishedRevision,
  });
  return { repository, revision, finishedRevision, indexed, missing };
}

export function indexCargo(
  registry: BunPython,
  repository: string,
  metadata: {
    packages: { id: string; name: string; version: string; manifest_path: string; [key: string]: unknown }[];
    resolve: { nodes: { id: string; deps: { pkg: string; name: string; [key: string]: unknown }[] }[] } | null;
    workspace_members: string[];
    workspace_root: string;
  },
) {
  const members = new Set(metadata.workspace_members);
  const sha256 = new Bun.CryptoHasher("sha256").update(JSON.stringify(metadata)).digest("hex");
  const namespace = `${repository}:cargo:${sha256}:`;
  const resolutions = new Map(metadata.resolve?.nodes.map(node => [node.id, node]) ?? []);
  const node = registry.db.query("INSERT OR REPLACE INTO nodes VALUES(?,?,?,?,?,?,?,?)");
  const edge = registry.db.query("INSERT OR REPLACE INTO edges VALUES(?,?,?,?,?,?,?,?)");
  registry.db.transaction(() => {
    for (const pkg of metadata.packages) {
      node.run(
        `${namespace}${pkg.id}`,
        repository,
        members.has(pkg.id) ? "workspace-crate" : "dependency-crate",
        `${pkg.name}@${pkg.version}`,
        relative(metadata.workspace_root, pkg.manifest_path).replaceAll("\\", "/"),
        1,
        "CARGO_METADATA",
        JSON.stringify({ ...pkg, resolution: resolutions.get(pkg.id) ?? null }),
      );
    }
    for (const source of metadata.resolve?.nodes ?? []) {
      for (const dependency of source.deps ?? []) {
        edge.run(
          `${namespace}${source.id}->${dependency.pkg}:${dependency.name}`,
          repository,
          `${namespace}${source.id}`,
          `${namespace}${dependency.pkg}`,
          "crate-dependency",
          "CARGO_METADATA",
          1,
          JSON.stringify(dependency),
        );
      }
    }
    registry.db.query("INSERT INTO graph_snapshots VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run(
      `${repository}:cargo:${sha256}`,
      repository,
      "cargo metadata",
      null,
      sha256,
      new Date().toISOString(),
      JSON.stringify({
        namespace,
        packages: metadata.packages.length,
        workspaceCrates: members.size,
        resolved: metadata.resolve !== null,
      }),
    );
  })();
  const resolved = metadata.resolve !== null;
  registry.event("cargo-index", {
    repository,
    packages: metadata.packages.length,
    workspaceCrates: members.size,
    resolved,
  });
  return { packages: metadata.packages.length, workspaceCrates: members.size, resolved };
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (char === "\n" && !quoted) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Unterminated CSV quote");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
