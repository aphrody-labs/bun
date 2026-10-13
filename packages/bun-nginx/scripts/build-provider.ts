import { mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { hashSDKFile } from "../../bun-video/src/sdk";
import { verifySources } from "./verify-sources";

const repository = resolve(import.meta.dir, "../../..");
export async function planProvider(output: string) {
  if (!isAbsolute(output)) throw new Error("NGINX build output must be absolute");
  const destination = resolve(output),
    scoped = relative(repository, destination);
  if (!scoped || scoped.startsWith("..") || isAbsolute(scoped))
    throw new Error("NGINX build output must remain in this checkout's owned build store");
  const sources = await verifySources(repository);
  const source = join(repository, "vendor/nginx"),
    ngxRust = join(repository, "vendor/ngx-rust"),
    module = join(repository, "packages/bun-nginx/native");
  const objects = join(destination, "objects");
  const arguments_ = [
    `--builddir=${objects}`,
    `--prefix=${join(destination, "prefix")}`,
    "--with-compat",
    "--with-threads",
    "--with-http_ssl_module",
    "--with-http_v2_module",
    "--with-http_v3_module",
    "--with-stream",
    "--with-stream_ssl_module",
    "--with-stream_ssl_preread_module",
    "--with-mail",
    "--with-mail_ssl_module",
    ...(process.platform === "linux" ? ["--with-ld-opt=-Wl,-E"] : []),
    `--add-module=${module}`,
  ];
  const moduleFiles = ["Cargo.toml", "Cargo.lock", "build.rs", "config", "config.make", "src/lib.rs", "sources.json"];
  const moduleInputs = [];
  for (const name of moduleFiles) moduleInputs.push({ name, sha256: await hashSDKFile(join(module, name)) });
  return {
    schema: 1,
    kind: "bun-nginx-native-provider-plan",
    platform: process.platform,
    arch: process.arch,
    host: { platform: process.platform, arch: process.arch, bunVersion: Bun.version, bunRevision: Bun.revision },
    destination,
    source,
    ngxRust,
    module,
    objects,
    sources: sources.records.map(source =>
      Object.fromEntries(Object.entries(source).filter(([name]) => name !== "files")),
    ),
    moduleInputs,
    jobs: 2,
    configureArguments: arguments_,
    commands: [
      { executable: "sh", args: ["auto/configure", ...arguments_], cwd: source },
      { executable: "make", args: ["-f", join(objects, "Makefile"), "-j2"], cwd: source },
    ],
    environment: {
      BUN_NGX_RUST_SOURCE_DIR: ngxRust,
      NGX_CARGO: `bun ${join(repository, "scripts/build/rust/cargo-serial.ts")}`,
      CARGO_BUILD_JOBS: "2",
      NGX_RUSTC_OPT: "--locked --jobs=2",
    },
    heavyLock: process.platform === "linux" ? "/home/ubuntu/build/locks/heavy.lock" : null,
    executionSupported: process.platform === "linux",
    missingGates: [
      "native module compile",
      "HTTP and HEAD",
      "event-loop timer and client abort",
      "reload/quit lifecycle",
      "invalid configuration",
      "dynamic ABI mismatch",
      "shared-library and libc baseline",
      ...(process.platform === "win32"
        ? ["native MSVC configure/toolchain gate", "Windows exact target Rust module ABI"]
        : []),
    ],
    nativeModuleQualified: false,
    allReleasePlatformsQualified: false,
  };
}
async function execute(output: string) {
  const plan = await planProvider(output);
  if (!plan.executionSupported)
    throw new Error("This native provider recipe currently executes on Linux only; other target gates remain explicit");
  await mkdir(plan.destination, { recursive: true });
  const env: Record<string, string> = { ...(process.env as Record<string, string>), ...plan.environment };
  async function run(executable: string, args: string[], name: string) {
    const log = Bun.file(join(plan.destination, name));
    await using child = Bun.spawn([executable, ...args], {
      cwd: plan.source,
      stdin: "ignore",
      stdout: log,
      stderr: Bun.file(join(plan.destination, name.replace(".log", ".stderr.log"))),
      env,
      timeout: 30 * 60_000,
    });
    if ((await child.exited) !== 0) throw new Error(`NGINX ${name} failed; inspect its owned log`);
  }
  await run("sh", ["auto/configure", ...plan.configureArguments], "configure.log");
  const configuration = {
    source: plan.sources,
    arguments: plan.configureArguments,
    headersSha256: await hashSDKFile(join(plan.objects, "ngx_auto_config.h")),
  };
  const configurationSha256 = new Bun.CryptoHasher("sha256").update(JSON.stringify(configuration)).digest("hex");
  env.BUN_NGINX_CONFIGURATION_SHA256 = configurationSha256;
  await run("make", ["-f", join(plan.objects, "Makefile"), "-j2"], "build.log");
  const executable = join(plan.objects, "nginx");
  const receipt = {
    ...plan,
    kind: "bun-nginx-native-provider-build",
    configuration,
    configurationSha256,
    executable: { path: executable, sha256: await hashSDKFile(executable), bytes: Bun.file(executable).size },
    nativeModuleQualified: false,
  };
  // This deliberately incompatible temporary library exercises the real dynamic loader.
  // NGINX's final executable above already contains the normal static module.
  env.NGINX_SOURCE_DIR = plan.source;
  env.NGINX_BUILD_DIR = plan.objects;
  await run(
    process.execPath,
    [
      join(repository, "scripts/build/rust/cargo-serial.ts"),
      "rustc",
      "--manifest-path",
      join(plan.module, "Cargo.toml"),
      "--locked",
      "--jobs=2",
      "--config",
      join(plan.objects, ".cargo/config.toml"),
      "--profile",
      "ngx-release",
      "--no-default-features",
      "--features",
      "export-modules,abi-mismatch-fixture",
      "--target-dir",
      join(plan.objects, "ngx_bun_runtime"),
    ],
    "abi-fixture.log",
  );
  const fixturePath = join(plan.objects, "ngx_bun_runtime/ngx-release/libngx_http_bun_module.so");
  const mismatchFixture = {
    path: fixturePath,
    sha256: await hashSDKFile(fixturePath),
    releaseArtifact: false,
    deliberatelyIncompatible: true,
  };
  await Bun.write(
    join(plan.destination, "build-receipt.json"),
    JSON.stringify({ ...receipt, mismatchFixture }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      receipt: join(plan.destination, "build-receipt.json"),
      executable: receipt.executable,
      nativeModuleQualified: false,
    }),
  );
}
if (import.meta.main) {
  const [action, output] = process.argv.slice(2);
  if (!output) throw new Error("Usage: bun build-provider.ts <plan|build> <absolute-owned-output>");
  if (action === "plan") console.log(JSON.stringify(await planProvider(output), null, 2));
  else if (action === "build") {
    const plan = await planProvider(output);
    if (!plan.executionSupported || !plan.heavyLock)
      throw new Error("Native NGINX build requires its supported host and shared heavy lock");
    await using child = Bun.spawn(
      ["flock", "-n", plan.heavyLock, process.execPath, import.meta.path, "locked-build", output],
      {
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, BUN_NGINX_HEAVY_LOCK_EXECUTION: "held" },
        timeout: 35 * 60_000,
      },
    );
    process.exitCode = await child.exited;
  } else if (action === "locked-build") {
    if (process.env.BUN_NGINX_HEAVY_LOCK_EXECUTION !== "held")
      throw new Error("Use the build action to acquire the host's heavy lock");
    await execute(output);
  } else throw new Error("Unknown NGINX provider action");
}
