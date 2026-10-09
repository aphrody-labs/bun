// Builds the Aphrody Alpine WSL2 distribution (lot A4 of docs/aphrody/merge/M-alpine.md):
// scripts/aphrody/alpine/wsl.Dockerfile on top of the runtime image (Alpine 3.24 + the fork's
// musl Bun), exported with `docker export`, filtered (no /etc/resolv.conf, /etc/hosts,
// /etc/hostname, /.dockerenv: WSL generates them) and gzipped into a .wsl file
// (https://learn.microsoft.com/windows/wsl/build-custom-distro). A .sha256 file is written
// next to it.
//
//   bun scripts/aphrody/alpine/wsl.ts [--base <image>] [--arch x86_64|aarch64] [--out <file.wsl>]
//       [--no-gui] [--install <Name> [--location <dir>]]
//
// --base defaults to ghcr.io/aphrody-labs/alpine:3.24-runtime (a local tag such as
// aphrody-g4/alpine:3.24-runtime works). --install registers the result on this Windows
// machine (`wsl --install --from-file <out> --name <Name> --no-launch`), then runs the gates
// `bun --version` and `bunsh -c 'exit 0'` inside it.

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const HERE = import.meta.dir;
const ROOT = resolve(HERE, "..", "..", "..");
export const DEFAULT_BASE = "ghcr.io/aphrody-labs/alpine:3.24-runtime";
/** Paths WSL generates or that only make sense in a container. */
export const DROPPED = new Set(["etc/resolv.conf", "etc/hosts", "etc/hostname", ".dockerenv"]);
/** Files the .wsl must contain. */
export const REQUIRED = [
  "etc/wsl.conf",
  "etc/wsl-distribution.conf",
  "usr/libexec/aphrody/wsl-oobe.sh",
  "usr/libexec/aphrody/wsl-boot.sh",
  "etc/profile.d/aphrody-wslg.sh",
  "usr/share/aphrody/wsl/aphrody.ico",
  "bin/bunsh",
];

const PLATFORMS = { x86_64: "linux/amd64", aarch64: "linux/arm64" } as const;
type Arch = keyof typeof PLATFORMS;

function hostArch(): Arch {
  return process.arch === "arm64" ? "aarch64" : "x86_64";
}

async function run(cmd: string[], opts: { quiet?: boolean } = {}): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: opts.quiet ? "pipe" : "inherit" });
  const [out, code] = await Promise.all([proc.stdout.text(), proc.exited]);
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited with ${code}`);
  return out;
}

/** Normalised archive path of a tar header name ("./etc/x" and "/etc/x" -> "etc/x"). */
export function normalize(name: string): string {
  return name.replace(/^\.?\/+/, "").replace(/\/+$/, "");
}

function field(block: Uint8Array, offset: number, length: number): string {
  const bytes = block.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
}

function octal(block: Uint8Array, offset: number, length: number): number {
  const s = field(block, offset, length).trim();
  return s ? parseInt(s, 8) : 0;
}

/** Path of a pax extended header ("path" record), if any. */
function paxPath(data: Uint8Array): string | undefined {
  const text = new TextDecoder().decode(data);
  for (const line of text.split("\n")) {
    const m = /^\d+ path=(.*)$/.exec(line);
    if (m) return m[1];
  }
}

/**
 * Streaming tar filter: drops the entries whose normalised path is in `drop` (with their
 * pax/GNU long-name headers) and records every kept path in `seen`. Ustar, pax and GNU
 * long names, as written by `docker export`.
 */
export function tarFilter(drop: Set<string>, seen: Set<string>): TransformStream<Uint8Array, Uint8Array> {
  let buf = new Uint8Array(0);
  let pending: Uint8Array[] = []; // pax / long-name blocks of the next entry
  let longName: string | undefined;
  let skipBytes = 0; // data blocks left to drop
  let passBytes = 0; // data blocks left to copy
  let ended = false;
  return new TransformStream({
    transform(chunk, controller) {
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf);
      merged.set(chunk, buf.length);
      let at = 0;
      while (true) {
        if (passBytes > 0 || skipBytes > 0) {
          const want = passBytes || skipBytes;
          const take = Math.min(want, merged.length - at);
          if (take === 0) break;
          if (passBytes > 0) {
            controller.enqueue(merged.subarray(at, at + take));
            passBytes -= take;
          } else skipBytes -= take;
          at += take;
          continue;
        }
        if (merged.length - at < 512) break;
        const block = merged.subarray(at, at + 512);
        if (ended || block.every(b => b === 0)) {
          ended = true;
          controller.enqueue(block.slice());
          at += 512;
          continue;
        }
        const type = String.fromCharCode(block[156]);
        const size = octal(block, 124, 12);
        const padded = Math.ceil(size / 512) * 512;
        if (type === "x" || type === "L") {
          if (merged.length - at < 512 + padded) break; // need the whole header record
          const record = merged.slice(at, at + 512 + padded);
          const data = record.subarray(512, 512 + size);
          if (type === "x") longName = paxPath(data) ?? longName;
          else longName = new TextDecoder().decode(data).replace(/\0.*$/s, "");
          pending.push(record);
          at += 512 + padded;
          continue;
        }
        const prefix = field(block, 345, 155);
        const name = longName ?? (prefix ? `${prefix}/${field(block, 0, 100)}` : field(block, 0, 100));
        const path = normalize(name);
        longName = undefined;
        if (drop.has(path)) {
          pending = [];
          skipBytes = padded;
        } else {
          if (path) seen.add(path);
          for (const p of pending) controller.enqueue(p);
          pending = [];
          controller.enqueue(block.slice());
          passBytes = padded;
        }
        at += 512;
      }
      buf = merged.slice(at);
    },
    flush(controller) {
      if (buf.length) controller.enqueue(buf);
    },
  });
}

export interface Options {
  base: string;
  arch: Arch;
  out: string;
  install?: string;
  location?: string;
  /** Install wsl/packages-gui.txt (Mesa d3d12/dozen, Wayland); --no-gui leaves it out. */
  gui: boolean;
}

export function parse(argv: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: "string", default: DEFAULT_BASE },
      arch: { type: "string", default: hostArch() },
      out: { type: "string" },
      install: { type: "string" },
      location: { type: "string" },
      "no-gui": { type: "boolean", default: false },
    },
    strict: true,
  });
  const arch = values.arch as Arch;
  if (!(arch in PLATFORMS)) throw new Error(`--arch must be x86_64 or aarch64, not ${values.arch}`);
  return {
    base: values.base!,
    arch,
    out: resolve(values.out ?? join(ROOT, "dist", `aphrody-alpine-${arch}.wsl`)),
    install: values.install,
    location: values.location,
    gui: !values["no-gui"],
  };
}

/** Docker build context: the Dockerfile, wsl/ and the shortcut icon (src/bun.ico). */
function context(): string {
  const dir = mkdtempSync(join(tmpdir(), "aphrody-wsl-"));
  cpSync(join(HERE, "wsl.Dockerfile"), join(dir, "Dockerfile"));
  cpSync(join(HERE, "wsl"), join(dir, "wsl"), {
    recursive: true,
    filter: src => !/[\\/]wsl[\\/]examples([\\/]|$)/.test(src),
  });
  cpSync(join(ROOT, "src", "bun.ico"), join(dir, "aphrody.ico"));
  return dir;
}

export async function build(opts: Options): Promise<{ out: string; sha256: string }> {
  const tag = `aphrody-alpine-wsl:${opts.arch}`;
  const ctx = context();
  try {
    await run([
      "docker",
      "buildx",
      "build",
      "--load",
      "--platform",
      PLATFORMS[opts.arch],
      "--build-arg",
      `BASE=${opts.base}`,
      "--build-arg",
      `GUI=${opts.gui ? 1 : 0}`,
      "-t",
      tag,
      ctx,
    ]);
  } finally {
    rmSync(ctx, { recursive: true, force: true });
  }
  const id = (
    await run(["docker", "create", "--platform", PLATFORMS[opts.arch], tag, "/bin/true"], { quiet: true })
  ).trim();
  const seen = new Set<string>();
  try {
    mkdirSync(dirname(opts.out), { recursive: true });
    const exp = Bun.spawn(["docker", "export", id], { stdout: "pipe", stderr: "inherit" });
    const gz = exp.stdout.pipeThrough(tarFilter(DROPPED, seen)).pipeThrough(new CompressionStream("gzip"));
    await Bun.write(opts.out, new Response(gz));
    if ((await exp.exited) !== 0) throw new Error("docker export failed");
  } finally {
    await run(["docker", "rm", id], { quiet: true });
  }
  const missing = REQUIRED.filter(p => !seen.has(p));
  if (missing.length) throw new Error(`${opts.out} lacks ${missing.join(", ")}`);
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(opts.out).arrayBuffer());
  const sha256 = hasher.digest("hex");
  writeFileSync(`${opts.out}.sha256`, `${sha256}  ${opts.out.split(/[\\/]/).pop()}\n`);
  return { out: opts.out, sha256 };
}

/** `wsl.exe` writes UTF-16LE when its output is not a console. */
async function wsl(args: string[], check = true): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["wsl.exe", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, WSL_UTF8: "1" },
  });
  const [out, err, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  const text = (out + err).replaceAll("\0", "").trim();
  if (check && code !== 0) throw new Error(`wsl ${args.join(" ")} exited with ${code}: ${text}`);
  return { code, out: text };
}

export async function install(file: string, name: string, location?: string): Promise<void> {
  const args = ["--install", "--from-file", file, "--name", name, "--no-launch"];
  // wsl.exe rejects a --location with forward slashes (exit 255, no message).
  if (location) args.push("--location", resolve(location));
  await wsl(args);
  const version = await wsl(["-d", name, "-u", "root", "--", "bun", "--version"]);
  console.log(`${name}: bun ${version.out}`);
  const bunsh = await wsl(["-d", name, "-u", "root", "--", "/bin/bunsh", "-c", "exit 0"], false);
  console.log(`${name}: bunsh -c 'exit 0' -> ${bunsh.code}${bunsh.code ? ` (${bunsh.out})` : ""}`);
}

if (import.meta.main) {
  const opts = parse(process.argv.slice(2));
  const { out, sha256 } = await build(opts);
  console.log(`${out}\nsha256 ${sha256}`);
  if (opts.install) {
    if (!existsSync(out)) throw new Error(`${out} missing`);
    await install(out, opts.install, opts.location);
  }
}
