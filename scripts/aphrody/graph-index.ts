import { BunPython, registryPath } from "bun:graph";
import frontend from "../../src/js/bun/graph-index.ts";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

export const { indexCodebase } = frontend;

/** The source frontend and the executing native backend have separate identities. */
export async function graphIndexerProvenance() {
  const path = "src/js/bun/graph-index.ts";
  const bytes = await Bun.file(join(import.meta.dir, "../../", path)).bytes();
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const root = resolve(import.meta.dir, "../..");
  const receipt = Bun.file(join(root, "jit-frontend-inputs.json"));
  let sourceRevision: string;
  let dirty = false;
  if (await receipt.exists()) {
    const inputs = (await receipt.json()) as { source: string; files: { path: string; sha256: string }[] };
    sourceRevision = inputs.source;
    if (!/^[a-f0-9]{40}$/.test(sourceRevision) || inputs.files.find(file => file.path === path)?.sha256 !== sha256)
      throw new Error("Graph frontend does not match its JIT source manifest");
  } else {
    const head = Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    sourceRevision = head.stdout.toString().trim();
    if (head.exitCode !== 0 || !/^[a-f0-9]{40}$/.test(sourceRevision))
      throw new Error("Graph frontend Git identity is unavailable");
    const git = Bun.spawnSync(["git", "-C", root, "show", `${sourceRevision}:${path}`], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    if (git.exitCode !== 0) throw new Error("Graph frontend does not exist in its Git revision");
    dirty = new Bun.CryptoHasher("sha256").update(git.stdout).digest("hex") !== sha256;
  }
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(process.execPath).stream()) hasher.update(chunk);
  return {
    frontend: {
      sourceRevision,
      dirty,
      path,
      sha256,
      bytes: bytes.length,
    },
    nativeBackend: {
      version: Bun.version,
      revision: Bun.revision,
      sha256: hasher.digest("hex"),
      bytes: Bun.file(process.execPath).size,
    },
    changedBinaryQualified: false,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      root: { type: "string" },
      db: { type: "string", default: registryPath },
      profile: { type: "string", default: "bun" },
      domains: { type: "string", multiple: true },
      concurrency: { type: "string", default: "2" },
      "artifact-directory": { type: "string" },
      "git-repository": { type: "string" },
      "git-revision": { type: "string" },
      surfaces: { type: "string", multiple: true },
    },
    strict: true,
  });
  if (!values.root) throw new Error("Source indexing requires --root <checkout>");
  if (values.profile !== "bun") throw new Error("Bun source indexing uses profile bun");
  using registry = new BunPython(resolve(values.db));
  if (!!values["git-repository"] !== !!values["git-revision"])
    throw new Error("Pinned Git indexing requires both --git-repository and --git-revision");
  const { createGitIndexInput } = await import("./dataset/source.ts");
  await using git = values["git-repository"]
    ? await createGitIndexInput({
        repository: values["git-repository"] as "oven-sh/bun" | "aphrody-labs/bun",
        root: resolve(values.root),
        revision: values["git-revision"]!,
      })
    : null;
  const result = await indexCodebase(registry, resolve(values.root), {
    profile: "bun",
    concurrency: Number(values.concurrency),
    ...(git ? { input: git.input } : {}),
    ...(values.surfaces ? { surfaces: values.surfaces } : {}),
    ...(values.domains ? { domains: values.domains } : {}),
    ...(values["artifact-directory"] ? { artifactDirectory: resolve(values["artifact-directory"]) } : {}),
  });
  const indexer = await graphIndexerProvenance();
  if (indexer.nativeBackend.sha256 !== result.producerSHA256) throw new Error("Native graph producer identity changed");
  console.log(JSON.stringify({ ...result, indexer }));
}
