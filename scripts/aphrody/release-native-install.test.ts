import { expect, test } from "bun:test";
import { join } from "node:path";
import { mkdir, readlink, symlink } from "node:fs/promises";
import { tempDir } from "../../test/harness";
import {
  applyQualifiedRuntimeInstall,
  planQualifiedRuntimeInstall,
  qualifiedBundleMembers,
  qualifiedInstallPlanSHA256,
  windowsBundlePathSnapshot,
} from "./release-native-install";
import { fullNativeRuntimeFeatures, runtimeFlavorManifest } from "./release-matrix";
import { mediaReleaseTarget } from "./media-release";
import { runtimeFullAsset, runtimeFullComponents, runtimeFullGates } from "./release-aggregation";
import sdkManifest from "../../packages/bun-video/src/sdk-manifest.json";
const hash = (bytes: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const source = "a".repeat(40),
  version = "1.4.4",
  triplet = "bun-linux-x64-full";

// Explicit ZIP wire fixtures keep validation independent of the installed Archive writer's feature set.
function zip(payload: Record<string, string>, mode = 0o100644) {
  const locals: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  const crc = (bytes: Uint8Array) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
    return ~value >>> 0;
  };
  for (const [path, text] of Object.entries(payload)) {
    const name = new TextEncoder().encode(path),
      bytes = new TextEncoder().encode(text),
      local = new Uint8Array(30 + name.length + bytes.length),
      l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint32(14, crc(bytes), true);
    l.setUint32(18, bytes.length, true);
    l.setUint32(22, bytes.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(bytes, 30 + name.length);
    locals.push(local);
    const entry = new Uint8Array(46 + name.length),
      d = new DataView(entry.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 0x0314, true);
    d.setUint16(6, 20, true);
    d.setUint32(16, crc(bytes), true);
    d.setUint32(20, bytes.length, true);
    d.setUint32(24, bytes.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(38, (mode << 16) >>> 0, true);
    d.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);
    offset += local.length;
  }
  const size = central.reduce((sum, entry) => sum + entry.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let cursor = 0;
  for (const part of [...locals, ...central, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}
async function fixture(root: string, options: { missingFlavor?: boolean } = {}) {
  const directory = join(root, "artifacts"),
    installRoot = join(root, "runtime-prefix"),
    aliasDirectory = join(root, "bin");
  await mkdir(directory);
  const media = "lib/media/ffmpeg/linux-x64/bin/ffmpeg",
    mpv = "lib/media/mpv/linux-x64/bin/mpv";
  const payload: Record<string, string> = {
    bun: "fixture executable",
    [media]: "fixture ffmpeg",
    [mpv]: "fixture mpv",
  };
  payload["bun-media.json"] = JSON.stringify({
    schemaVersion: 2,
    target: "linux-x64",
    files: [media, mpv].map(name => ({ name, sha256: hash(payload[name]!), bytes: payload[name]!.length })),
  });
  if (!options.missingFlavor)
    payload["release-flavor.json"] = JSON.stringify(runtimeFlavorManifest(mediaReleaseTarget("linux-x64"), source));
  const files = Object.fromEntries(
    Object.entries(payload).map(([name, value]) => [
      name,
      { sha256: hash(value), bytes: value.length, mode: name === "bun" ? 0o755 : 0o644 },
    ]),
  );
  const asset = runtimeFullAsset("linux-x64"),
    sdk = sdkManifest.targets["linux-x64"];
  const manifest = {
    schema: 1,
    kind: "bun-runtime-full-release",
    source,
    version,
    target: "linux-x64",
    triplet,
    native: true,
    passed: true,
    execution: "native",
    platform: "linux",
    arch: "x64",
    provenance: {
      version,
      revision: source,
      platform: "linux",
      arch: "x64",
      sourceUrl: `https://github.com/aphrody-labs/bun/releases/download/bun-v${version}/${triplet}.zip`,
    },
    compiledFeatures: fullNativeRuntimeFeatures,
    components: runtimeFullComponents,
    allComponentsQualified: false,
    runtimeSHA256: files.bun!.sha256,
    sdkSources: { ffmpeg: sdk.ffmpeg.sourceRevision, mpv: sdk.mpv.sourceRevision },
    files,
  };
  payload["bun-runtime-full-release.json"] = JSON.stringify(manifest);
  const bytes = zip(Object.fromEntries(Object.entries(payload).map(([name, value]) => [triplet + "/" + name, value])));
  const gates = [];
  for (const id of runtimeFullGates) {
    const log = `${asset}-${id}.log`,
      body = `synthetic validator ${id}`;
    await Bun.write(join(directory, log), body);
    gates.push({ id, passed: true, log, sha256: hash(body) });
  }
  await Bun.write(join(directory, asset + ".zip"), bytes);
  await Bun.write(
    join(directory, asset + ".qualification.json"),
    JSON.stringify({ ...manifest, gates, archive: { name: asset + ".zip", sha256: hash(bytes), bytes: bytes.length } }),
  );
  const input = {
    directory,
    source,
    version,
    target: "linux-x64",
    component: "runtime-full" as const,
    root: installRoot,
    aliasDirectory,
    hostname: "fixture-host",
  };
  return { input, bytes, payload };
}
const ports = (probe = async () => {}) => ({ hostname: () => "fixture-host", hostTarget: () => "linux-x64", probe });

test("qualified runtime plan binds its entire real ZIP closure and stays distinct from media-full", async () => {
  using dir = tempDir("bundle-plan", {});
  const { input, payload } = await fixture(String(dir));
  const plan = await planQualifiedRuntimeInstall(input);
  expect(plan.allComponentsQualified).toBe(false);
  expect(plan.component).toBe("runtime-full");
  expect(Object.keys(plan.files).sort()).toEqual(Object.keys(payload).sort());
  expect(plan.files["lib/media/ffmpeg/linux-x64/bin/ffmpeg"]!.sha256).toBe(hash("fixture ffmpeg"));
  await expect(planQualifiedRuntimeInstall({ ...input, component: "media-full" })).rejects.toThrow();
});
test("full installer rejects the missing compiled flavor manifest before writing installation paths", async () => {
  using dir = tempDir("bundle-flavor", {});
  const { input } = await fixture(String(dir), { missingFlavor: true });
  await expect(planQualifiedRuntimeInstall(input)).rejects.toThrow("compiled feature manifest");
  expect(await Bun.file(join(input.root, "bun")).exists()).toBe(false);
});
for (const [name, payload, mode] of [
  ["symlink", { [triplet + "/bun"]: "fixture" }, 0o120777],
  ["private", { [triplet + "/.git/config"]: "fixture" }, 0o100644],
  ["case collision", { [triplet + "/bun"]: "first", [triplet + "/BUN"]: "second" }, 0o100644],
  ["path traversal", { [triplet + "/../escape"]: "fixture" }, 0o100644],
  ["Windows reserved path", { [triplet + "/aux.dll"]: "fixture" }, 0o100644],
] as const)
  test(`bundle rejects ${name} before decoding or writing files`, async () => {
    await expect(qualifiedBundleMembers(zip(payload, mode), triplet)).rejects.toThrow();
  });

test.skipIf(process.platform === "win32")(
  "versioned activation installs all library bytes and both managed aliases",
  async () => {
    using dir = tempDir("bundle-activate", {});
    const { input } = await fixture(String(dir));
    const plan = await planQualifiedRuntimeInstall(input);
    let probes = 0;
    const result = await applyQualifiedRuntimeInstall(
      plan,
      qualifiedInstallPlanSHA256(plan),
      ports(async () => {
        probes++;
      }),
    );
    expect(probes).toBe(3);
    expect(result.component).toBe("runtime-full");
    expect(await readlink(join(input.root, "current"))).toBe(plan.release);
    expect(await Bun.file(join(input.aliasDirectory, "bun")).text()).toBe("fixture executable");
    expect(await Bun.file(join(result.release, "lib/media/mpv/linux-x64/bin/mpv")).text()).toBe("fixture mpv");
    expect(await readlink(join(input.aliasDirectory, "bunx"))).toBe(join(input.root, "current", "bun"));
  },
);
test.skipIf(process.platform === "win32")(
  "failed post-activation probe restores prior aliases and current bundle",
  async () => {
    using dir = tempDir("bundle-rollback", {});
    const { input } = await fixture(String(dir));
    await mkdir(join(input.root, "old"), { recursive: true });
    await Bun.write(join(input.root, "old", "bun"), "prior runtime");
    await symlink("old", join(input.root, "current"));
    await mkdir(input.aliasDirectory);
    await symlink(join(input.root, "old", "bun"), join(input.aliasDirectory, "bun"));
    const plan = await planQualifiedRuntimeInstall(input);
    let probes = 0;
    await expect(
      applyQualifiedRuntimeInstall(
        plan,
        qualifiedInstallPlanSHA256(plan),
        ports(async () => {
          if (++probes === 3) throw new Error("injected post-activation failure");
        }),
      ),
    ).rejects.toThrow("injected post-activation");
    expect(await readlink(join(input.root, "current"))).toBe("old");
    expect(await Bun.file(join(input.aliasDirectory, "bun")).text()).toBe("prior runtime");
    expect(await Bun.file(join(input.aliasDirectory, "bunx")).exists()).toBe(false);
  },
);
test.skipIf(process.platform === "win32")(
  "changed aliases and source-checkout destinations remain untouched",
  async () => {
    using dir = tempDir("bundle-guard", {});
    const { input } = await fixture(String(dir));
    const plan = await planQualifiedRuntimeInstall(input);
    await mkdir(input.aliasDirectory);
    await symlink("concurrent-owner", join(input.aliasDirectory, "bun"));
    await expect(applyQualifiedRuntimeInstall(plan, qualifiedInstallPlanSHA256(plan), ports())).rejects.toThrow(
      "alias changed",
    );
    expect(await readlink(join(input.aliasDirectory, "bun"))).toBe("concurrent-owner");
    const nested = { ...plan, root: join(String(dir), "source") };
    await mkdir(join(nested.root, ".git"), { recursive: true });
    await expect(applyQualifiedRuntimeInstall(nested, qualifiedInstallPlanSHA256(nested), ports())).rejects.toThrow(
      "source checkout",
    );
  },
);
test("changed plan hash or wrong native host is rejected before staging", async () => {
  using dir = tempDir("bundle-identity", {});
  const { input } = await fixture(String(dir));
  const plan = await planQualifiedRuntimeInstall(input);
  await expect(applyQualifiedRuntimeInstall(plan, "0".repeat(64), ports())).rejects.toThrow("plan identity");
  await expect(
    applyQualifiedRuntimeInstall(plan, qualifiedInstallPlanSHA256(plan), {
      ...ports(),
      hostTarget: () => "windows-x64",
    }),
  ).rejects.toThrow("native ABI");
});
test("Windows PATH planning preserves raw expansion syntax and registry value kind", () => {
  const prior = { raw: "%SystemRoot%\\System32;C:\\existing", kind: "ExpandString" as const };
  expect(windowsBundlePathSnapshot(prior, "C:\\qualified\\release")).toEqual({
    raw: "C:\\qualified\\release;%SystemRoot%\\System32;C:\\existing",
    kind: "ExpandString",
  });
  expect(prior.raw).toBe("%SystemRoot%\\System32;C:\\existing");
  expect(() => windowsBundlePathSnapshot(prior, "C:\\unsafe;override")).toThrow();
});

test("a pinned plan cannot relabel a runtime subset as complete media or change its source", async () => {
  using directory = tempDir("bundle-contract", {});
  const { input } = await fixture(String(directory));
  const original = await planQualifiedRuntimeInstall(input);
  for (const patch of [{ allComponentsQualified: true }, { source: "b".repeat(40) }]) {
    const plan = { ...original, ...patch };
    await expect(applyQualifiedRuntimeInstall(plan, qualifiedInstallPlanSHA256(plan), ports())).rejects.toThrow();
  }
});

test("fresh low disk headroom blocks staging and preserves the prior installation", async () => {
  using directory = tempDir("bundle-headroom", {});
  const { input } = await fixture(String(directory));
  const plan = await planQualifiedRuntimeInstall(input);
  expect(plan.disk.requiredBytes).toBeGreaterThan(1024 ** 3);
  await expect(
    applyQualifiedRuntimeInstall(plan, qualifiedInstallPlanSHA256(plan), {
      ...ports(),
      availableBytes: async () => plan.disk.requiredBytes - 1,
    }),
  ).rejects.toThrow("rollback reserve");
  expect(await Bun.file(join(input.root, "current", "bun")).exists()).toBe(false);
});
