import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { computeDepPICFlags } from "../build/flags";
import {
  verifyZlibSDKSource,
  zlibConsumerCommands,
  zlibPkgConfig,
  zlibSharedConsumerCommands,
  zlibSystemLibraries,
} from "./native-sdk-factory";

const git = (cwd: string, ...argv: string[]) => {
  const result = Bun.spawnSync(
    [
      "git",
      "-c",
      "user.name=fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...argv,
    ],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  if (!result.success) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
};

async function checkout(base: string, header = "1.3.2.zlib-rs-0.6.8") {
  const owner = join(base, "src/zlib_rs");
  await mkdir(join(owner, "include"), { recursive: true });
  await mkdir(join(owner, "src"), { recursive: true });
  await Bun.write(join(owner, "Cargo.toml"), '[package]\nname = "zlib-rs"\nversion = "0.6.8"\nlicense = "Zlib"\n');
  await Bun.write(join(owner, "include/zlib.h"), `#define ZLIB_VERSION "${header}"\n`);
  await Bun.write(join(owner, "include/zconf.h"), "/* zconf */\n");
  await Bun.write(join(owner, "LICENSE"), "zlib-rs notice\n");
  await Bun.write(join(owner, "src/c_exports.rs"), "// exports\n");
  await Bun.write(join(base, "README.md"), "unrelated\n");
  git(base, "init", "-q");
  git(base, "add", "-A");
  git(base, "commit", "-q", "-m", "fixture");
  return owner;
}

test("zlib-rs provenance binds the committed, clean src/zlib_rs tree and its crate version", async () => {
  using directory = tempDir("zlib-sdk-source", {});
  const base = String(directory);
  await checkout(base);
  const receipt = await verifyZlibSDKSource(base);
  expect(receipt).toMatchObject({
    schema: 1,
    repository: "https://github.com/aphrody-labs/bun",
    revision: git(base, "rev-parse", "HEAD"),
    owner: "src/zlib_rs",
    gitTree: git(base, "rev-parse", "HEAD:src/zlib_rs"),
    sourceClean: true,
    package: "zlib-rs",
    version: "0.6.8",
    zlibVersion: "1.3.2.zlib-rs-0.6.8",
  });
  expect(receipt.sourceTreeSHA256).toMatch(/^[a-f0-9]{64}$/);
  // Changes outside the owner do not affect its provenance.
  await Bun.write(join(base, "README.md"), "changed elsewhere\n");
  expect((await verifyZlibSDKSource(base)).sourceTreeSHA256).toBe(receipt.sourceTreeSHA256);
});

test("zlib-rs provenance rejects modified, untracked and version-skewed sources", async () => {
  for (const mutation of ["modified", "untracked", "header"] as const) {
    using directory = tempDir(`zlib-sdk-source-${mutation}`, {});
    const base = String(directory);
    const owner = await checkout(base, mutation === "header" ? "1.3.2.zlib-rs-0.6.7" : undefined);
    if (mutation === "modified") await Bun.write(join(owner, "LICENSE"), "changed notice\n");
    if (mutation === "untracked") await Bun.write(join(owner, "src/extra.rs"), "// unreviewed\n");
    await expect(verifyZlibSDKSource(base)).rejects.toThrow(
      mutation === "header" ? "header version differs" : "uncommitted or ignored files",
    );
  }
});

test("rustc native-static-libs become bounded consumer link inputs", () => {
  const windows = zlibSystemLibraries(
    "native-static-libs: kernel32.lib ntdll.lib userenv.lib ws2_32.lib dbghelp.lib synchronization.lib /defaultlib:msvcrt",
  );
  expect(windows).toEqual([
    "kernel32.lib",
    "ntdll.lib",
    "userenv.lib",
    "ws2_32.lib",
    "dbghelp.lib",
    "synchronization.lib",
    "/defaultlib:msvcrt",
  ]);
  expect(zlibSystemLibraries("native-static-libs: -lgcc_s -lutil -lrt -lpthread -lm -ldl -lc")).toContain("-lpthread");
  for (const invalid of ["native-static-libs: -lm; rm", "-lm", `native-static-libs: ${"-lm ".repeat(33)}`])
    expect(() => zlibSystemLibraries(invalid)).toThrow("native libraries");
  const pc = zlibPkgConfig("0.6.8", windows);
  expect(pc).toContain("prefix=${pcfiledir}/../..\n");
  expect(pc).toContain("Libs: -L${libdir} -lz -lkernel32 -lntdll -luserenv -lws2_32 -ldbghelp -lsynchronization\n");
  expect(pc).not.toContain("defaultlib");
  expect(zlibPkgConfig("0.6.8", [])).toContain("Libs: -L${libdir} -lz\n");
});

test("Windows zlib consumer compiles and executes through the canonical MSVC environment", () => {
  for (const arch of ["x64", "aarch64"] as const) {
    const commands = zlibConsumerCommands({
      windows: true,
      arch,
      cc: "clang-cl",
      flags: ["/MD"],
      includes: ["C:/SDK/include"],
      libraries: ["C:/SDK/lib/z.lib"],
      systemLibraries: ["ntdll.lib", "/defaultlib:msvcrt"],
      consumer: "C:/job/consumer.c",
      executable: "C:/job/consumer.exe",
    });
    const owner = [process.execPath, "msvc", "exec", "--arch", arch === "aarch64" ? "arm64" : "x64"];
    expect(commands.compile.slice(0, owner.length)).toEqual(owner);
    expect(commands.compile).toContain("/IC:/SDK/include");
    expect(commands.compile.slice(-5)).toEqual([
      "C:/SDK/lib/z.lib",
      "/Fe:C:/job/consumer.exe",
      "/link",
      "ntdll.lib",
      "/defaultlib:msvcrt",
    ]);
    expect(commands.execute.slice(0, owner.length)).toEqual(owner);
    expect(commands.execute.at(-1)).toBe("C:/job/consumer.exe");
  }
});

test("Linux zlib consumer links the archive before the Rust standard library's system libraries", () => {
  const commands = zlibConsumerCommands({
    windows: false,
    arch: "x64",
    cc: "/toolchain/clang",
    flags: ["-O2"],
    includes: ["/zlib/include"],
    libraries: ["/zlib/lib/libz.a"],
    systemLibraries: ["-lpthread", "-ldl"],
    consumer: "/job/consumer.c",
    executable: "/job/consumer",
  });
  expect(commands.compile).toEqual([
    "/toolchain/clang",
    "-O2",
    "-I",
    "/zlib/include",
    "/job/consumer.c",
    "/zlib/lib/libz.a",
    "-lpthread",
    "-ldl",
    "-o",
    "/job/consumer",
  ]);
  expect(commands.execute).toEqual(["/job/consumer"]);
});

test("dependency PIC policy preserves Windows and Android code models", () => {
  for (const pic of [false, true]) {
    expect(computeDepPICFlags({ abi: undefined, windows: true, unix: false }, pic)).toEqual([]);
    expect(computeDepPICFlags({ abi: "android", windows: false, unix: true }, pic)).toEqual(["-fPIC"]);
  }
  expect(computeDepPICFlags({ abi: "gnu", windows: false, unix: true })).toEqual(["-fno-pic", "-fno-pie"]);
});

test("Linux shared zlib qualification links the archive with defined symbols and runs a separate driver", () => {
  for (const arch of ["x64", "aarch64"] as const) {
    const input = {
      windows: false,
      arch,
      cc: "/toolchain/clang",
      flags: ["-O2"],
      includes: ["/zlib/include"],
      libraries: ["/zlib/lib/libz.a"],
      systemLibraries: ["-lpthread", "-ldl"],
      consumer: "/job/consumer.c",
      executable: "/job/consumer",
    };
    const commands = zlibSharedConsumerCommands(input);
    for (const flag of ["-shared", "-Wl,-z,defs", "-DBUN_ZLIB_SHARED_CONSUMER", "-fPIC", "-lpthread"])
      expect(commands.compile).toContain(flag);
    expect(commands.compile.indexOf("-lpthread")).toBeGreaterThan(commands.compile.indexOf(input.libraries[0]!));
    expect(commands.compile).toContain("-Wl,-soname,libzlib-consumer.so");
    expect(commands.link).toContain(commands.library);
    expect(commands.link).toContain(commands.driver);
    expect(commands.link).toContain("-Wl,-rpath,$ORIGIN");
    expect(commands.execute).toEqual([join("/job", "zlib-shared-consumer")]);
    expect(() => zlibSharedConsumerCommands({ ...input, windows: true })).toThrow("native Linux target");
  }
});
