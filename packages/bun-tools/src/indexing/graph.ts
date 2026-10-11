import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { IndexOptions } from "bun:graph-index";
import { absolutePath, prepareDatabase } from "./common";

export interface SourceIndexOptions extends Omit<IndexOptions, "profile" | "artifactDirectory"> {
  dbPath: string;
  root: string;
  artifactRoot?: string;
  /** Labels the returned receipt and artifact folder; native repository identities remain unchanged. */
  namespace?: string;
}

/** Uses the native Bun src/packages domain contract; does not silently emulate unsupported surfaces or exclusions. */
export async function indexSources(options: SourceIndexOptions) {
  absolutePath("root", options.root);
  if (
    options.namespace !== undefined &&
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(options.namespace)
  )
    throw new TypeError("namespace must be a plain label");
  if (options.artifactRoot !== undefined) absolutePath("artifactRoot", options.artifactRoot);
  await prepareDatabase(options.dbPath);
  const [{ BunPython }, { indexCodebase }] = await Promise.all([
    import("bun:graph"),
    import("bun:graph-index"),
  ]);
  const { dbPath, root, artifactRoot, namespace, ...nativeOptions } = options;
  const artifactDirectory = artifactRoot
    ? namespace
      ? join(artifactRoot, namespace)
      : artifactRoot
    : undefined;
  if (artifactDirectory) await mkdir(artifactDirectory, { recursive: true });
  using registry = new BunPython(dbPath);
  const result = await indexCodebase(registry, root, {
    ...nativeOptions,
    profile: "bun",
    ...(artifactDirectory ? { artifactDirectory } : {}),
  });
  return { ...result, receiptNamespace: namespace ?? null };
}
