import { mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const [source, output, target, toolchain, sysroot] = process.argv.slice(2);
if (!source || !output || !target) throw new Error("Expected source, output and host target directory");
const patch = resolve(import.meta.dir, "winfw-libwfp.patch");
const directory = resolve(source, "windows/libwfp");
const root = resolve(source, "../..");
const apply = async (flags: string[]) => {
  const proc = Bun.spawn(
    ["git", "apply", ...flags, `--directory=${relative(root, directory).replaceAll("\\", "/")}`, patch],
    { cwd: root, stdout: "ignore", stderr: "pipe" },
  );
  const [error, code] = await Promise.all([proc.stderr.text(), proc.exited]);
  return { error, code };
};
if ((await apply(["--reverse", "--check"])).code !== 0) {
  const check = await apply(["--check"]);
  if (check.code !== 0) throw new Error(`WinFw source patch mismatch: ${check.error}`);
  const result = await apply([]);
  if (result.code !== 0) throw new Error(`WinFw source patch failed: ${result.error}`);
}
const child = Bun.spawn({
  cmd: [
    "cargo",
    ...(toolchain ? [`+${toolchain}`] : []),
    "run",
    "--release",
    "--locked",
    "--manifest-path",
    resolve(source, "talpid-types/Cargo.toml"),
    "--bin",
    "generate-cpp-lannetworks",
    "-j1",
  ],
  env: { ...process.env, CARGO_TARGET_DIR: target, RUSTC_WRAPPER: undefined },
  stdout: "pipe",
  stderr: "inherit",
  timeout: 600_000,
});
const [header, code] = await Promise.all([child.stdout.text(), child.exited]);
if (code !== 0) throw new Error(`WinFw LAN generator exited ${code}`);
if (!header.startsWith("#pragma once\n") || !header.includes("g_ipv4LanNets"))
  throw new Error("Invalid WinFw LAN generator output");
const previous = Bun.file(output);
if (!(await previous.exists()) || (await previous.text()) !== header) {
  await mkdir(dirname(output), { recursive: true });
  await Bun.write(output, header);
}
if (sysroot) {
  const roots = [];
  for await (const path of new Bun.Glob("**/*").scan({ cwd: sysroot, onlyFiles: true, absolute: true })) {
    if (!path.toLowerCase().includes("/include/")) continue;
    roots.push({ type: "file", name: path, "external-contents": path });
  }
  if (roots.length === 0) throw new Error("Windows SDK headers missing");
  roots.sort((a, b) => a.name.localeCompare(b.name));
  const file = resolve(dirname(output), "../sdk-vfs.json");
  const text = JSON.stringify({ version: 0, "case-sensitive": false, roots });
  const old = Bun.file(file);
  if (!(await old.exists()) || (await old.text()) !== text) await Bun.write(file, text);
}
