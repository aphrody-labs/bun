import { expect, test } from "bun:test";
import { mkdir, realpath, symlink } from "node:fs/promises";
import { Ninja } from "../build/ninja";
import { join, resolve } from "node:path";
import { tempDir } from "../../test/harness";
import {
  nativeCapacity,
  nativeOwnerPrerequisites,
  nativeWorkerInput,
  nativeLinuxCPUs,
  nativeAvailableMemory,
  nativeRuntimeBuildFlags,
  nativeRuntimeBuildDirectory,
  nativeRuntimeResources,
  nativeRuntimeProtocPlan,
  command,
  nativeRuntimeRegressionPlan,
  assertRuntimeArtifactAbsent,
  nativeRuntimeArtifactPlan,
} from "./release-native-worker";
import { nativeFullReleasePlan, runtimeReleaseMatrix } from "./release-matrix";
import { qualifyNativeWinget } from "./release-native-install";
import { nativeNginxRecipe } from "./release-native-nginx";
import { mediaSDKPlan } from "../../packages/bun-video/src/sdk";

test("Windows ARM64 cross targets retain the x64 host protoc and non-Windows toolchains remain independent", () => {
  const x64 = nativeRuntimeProtocPlan("windows-x64", "x64");
  const arm64 = nativeRuntimeProtocPlan("windows-aarch64", "x64");
  expect(arm64).toEqual(x64);
  expect(arm64).toMatchObject({ hostArch: "x64", binaryArch: "x64", version: "31.0" });
  expect(arm64!.source.url).toEndWith("protoc-31.0-win64.zip");
  expect(nativeRuntimeProtocPlan("linux-x64", "x64")).toBeUndefined();
  expect(nativeRuntimeProtocPlan("darwin-aarch64", "arm64")).toBeUndefined();
});

test("native worker forwards its resolved host protoc to child build commands", async () => {
  using directory = tempDir("native-command-protoc", {});
  const previous = { PROTOC: process.env.PROTOC, PROTOC_INCLUDE: process.env.PROTOC_INCLUDE };
  try {
    process.env.PROTOC = join(String(directory), "host compiler", "protoc.exe");
    process.env.PROTOC_INCLUDE = join(String(directory), "host compiler", "include");
    const { stdout } = await command(
      [
        process.execPath,
        "--no-env-file",
        "-e",
        "console.log(JSON.stringify({PROTOC:process.env.PROTOC,PROTOC_INCLUDE:process.env.PROTOC_INCLUDE}))",
      ],
      String(directory),
      join(String(directory), "environment.log"),
      { timeout: 5000 },
    );
    expect(JSON.parse(stdout)).toEqual({ PROTOC: process.env.PROTOC, PROTOC_INCLUDE: process.env.PROTOC_INCLUDE });
  } finally {
    for (const name of ["PROTOC", "PROTOC_INCLUDE"] as const) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("runtime component qualifies the canonical stripped subject while full media retains profile output", () => {
  const directory = resolve("build/release");
  const linux = nativeRuntimeArtifactPlan(directory, "linux-x64", "runtime");
  expect(linux).toEqual({
    buildTarget: "bun",
    executable: join(directory, "bun"),
    profile: join(directory, "bun-profile"),
    profileSpec: join(directory, "bun-profile.verify.json"),
    strippedELF: true,
  });
  const media = nativeRuntimeArtifactPlan(directory, "linux-x64", "media");
  expect(media.buildTarget).toBe("bun-profile");
  expect(media.executable).toBe(media.profile);
  expect(media.strippedELF).toBe(false);
  const windows = nativeRuntimeArtifactPlan(directory, "windows-x64", "runtime");
  expect(windows.buildTarget).toBe("bun.exe");
  expect(windows.executable).toBe(join(directory, "bun.exe"));
  expect(windows.profileSpec).toBe(join(directory, "bun-profile.verify.json"));
  expect(windows.strippedELF).toBe(false);
});

test.each(["windows-x64", "windows-aarch64"])(
  "%s core and runtime request their actual Ninja executable outputs",
  target => {
    const directory = resolve("build/release");
    for (const component of ["media", "runtime"] as const) {
      const plan = nativeRuntimeArtifactPlan(directory, target, component);
      const executable = component === "runtime" ? "bun.exe" : "bun-profile.exe";
      expect(plan.buildTarget).toBe(executable);
      expect(plan.executable).toBe(join(directory, plan.buildTarget));
      expect(plan.profile).toBe(join(directory, "bun-profile.exe"));
      expect(plan.profileSpec).toBe(join(directory, "bun-profile.verify.json"));
      expect(plan.strippedELF).toBe(false);
    }
  },
);

test.each(["linux-x64", "linux-aarch64", "linux-x64-musl", "linux-aarch64-musl"])(
  "%s keeps its existing profile and stripped Ninja outputs",
  target => {
    const directory = resolve("build/release");
    for (const component of ["media", "runtime"] as const) {
      const stripped = component === "runtime" && !target.endsWith("-musl");
      const plan = nativeRuntimeArtifactPlan(directory, target, component);
      expect(plan.buildTarget).toBe(stripped ? "bun" : "bun-profile");
      expect(plan.executable).toBe(join(directory, plan.buildTarget));
      expect(plan.profile).toBe(join(directory, "bun-profile"));
      expect(plan.strippedELF).toBe(stripped);
    }
  },
);

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
  expect(nativeLinuxCPUs("Cpus_allowed_list:\t128-139\n", 12)).toBe("128,129,130,131,132,133,134,135,136,137,138,139");
  expect(nativeLinuxCPUs("Cpus_allowed_list:\t3,7-9\n", 4)).toBe("3,7,8,9");
  expect(() => nativeLinuxCPUs("Cpus_allowed_list:\t128-139\n", 13)).toThrow("13 allocated CPUs");
  for (const count of [0, -1, 1.5, 1025, NaN])
    expect(() => nativeLinuxCPUs("Cpus_allowed_list:\t0-31\n", count)).toThrow();
  expect(() => nativeLinuxCPUs("Cpus_allowed_list:\t3,3-5\n", 4)).toThrow("overlaps");
  for (const mask of ["", "Cpus_allowed_list:\t0\n", "Cpus_allowed_list:\t9-3\n"])
    expect(() => nativeLinuxCPUs(mask)).toThrow();
});

test.skipIf(process.platform !== "linux")(
  "native command uses its explicit affinity and worker environment together",
  async () => {
    using directory = tempDir("native-command-resources", {});
    const status = await Bun.file("/proc/self/status").text();
    const probe = `console.log(JSON.stringify({cpus:(await Bun.file('/proc/self/status').text()).match(/^Cpus_allowed_list:\\s*(.+)$/m)[1],cargo:process.env.CARGO_BUILD_JOBS,omp:process.env.OMP_NUM_THREADS,media:process.env.BUN_MEDIA_JOBS}))`;
    for (const resources of [undefined, { jobs: 1, linkThreads: 1 }]) {
      const { stdout } = await command(
        [process.execPath, "--no-env-file", "-e", probe],
        String(directory),
        join(String(directory), resources ? "explicit.log" : "default.log"),
        { timeout: 5000, ...(resources ? { resources } : {}) },
      );
      const result = JSON.parse(stdout);
      const expected = nativeLinuxCPUs(status, resources ? 1 : 2);
      expect(nativeLinuxCPUs(`Cpus_allowed_list:\t${result.cpus}\n`, resources ? 1 : 2)).toBe(expected);
      expect(() => nativeLinuxCPUs(`Cpus_allowed_list:\t${result.cpus}\n`, resources ? 2 : 3)).toThrow();
      expect(result.cargo).toBe(resources ? "1" : "2");
      expect(result.omp).toBe(resources ? "1" : "2");
      expect(result.media).toBe(resources ? "1" : "2");
    }
  },
);

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

// linux-arm64 has no published SDK archive: its source recipe is the only owner.
test("a missing source recipe cannot be substituted by an unqualified target label", () => {
  const plans = (["ffmpeg", "mpv"] as const).map(component => mediaSDKPlan(component, "linux-arm64"));
  delete plans[0]!.buildRecipe;
  plans[1]!.sourceRevision = "main";
  const missing = nativeOwnerPrerequisites("linux-aarch64", plans);
  expect(missing.some(cause => cause.includes("pinned ffmpeg SDK recipe or archive absent"))).toBe(true);
  expect(missing.some(cause => cause.includes("pinned mpv SDK recipe or archive absent"))).toBe(true);
});

test("runtime-only production retains native media prerequisites without claiming optional component qualification", () => {
  for (const allocation of nativeFullReleasePlan("a".repeat(40)).targets)
    expect(nativeOwnerPrerequisites(allocation.target, undefined, "runtime")).toEqual([]);
  const plans = (["ffmpeg", "mpv"] as const).map(component => mediaSDKPlan(component, "linux-arm64"));
  delete plans[0]!.buildRecipe;
  expect(nativeOwnerPrerequisites("linux-aarch64", plans, "runtime").join(" ")).toContain("pinned ffmpeg SDK");
  expect(nativeOwnerPrerequisites("linux-x64").join(" ")).toContain("Sharp/Remotion");
});

test("runtime fixture plan requires native search, curl and vector providers instead of passing feature-off skips", () => {
  const plan = nativeRuntimeRegressionPlan("/qualified/bun");
  expect(plan.command[0]).toBe("/qualified/bun");
  for (const fixture of [
    "search.test.ts",
    "vector-index.test.ts",
    "curl-aws-sigv4.test.ts",
    "browser-cli.test.ts",
    "yolo.test.ts",
    "vpn.test.ts",
    "declarations.test.ts",
    "input-files.test.ts",
  ])
    expect(plan.command.some(value => value.endsWith(fixture))).toBe(true);
  expect(plan.env).toEqual({
    BUN_TEST_REQUIRE_SEARCH: "1",
    BUN_TEST_REQUIRE_VECTOR_INDEX: "1",
    BUN_TEST_REQUIRE_CURL: "1",
  });
  expect(plan.qualityCommand).toEqual([
    "/qualified/bun",
    "--no-env-file",
    "test",
    "./test/cli/lint/toolchain.test.ts",
    "--test-name-pattern",
    "tracked.*aphrody",
  ]);
});

test("immutable runtime output rejects previous bytes before a producer can replace them", async () => {
  using directory = tempDir("runtime-output-collision", {});
  const asset = "bun-linux-x64-runtime-full";
  await assertRuntimeArtifactAbsent(String(directory), asset);
  const archive = join(String(directory), `${asset}.zip`);
  await Bun.write(archive, "previous qualified bytes");
  await expect(assertRuntimeArtifactAbsent(String(directory), asset)).rejects.toThrow("already exists");
  expect(await Bun.file(archive).text()).toBe("previous qualified bytes");
  await expect(assertRuntimeArtifactAbsent(String(directory), "../escape")).rejects.toThrow("Invalid");
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
    "--google-search=on",
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
    await nativeAvailableMemory("win32", GiB, async () => {
      throw Error("Linux proc must not be read");
    }),
  ).toBe(GiB);
  expect(await nativeAvailableMemory("darwin", GiB, memoryFixture({}))).toBe(GiB);
  const vmStat = [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages free:                 65536.",
    "Pages inactive:            262144.",
    "Pages speculative:          32768.",
    "Pages purgeable:                0.",
    "",
  ].join("\n");
  expect(await nativeAvailableMemory("darwin", GiB, memoryFixture({ vm_stat: vmStat }))).toBe(360448 * 16384);
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

test("relocated release output emits source paths from its physical Ninja cwd without configuring", async () => {
  using directory = tempDir("native-worker-physical-output", {});
  const root = join(String(directory), "source"),
    physical = join(String(directory), "fast-output"),
    logical = join(root, "build/release"),
    source = join(root, "src/fixture.cpp");
  await mkdir(join(root, "build"), { recursive: true });
  await mkdir(join(root, "src"));
  await mkdir(physical);
  await Bun.write(source, "int fixture = 1;\n");
  await Bun.write(join(physical, "configure.json"), "existing-recipe\n");
  await symlink(physical, logical, process.platform === "win32" ? "junction" : "dir");
  const buildDir = await nativeRuntimeBuildDirectory(root),
    target = runtimeReleaseMatrix(["linux-x64"]).find(value => value.flavor === "full")!;
  expect(buildDir).toBe(await realpath(physical));
  const flags = nativeRuntimeBuildFlags(target, undefined, { buildDir, jobs: 12, linkThreads: 12 });
  expect(flags).toContain("--build-dir=" + buildDir);
  expect(flags).toContain("-j12");
  expect(flags).toContain("--link-threads=12");
  const relativeInput = new Ninja({ buildDir }).rel(source);
  expect(resolve(await realpath(logical), relativeInput)).toBe(source);
  expect(resolve(await realpath(logical), new Ninja({ buildDir: logical }).rel(source))).not.toBe(source);
  expect(await Bun.file(join(physical, "configure.json")).text()).toBe("existing-recipe\n");
});
test("normal and absent release directories retain their owner while dangling or file aliases fail closed", async () => {
  using directory = tempDir("native-worker-output-boundary", {});
  const root = join(String(directory), "source"),
    logical = join(root, "build/release");
  await mkdir(join(root, "build"), { recursive: true });
  expect(await nativeRuntimeBuildDirectory(root)).toBe(logical);
  expect(await Bun.file(join(logical, "configure.json")).exists()).toBe(false);
  await symlink(join(String(directory), "missing"), logical, process.platform === "win32" ? "junction" : "dir");
  await expect(nativeRuntimeBuildDirectory(root)).rejects.toThrow();
  const fileRoot = join(String(directory), "file-source");
  await mkdir(join(fileRoot, "build"), { recursive: true });
  await Bun.write(join(fileRoot, "build/release"), "not a directory");
  await expect(nativeRuntimeBuildDirectory(fileRoot)).rejects.toThrow("not a directory");
});
test("explicit twelve-CPU runtime budget preserves defaults and existing RAM minimum without silent clamping", () => {
  expect(nativeRuntimeResources({})).toEqual({ jobs: 2, linkThreads: 2 });
  const resources = nativeRuntimeResources({ BUN_NATIVE_RUNTIME_JOBS: "12", BUN_NATIVE_RUNTIME_LINK_THREADS: "12" });
  expect(resources).toEqual({ jobs: 12, linkThreads: 12 });
  expect(nativeCapacity({ freeDisk: 500 * GiB, freeMemory: 26 * GiB, cpus: 12 }, resources)).toMatchObject({
    maxJobs: 12,
    linkThreads: 12,
    required: { memory: 6 * GiB, cpus: 12 },
  });
  expect(() => nativeCapacity({ freeDisk: 500 * GiB, freeMemory: 26 * GiB, cpus: 11 }, resources)).toThrow(
    "capacity insufficient",
  );
  expect(() => nativeCapacity({ freeDisk: 500 * GiB, freeMemory: 5 * GiB, cpus: 12 }, resources)).toThrow(
    "capacity insufficient",
  );
  for (const value of ["", "0", "-1", "1.5", "12x", "1025"])
    expect(() => nativeRuntimeResources({ BUN_NATIVE_RUNTIME_JOBS: value })).toThrow("resource budget");
  const target = runtimeReleaseMatrix(["linux-x64"]).find(value => value.flavor === "full")!;
  expect(() => nativeRuntimeBuildFlags(target, undefined, { buildDir: "relative" })).toThrow("build options");
});
