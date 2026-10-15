import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import {
  nativeCapacity,
  nativeOwnerPrerequisites,
  nativeWorkerInput,
  nativeLinuxCPUs,
  nativeAvailableMemory,
  nativeRuntimeBuildFlags,
} from "./release-native-worker";
import { nativeFullReleasePlan, runtimeReleaseMatrix } from "./release-matrix";
import { qualifyNativeWinget } from "./release-native-install";
import { nativeNginxRecipe } from "./release-native-nginx";
import { mediaSDKPlan } from "../../packages/bun-video/src/sdk";

test("native capacity rejects small hosted machines instead of qualifying from their labels", () => {
  const GiB = 1024 ** 3;
  const available = { freeDisk: 24 * GiB, freeMemory: 7 * GiB, cpus: 4 };
  expect(nativeCapacity(available).maxJobs).toBe(2);
  for (const changed of [{ freeDisk: 14 * GiB }, { freeMemory: 5 * GiB }, { cpus: 1 }, { freeDisk: NaN }])
    expect(() => nativeCapacity({ ...available, ...changed })).toThrow("capacity insufficient");
});

test("Linux affinity honors assigned CPU IDs rather than assuming the host starts at CPU zero", () => {
  expect(nativeLinuxCPUs("Cpus_allowed_list:\t128-131\n")).toBe("128,129");
  expect(nativeLinuxCPUs("Cpus_allowed_list:\t3,7-9\n")).toBe("3,7");
  for (const mask of ["", "Cpus_allowed_list:\t0\n", "Cpus_allowed_list:\t9-3\n"])
    expect(() => nativeLinuxCPUs(mask)).toThrow();
});

test("native worker rejects moving refs, foreign targets and products inside the checkout", () => {
  using directory = tempDir("native-worker-input", {});
  const sourceRoot = join(String(directory), "source");
  const out = join(String(directory), "products");
  const args = ["windows-x64", "a".repeat(40), "1.4.4", out];
  expect(nativeWorkerInput(args, sourceRoot).source).toBe(args[1]!);
  for (const bad of [
    ["windows-x64", "main", "1.4.4", out],
    ["windows-x64", "a".repeat(40), "1.4.4", join(sourceRoot, "products")],
    ["wasm", "a".repeat(40), "1.4.4", out],
    [...args, "--skip-gates"],
  ])
    expect(() => nativeWorkerInput(bad, sourceRoot)).toThrow();
});

test("unpublished media SDKs use pinned source recipes while unrelated native owner gaps remain", () => {
  for (const allocation of nativeFullReleasePlan("a".repeat(40)).targets) {
    const missing = nativeOwnerPrerequisites(allocation.target);
    if (allocation.target === "linux-x64") expect(nativeNginxRecipe(allocation.target)).toContain("gnu-x64.sh");
    else {
      expect(() => nativeNginxRecipe(allocation.target)).toThrow("recipe absent");
      expect(missing.some(cause => cause.includes("NGINX engine/module recipe absent"))).toBe(true);
    }
    expect(missing.some(cause => cause.includes("SDK recipe or archive absent"))).toBe(false);
    expect(missing.some(cause => cause.includes("Mach-O"))).toBe(false);
    if (allocation.target !== "windows-x64") expect(missing.some(cause => cause.includes("Sharp/Remotion"))).toBe(true);
    if (allocation.target.endsWith("-musl")) {
      expect(allocation.nativeABIContainer).toBe("alpine:3.24");
      expect(allocation.controlBootstrap.url).not.toContain("-musl.zip");
      expect(allocation.bootstrap.url).toContain("-musl.zip");
    }
  }
});

test("a missing source recipe cannot be substituted by an unqualified target label", () => {
  const plans = (["ffmpeg", "mpv"] as const).map(component => mediaSDKPlan(component, "linux-x64"));
  delete plans[0]!.buildRecipe;
  plans[1]!.sourceRevision = "main";
  const missing = nativeOwnerPrerequisites("linux-x64", plans);
  expect(missing.some(cause => cause.includes("pinned ffmpeg SDK recipe or archive absent"))).toBe(true);
  expect(missing.some(cause => cause.includes("pinned mpv SDK recipe or archive absent"))).toBe(true);
});

test("Winget fixture cannot modify the local workstation through the native CI helper", async () => {
  using directory = tempDir("native-winget-boundary", {});
  let called = false;
  await expect(
    qualifyNativeWinget({
      root: String(directory),
      scratch: String(directory),
      target: "windows-x64",
      source: "a".repeat(40),
      version: "1.4.4",
      runtime: join(String(directory), "bun.exe"),
      archive: join(String(directory), "bun.zip"),
      run: async () => {
        called = true;
        return "";
      },
    }),
  ).rejects.toThrow();
  expect(called).toBe(false);
});

test("full native producer forwards every supported optional owner including vector index", () => {
  const targets = runtimeReleaseMatrix(["linux-x64"]);
  const full = targets.find(target => target.flavor === "full")!;
  const flags = nativeRuntimeBuildFlags(full, "/qualified/sysroot");
  for (const flag of [
    "--coreutils=on",
    "--video-native=on",
    "--curl-native=on",
    "--browser-crawl=on",
    "--browser-index=on",
    "--lto=on",
    "--linux-sysroot=/qualified/sysroot",
    "--link-threads=2",
    "-j2",
  ])
    expect(flags).toContain(flag);
  expect(() => nativeRuntimeBuildFlags(targets.find(target => target.flavor === "perf")!)).toThrow(
    "full runtime profile",
  );
});

const GiB = 1024 ** 3;
const memoryFixture = (files: Record<string, string>) => async (path: string) => files[path];
test("Linux available RAM includes reclaimable cache without inventing a host budget", async () => {
  expect(
    await nativeAvailableMemory("linux", GiB, memoryFixture({ "/proc/meminfo": "MemAvailable: 12582912 kB\n" })),
  ).toBe(12 * GiB);
  expect(await nativeAvailableMemory("linux", GiB, memoryFixture({}))).toBe(GiB);
  expect(
    await nativeAvailableMemory("darwin", GiB, async () => {
      throw Error("Linux proc must not be read");
    }),
  ).toBe(GiB);
});

test("cgroup v2 constrains reclaimable memory by leaf and every mounted ancestor", async () => {
  const files = {
    "/proc/meminfo": "MemAvailable: 12582912 kB\n",
    "/proc/self/cgroup": "0::/parent/job\n",
    "/proc/self/mountinfo": "1 0 0:1 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n",
    "/sys/fs/cgroup/parent/job/memory.max": "max\n",
    "/sys/fs/cgroup/parent/job/memory.current": String(GiB),
    "/sys/fs/cgroup/parent/memory.max": String(8 * GiB),
    "/sys/fs/cgroup/parent/memory.current": String(3 * GiB),
  };
  expect(await nativeAvailableMemory("linux", GiB, memoryFixture(files))).toBe(5 * GiB);
  expect(() => nativeCapacity({ freeDisk: 24 * GiB, freeMemory: 5 * GiB, cpus: 2 })).toThrow("capacity insufficient");
  files["/sys/fs/cgroup/parent/job/memory.max"] = String(2 * GiB);
  expect(await nativeAvailableMemory("linux", GiB, memoryFixture(files))).toBe(GiB);
  files["/sys/fs/cgroup/parent/job/memory.max"] = "max\n";
  files["/sys/fs/cgroup/parent/memory.current"] = String(9 * GiB);
  expect(await nativeAvailableMemory("linux", GiB, memoryFixture(files))).toBe(0);
  files["/sys/fs/cgroup/parent/memory.current"] = "invalid";
  await expect(nativeAvailableMemory("linux", GiB, memoryFixture(files))).rejects.toThrow("Invalid cgroup");
});

test("cgroup v1 and subtree mounts use actual process membership", async () => {
  const files = {
    "/proc/meminfo": "MemAvailable: 12582912 kB\n",
    "/proc/self/cgroup": "2:cpu,cpuacct:/other\n3:memory:/parent/job\n",
    "/proc/self/mountinfo": "1 0 0:1 /parent /sys/fs/cgroup/memory rw - cgroup cgroup rw,memory\n",
    "/sys/fs/cgroup/memory/job/memory.limit_in_bytes": String(10 * GiB),
    "/sys/fs/cgroup/memory/job/memory.usage_in_bytes": String(3 * GiB),
    "/sys/fs/cgroup/memory/memory.limit_in_bytes": String(12 * GiB),
    "/sys/fs/cgroup/memory/memory.usage_in_bytes": String(8 * GiB),
  };
  expect(await nativeAvailableMemory("linux", GiB, memoryFixture(files))).toBe(4 * GiB);
});
