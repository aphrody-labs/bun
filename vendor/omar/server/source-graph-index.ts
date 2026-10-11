import { BunPython } from "bun:graph";
import { indexCodebase } from "bun:graph-index";
import { existsSync } from "node:fs";

const dbPath = "C:/SSH/omar/server/var/index/omar.sqlite";
const artifactRoot = "C:/SSH/omar/server/var/index/graph-artifacts";
const sources = {
  "omar-strict": {
    root: "C:/SSH/omar",
    surfaces: ["server", "codex"],
    excludePaths: [
      "server/var", "server/logs", "server/config", "server/nginx", "server/target",
      "server/bin", "server/node_modules", "server/apps/node_modules",
      "server/apps/bun-webos/dist", "server/apps/bun-webos/node_modules",
      "server/apps/bun-plugin-tailwind/node_modules", "server/apps/cache",
      "codex/state", "codex/.config", "codex/omar/references", "codex/private",
    ],
  },
  "bun-os": {
    root: "C:/bun",
    surfaces: ["src", "packages"],
    excludePaths: ["node_modules", "target", "build", "build-native-release"],
  },
  aphrody: {
    root: "C:/aphrody",
    surfaces: ["crates", "packages", "scripts", "tools"],
    excludePaths: ["target", "node_modules"],
  },
} as const;

function selectedSource(argv: string[]): keyof typeof sources {
  let value = "omar-strict";
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--source") value = argv[++index] ?? "";
    else if (arg.startsWith("--source=")) value = arg.slice("--source=".length);
    else throw new Error(`Option inconnue: ${arg}`);
  }
  if (!Object.hasOwn(sources, value)) throw new Error("--source doit être omar-strict, bun-os ou aphrody");
  return value as keyof typeof sources;
}

const namespace = selectedSource(process.argv.slice(2));
const source = sources[namespace];
if (!existsSync(source.root)) throw new Error(`Racine source absente: ${source.root}`);
const installation=await Bun.file("C:/SSH/omar/server/var/runtime-install.json").json().catch(()=>null);
if(installation?.schema!=="aphrody.bun-runtime-install/v1"||installation?.source?.commit!==Bun.revision){
  throw new Error("Indexation native par scope indisponible avant installation du runtime Bun qualifié correspondant à cette révision.");
}
const registry = new BunPython(dbPath);

try {
  const before = process.memoryUsage().rss;
  const result = await indexCodebase(registry, source.root, {
    profile: "bun",
    namespace,
    surfaces: [...source.surfaces],
    excludePaths: [...source.excludePaths],
    concurrency: 1,
    maxFiles: 100_000,
    maxReadBytes: 16 * 1024 * 1024,
    maxFileBytes: 1024 * 1024,
    maxAstDepth: 128,
    maxNodes: 250_000,
    maxEdges: 1_000_000,
    maxSnapshotBytes: 512 * 1024 * 1024,
    artifactDirectory: `${artifactRoot}/${namespace}`,
  });
  const totals = result.domains.reduce((sum, domain) => {
    for (const [key, value] of Object.entries(domain.coverage)) {
      if (typeof value === "number") sum[key] = (sum[key] ?? 0) + value;
    }
    sum.nodes = (sum.nodes ?? 0) + domain.nodes;
    sum.edges = (sum.edges ?? 0) + domain.edges;
    sum.domains = (sum.domains ?? 0) + 1;
    return sum;
  }, {} as Record<string, number>);
  const manifest = {
    phase: "source-graph-complete",
    namespace,
    root: result.root,
    profile: result.profile,
    surfaces: result.surfaces,
    excludedPaths: source.excludePaths,
    revision: result.revision,
    dirty: result.dirty,
    producerSHA256: result.producerSHA256,
    totals,
    domains: result.domains.map(({ domain, surface, repository, source, snapshot, sha256, inputSHA256, cached, nodes, edges, coverage, artifact }) =>
      ({ domain, surface, repository, source, snapshot, sha256, inputSHA256, cached, nodes, edges, coverage, artifact })),
    rss: { before, after: process.memoryUsage().rss },
  };
  await Bun.write(`${artifactRoot}/${namespace}-coverage.json`, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ phase: "source-graph-complete", namespace, revision: result.revision, dirty: result.dirty, totals, rss: manifest.rss }));
} finally {
  registry[Symbol.dispose]();
}
