import { join, resolve } from "node:path";

export const OMAR_REVISION = "d565a5a67d570e3648c091c351698781fb24bf54";
const root = resolve(import.meta.dir, "../..");
const vendor = join(root, "vendor/omar");
const receipt = join(root, "docs/project/omar-source-inventory.json");

const replacements: Record<string, string> = {
  "supervisor.ts": "packages/bun-supervisor/src/services.ts",
  "install-service.ts": "packages/bun-supervisor/src/windows-service-plan.ts",
  "prepare-service.ts": "packages/bun-supervisor/src/services.ts",
  "activate-service.ts": "packages/bun-supervisor/src/windows-service-plan.ts",
  "qualify-services.ts": "packages/bun-supervisor/src/services.ts",
  "integrate-services.ts": "packages/bun-supervisor/src/services.ts",
  "ntfs-index.ts": "packages/bun-tools/src/indexing/ntfs.ts",
  "ntfs-index-sync.ts": "packages/bun-tools/src/indexing/ntfs.ts",
  "ntfs-index-service.ts": "packages/bun-tools/src/task-service.ts",
  "ntfs-index-pe-paths.ts": "packages/bun-tools/src/indexing/pe.ts",
  "index-system32.ts": "packages/bun-tools/src/indexing/pe.ts",
  "tools/system32-pe-scan.ts": "packages/bun-tools/src/indexing/pe.ts",
  "tools/system32-pe-import.ts": "packages/bun-tools/src/indexing/pe.ts",
  "tools/system32-pe-import-graph.ts": "packages/bun-tools/src/indexing/pe.ts",
  "warmCache.ts": "packages/bun-tools/src/indexing/cache.ts",
  "warm-cache-service.ts": "packages/bun-tools/src/task-service.ts",
  "graph.ts": "src/js/bun/graph.ts",
  "source-graph-index.ts": "packages/bun-tools/src/indexing/graph.ts",
  "sync-index-resources.ts": "packages/bun-tools/src/indexing/resources.ts",
  "system-stream.ts": "packages/bun-tools/src/system-stream.ts",
  "japan-http-proxy.ts": "packages/bun-tools/src/connect-proxy.ts",
  "proxy-reconnect.ts": "packages/bun-supervisor/src/services.ts",
};

function ownerFor(source: string): { owner: string; disposition: string } {
  // The WebOS desktop app and its host scripts were removed from Bun; their Omar sources are history only.
  if (
    source.startsWith("server/apps/desktop/") ||
    /^server\/(configure-webos-origin|manifest-webos|probe-webos|probe-webos-origin|fix-nginx)\.ts$/.test(source)
  )
    return { owner: "docs/project/omar-integration.md", disposition: "removed-webos" };
  if (source.startsWith("server/apps/bun-plugin-tailwind/")) {
    return { owner: source.replace("server/apps/", "packages/"), disposition: "existing-owner" };
  }
  if (source.startsWith("server/")) {
    const path = source.slice(7);
    if (replacements[path]) return { owner: replacements[path]!, disposition: "generic-capability" };
    if (
      /^(config\/|nginx\/|services\.json$|runtime-features\.json$|start-beszel-agent\.ps1$|vps-client\.pub$)/.test(path)
    ) {
      return { owner: "docs/project/omar-integration.md", disposition: "historical-host-input" };
    }
    if (/^(tools\/(consolidate|retire|find|update-work)|find-omar-folders|dedupe-runtime-backups)/.test(path)) {
      return { owner: "src/vfs/lib.rs", disposition: "superseded-host-maintenance" };
    }
    const operations: Record<string, string> = {
      "build-runtime.ts": "scripts/build.ts",
      "check-bun-os-tree.ts": "scripts/aphrody/vendor-omar.ts",
      "install-runtime.ts": "scripts/aphrody/win/install.ts",
      "install-shell.ts": "scripts/aphrody/win/shell/prove.ts",
      "qualify-runtime.ts": "scripts/aphrody/verify-fusion.ts",
      "tools/package-runtime-release.ts": "scripts/aphrody/release-surfaces.ts",
      "configure-runtime-features.ts": "src/bun_core/feature_flags.rs",
      "audit-flags.ts": "src/bun_core/feature_flags.rs",
      "audit-windows-capabilities.ts": "src/js/bun/windows.ts",
      "windows-surface.ts": "src/js/bun/windows.ts",
      "status.ts": "src/js/bun/windows.ts",
      "inspect-tasks.ts": "src/js/bun/windows.ts",
      "ops.ts": "packages/bun-tools/src/cli.ts",
      "repair-a2a.ts": "packages/bun-supervisor/src/services.ts",
      "probe-server.ts": "packages/bun-supervisor/src/services.ts",
      "provision-redis.ts": "packages/bun-tools/src/indexing/cache.ts",
      "read-native-guidance.ts": "scripts/aphrody/agent-plugin.ts",
      "inventory-export.ts": "src/js/bun/windows.ts",
      "native-inventory.ts": "src/host/lib.rs",
      "discover-bun.ts": "scripts/aphrody/win/version-sync.ts",
      "bun-mcp-client.ts": "src/host/lib.rs",
      "mcp-server.ts": "scripts/aphrody/agent-plugin.ts",
      "apps/webos-source-manifest.json": "scripts/aphrody/vendor-omar.ts",
      "package.json": "packages/bun-tools/package.json",
    };
    if (operations[path]) return { owner: operations[path]!, disposition: "existing-native-workflow" };
    throw new Error(`Unmapped upstream source: ${source}`);
  }
  if (source.startsWith("codex/"))
    return { owner: "scripts/aphrody/agent-plugin.ts", disposition: "existing-plugin-owner" };
  return { owner: "docs/project/omar-integration.md", disposition: "historical-project-input" };
}

async function git(args: string[]) {
  const child = Bun.spawn(["git", `--git-dir=${join(root, ".git/modules/vendor/omar")}`, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  if (code) throw new Error(`Omar source inventory: ${stderr.trim()}`);
  return stdout;
}

export async function inventoryOmar() {
  if (!(await Bun.file(join(root, ".git/modules/vendor/omar/HEAD")).exists())) {
    const saved = (await Bun.file(receipt).json()) as Awaited<ReturnType<typeof inventoryFromGit>>;
    if (saved.schema !== "bun.vendor-source-inventory/v1" || saved.revision !== OMAR_REVISION || !saved.files.length)
      throw new Error("Invalid pinned source inventory");
    for (const file of saved.files) {
      if (file.source.startsWith("/") || file.source.split("/").includes(".."))
        throw new Error("Invalid inventory path");
      const bytes = await Bun.file(join(vendor, file.source)).bytes();
      if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== file.sha256)
        throw new Error(`Changed upstream source: ${file.source}`);
      const blob = new Bun.CryptoHasher("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
      if (blob !== file.gitBlob || !(await Bun.file(join(root, file.owner)).exists()))
        throw new Error(`Invalid upstream provenance: ${file.source}`);
    }
    return saved;
  }
  return inventoryFromGit();
}

async function inventoryFromGit() {
  const revision = (await git(["rev-parse", "HEAD"])).trim();
  if (revision !== OMAR_REVISION) throw new Error("Pinned Omar source differs");
  const entries = (await git(["ls-tree", "-r", "-z", OMAR_REVISION])).split("\0").filter(Boolean);
  const files: Array<{
    source: string;
    mode: string | undefined;
    gitBlob: string | undefined;
    sha256: string;
    bytes: number;
    owner: string;
    disposition: string;
    identicalToOwner: boolean;
  }> = [];
  for (const entry of entries) {
    const match = /^(\d+) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match) throw new Error(`Unsupported upstream entry: ${entry}`);
    const source = match[3]!;
    const mapping = ownerFor(source);
    const target = Bun.file(join(root, mapping.owner));
    if (!(await target.exists())) throw new Error(`Missing owner ${mapping.owner} for ${source}`);
    const bytes = await Bun.file(join(vendor, source)).bytes();
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const blob = new Bun.CryptoHasher("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (blob !== match[2]) throw new Error(`Changed upstream source: ${source}`);
    const same = sha256 === new Bun.CryptoHasher("sha256").update(await target.bytes()).digest("hex");
    files.push({
      source,
      mode: match[1],
      gitBlob: match[2],
      sha256,
      bytes: bytes.length,
      ...mapping,
      identicalToOwner: same,
    });
  }
  return {
    schema: "bun.vendor-source-inventory/v1",
    upstream: "https://github.com/aphrody-labs/omar",
    revision,
    upstreamLicenseFile: null,
    files,
  };
}

if (import.meta.main) {
  const inventory = await inventoryOmar();
  const json = JSON.stringify(inventory, null, 2) + "\n";
  if (Bun.argv.includes("--write")) await Bun.write(receipt, json);
  else if ((await Bun.file(receipt).text()) !== json)
    throw new Error("Source inventory differs; run vendor-omar.ts --write and review");
  console.log(JSON.stringify({ revision: inventory.revision, files: inventory.files.length, complete: true }));
}
