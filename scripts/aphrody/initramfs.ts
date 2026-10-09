// Builds a gzip newc initramfs whose PID 1 is Bun (chantier V (c)).
//
// /bin/bun is a Linux Bun binary (the musl build for Alpine). Every ELF put in
// the image (Bun and each --bin) has its interpreter and DT_NEEDED libraries
// resolved inside --sysroot, recursively, at their sysroot paths, so the image
// runs without a distribution. /init is scripts/aphrody/initramfs-init.ts,
// transpiled, behind a `#!/bin/bun` line; it reads /etc/bun-init.json for the
// workload. The kernel needs CONFIG_BINFMT_SCRIPT, CONFIG_DEVTMPFS and CONFIG_RD_GZIP.
//
//   bun scripts/aphrody/initramfs.ts --bun build/release/bun --sysroot /path/to/alpine-rootfs \
//     --bin /usr/bin/coreutils --app ./app --out build/initramfs.cpio.gz [--hostname aphrody] \
//     [--file host:/target]... [-- /bin/bun /app/index.ts]
//
// --bin takes a path inside --sysroot (kept at that path, with the symlinks
// leading to it) or a host file (installed as /bin/<name>).
//
// Boot it with `qemu-system-x86_64 -kernel bzImage -initrd build/initramfs.cpio.gz -append console=ttyS0 -nographic`.

import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";

export interface Entry {
  path: string;
  mode: number;
  data?: Uint8Array;
  rdev?: [number, number];
}

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;
const S_IFCHR = 0o020000;

export interface Options {
  bun: string;
  out: string;
  sysroot: string;
  app: string;
  bins: string[];
  files: [string, string][];
  hostname: string;
  gzip: boolean;
  argv: string[];
}

function usage(message: string): never {
  throw new UsageError(message);
}

class UsageError extends Error {}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    bun: "",
    out: "",
    sysroot: "/",
    app: "",
    bins: [],
    files: [],
    hostname: "aphrody",
    gzip: true,
    argv: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i] ?? usage(`${arg} needs a value`);
    switch (arg) {
      case "--bun":
        options.bun = value();
        break;
      case "--out":
        options.out = value();
        break;
      case "--sysroot":
        options.sysroot = value();
        break;
      case "--app":
        options.app = value();
        break;
      case "--bin":
        options.bins.push(value());
        break;
      case "--hostname":
        options.hostname = value();
        break;
      case "--file": {
        const spec = value();
        const at = spec.lastIndexOf(":/");
        if (at <= 0) usage(`--file expects host:/target, got ${spec}`);
        options.files.push([spec.slice(0, at), spec.slice(at + 1)]);
        break;
      }
      case "--no-gzip":
        options.gzip = false;
        break;
      case "--":
        options.argv = argv.slice(i + 1);
        i = argv.length;
        break;
      default:
        usage(`unknown argument ${arg}`);
    }
  }
  if (!options.bun) usage("--bun is required");
  if (!options.out) usage("--out is required");
  if (options.argv.length === 0) {
    options.argv = options.app ? ["/bin/bun", "/app/index.ts"] : ["/bin/bun", "repl"];
  }
  return options;
}

export interface ElfInfo {
  interp?: string;
  needed: string[];
  runpath: string[];
  machine: number;
}

// ELF64 little-endian: the interpreter (PT_INTERP), DT_NEEDED sonames and
// DT_RUNPATH (or DT_RPATH) directories.
export function elfDependencies(bytes: Uint8Array): ElfInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 64 || view.getUint32(0) !== 0x7f454c46) throw new Error("not an ELF file");
  if (bytes[4] !== 2 || bytes[5] !== 1) throw new Error("only ELF64 little-endian is supported");
  const machine = view.getUint16(0x12, true);
  const phoff = Number(view.getBigUint64(0x20, true));
  const phentsize = view.getUint16(0x36, true);
  const phnum = view.getUint16(0x38, true);
  const cstr = (offset: number) => {
    let end = offset;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return new TextDecoder().decode(bytes.subarray(offset, end));
  };

  let interp: string | undefined;
  let dynamic: [number, number] | undefined;
  const loads: { vaddr: number; offset: number; filesz: number }[] = [];
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    const type = view.getUint32(at, true);
    const offset = Number(view.getBigUint64(at + 8, true));
    const vaddr = Number(view.getBigUint64(at + 16, true));
    const filesz = Number(view.getBigUint64(at + 32, true));
    if (type === 1) loads.push({ vaddr, offset, filesz });
    else if (type === 2) dynamic = [offset, filesz];
    else if (type === 3) interp = cstr(offset);
  }
  if (!dynamic) return { interp, needed: [], runpath: [], machine };

  const toOffset = (vaddr: number) => {
    const load = loads.find(l => vaddr >= l.vaddr && vaddr < l.vaddr + l.filesz);
    if (!load) throw new Error(`address 0x${vaddr.toString(16)} is outside every PT_LOAD`);
    return vaddr - load.vaddr + load.offset;
  };
  let strtab = 0;
  const neededOffsets: number[] = [];
  let runpath: number | undefined;
  let rpath: number | undefined;
  for (let at = dynamic[0]; at + 16 <= dynamic[0] + dynamic[1]; at += 16) {
    const tag = Number(view.getBigInt64(at, true));
    const val = Number(view.getBigUint64(at + 8, true));
    if (tag === 0) break;
    if (tag === 1) neededOffsets.push(val);
    else if (tag === 5) strtab = toOffset(val);
    else if (tag === 15) rpath = val;
    else if (tag === 29) runpath = val;
  }
  const paths = runpath ?? rpath;
  return {
    interp,
    needed: neededOffsets.map(offset => cstr(strtab + offset)),
    runpath:
      paths === undefined
        ? []
        : cstr(strtab + paths)
            .split(":")
            .filter(Boolean),
    machine,
  };
}

// musl's loader serves these names itself (ldso/dynlink.c, `reserved`).
const MUSL_BUILTIN = /^lib(c|pthread|rt|m|dl|util|xnet)\.so(\.|$)/;

const MULTIARCH: Record<number, string> = { 62: "x86_64-linux-gnu", 183: "aarch64-linux-gnu" };

export interface SysrootFile {
  // Absolute path inside the sysroot / image, after following every symlink.
  path: string;
  // Symlinks crossed on the way, as image paths and their raw targets.
  links: [string, string][];
}

// Follows symlinks with the sysroot as `/`, so an absolute link such as
// /lib/libc.musl-x86_64.so.1 -> /lib/ld-musl-x86_64.so.1 never escapes to the host.
export function resolveInSysroot(sysroot: string, path: string): SysrootFile | undefined {
  const links: [string, string][] = [];
  let parts = path.split("/").filter(Boolean);
  for (let hops = 0; hops < 40; hops++) {
    let current = "";
    let restarted = false;
    for (let i = 0; i < parts.length; i++) {
      const next = current + "/" + parts[i];
      let stat;
      try {
        stat = lstatSync(join(sysroot, next));
      } catch {
        return undefined;
      }
      if (stat.isSymbolicLink()) {
        let target = readlinkSync(join(sysroot, next));
        // Windows stores `/bin/busybox` as `C:\bin\busybox`.
        if (process.platform === "win32")
          target = target.replace(/^(\\\\\?\\|\\\?\?\\)?[A-Za-z]:/, "").replaceAll("\\", "/");
        links.push([next, target]);
        const base = target.startsWith("/") ? [] : current.split("/").filter(Boolean);
        parts = posix.normalize([...base, ...target.split("/"), ...parts.slice(i + 1)].join("/")).split("/");
        parts = parts.filter(p => p && p !== "." && p !== "..");
        restarted = true;
        break;
      }
      current = next;
    }
    if (!restarted) {
      try {
        return statSync(join(sysroot, current)).isFile() ? { path: current, links } : undefined;
      } catch {
        return undefined;
      }
    }
  }
  throw new Error(`too many symlinks resolving ${path} in ${sysroot}`);
}

function searchDirs(sysroot: string, info: ElfInfo, origin: string): string[] {
  const dirs = info.runpath.map(dir => dir.replaceAll("$ORIGIN", origin).replaceAll("${ORIGIN}", origin));
  if (info.interp && posix.basename(info.interp).startsWith("ld-musl")) {
    const arch = posix
      .basename(info.interp)
      .replace(/^ld-musl-/, "")
      .replace(/\.so\.1$/, "");
    const pathFile = join(sysroot, "etc", `ld-musl-${arch}.path`);
    if (existsSync(pathFile)) dirs.push(...readFileSync(pathFile, "utf8").split(/[:\n]/).filter(Boolean));
    else dirs.push("/lib", "/usr/local/lib", "/usr/lib");
  } else {
    const triple = MULTIARCH[info.machine];
    if (triple) dirs.push(`/lib/${triple}`, `/usr/lib/${triple}`);
    dirs.push("/lib", "/usr/lib", "/lib64", "/usr/lib64", "/usr/local/lib");
  }
  return dirs;
}

class Tree {
  #entries = new Map<string, Entry>();

  dir(path: string, mode = 0o755) {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      const sub = parts.slice(0, i).join("/");
      if (!this.#entries.has(sub)) this.#entries.set(sub, { path: sub, mode: S_IFDIR | mode });
    }
  }

  has(path: string) {
    return this.#entries.has(path.replace(/^\/+/, ""));
  }

  file(path: string, data: Uint8Array, mode: number) {
    const rel = path.replace(/^\/+/, "");
    this.dir(posix.dirname(rel) === "." ? "" : posix.dirname(rel));
    this.#entries.set(rel, { path: rel, mode: S_IFREG | mode, data });
  }

  symlink(path: string, target: string) {
    const rel = path.replace(/^\/+/, "");
    this.dir(posix.dirname(rel) === "." ? "" : posix.dirname(rel));
    this.#entries.set(rel, { path: rel, mode: S_IFLNK | 0o777, data: new TextEncoder().encode(target) });
  }

  charDevice(path: string, mode: number, major: number, minor: number) {
    const rel = path.replace(/^\/+/, "");
    this.dir(posix.dirname(rel));
    this.#entries.set(rel, { path: rel, mode: S_IFCHR | mode, rdev: [major, minor] });
  }

  copyHostDir(host: string, target: string) {
    for (const name of readdirSync(host)) {
      const from = join(host, name);
      const to = posix.join(target, name);
      const stat = statSync(from);
      if (stat.isDirectory()) {
        this.dir(to.replace(/^\/+/, ""));
        this.copyHostDir(from, to);
      } else if (stat.isFile()) {
        this.file(to, readFileSync(from), process.platform === "win32" ? 0o644 : stat.mode & 0o777);
      }
    }
  }

  entries(): Entry[] {
    return [...this.#entries.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
}

// Adds an ELF already placed in the tree and, recursively, everything its
// loader will open: PT_INTERP, then each DT_NEEDED found in the sysroot.
function addElfDependencies(tree: Tree, sysroot: string, bytes: Uint8Array, imagePath: string, seen: Set<string>) {
  const info = elfDependencies(bytes);
  const musl = info.interp !== undefined && posix.basename(info.interp).startsWith("ld-musl");
  if (info.interp) addSysrootFile(tree, sysroot, info.interp, seen, false);
  const dirs = searchDirs(sysroot, info, posix.dirname(imagePath));
  for (const soname of info.needed) {
    if (musl && MUSL_BUILTIN.test(soname)) continue;
    const candidates = soname.includes("/") ? [soname] : dirs.map(dir => posix.join(dir, soname));
    if (!candidates.some(candidate => addSysrootFile(tree, sysroot, candidate, seen, true))) {
      throw new Error(`${soname} (needed by ${imagePath}) not found under ${sysroot}; pass --sysroot or --file`);
    }
  }
}

function addSysrootFile(tree: Tree, sysroot: string, path: string, seen: Set<string>, optional: boolean): boolean {
  const found = resolveInSysroot(sysroot, path);
  if (!found) {
    if (optional) return false;
    throw new Error(`${path} not found under ${sysroot}`);
  }
  for (const [link, target] of found.links) if (!tree.has(link)) tree.symlink(link, target);
  if (seen.has(found.path)) return true;
  seen.add(found.path);
  const bytes = readFileSync(join(sysroot, found.path));
  tree.file(found.path, bytes, 0o755);
  addElfDependencies(tree, sysroot, bytes, found.path, seen);
  return true;
}

export interface Built {
  entries: Entry[];
  interp?: string;
  files: number;
}

export function buildEntries(options: Options): Built {
  const tree = new Tree();
  const seen = new Set<string>();
  for (const dir of ["dev", "proc", "sys", "run", "tmp", "root", "etc", "bin"]) tree.dir(dir);
  tree.charDevice("/dev/console", 0o600, 5, 1);
  tree.charDevice("/dev/null", 0o666, 1, 3);

  const bun = readFileSync(resolve(options.bun));
  tree.file("/bin/bun", bun, 0o755);
  tree.symlink("/bin/bunx", "bun");
  seen.add("bin/bun");
  addElfDependencies(tree, options.sysroot, bun, "/bin/bun", seen);
  const { interp } = elfDependencies(bun);

  for (const bin of options.bins) {
    if (bin.startsWith("/") && resolveInSysroot(options.sysroot, bin)) {
      addSysrootFile(tree, options.sysroot, bin, seen, false);
    } else {
      const bytes = readFileSync(resolve(bin));
      const target = `/bin/${posix.basename(bin.replaceAll("\\", "/"))}`;
      tree.file(target, bytes, 0o755);
      addElfDependencies(tree, options.sysroot, bytes, target, seen);
    }
  }

  // /init has no extension, so Bun loads it as JavaScript: strip the types here.
  const init = new Bun.Transpiler({ loader: "ts", target: "bun" }).transformSync(
    readFileSync(join(import.meta.dir, "initramfs-init.ts"), "utf8"),
  );
  tree.file("/init", new TextEncoder().encode(`#!/bin/bun\n${init}`), 0o755);
  const config = { argv: options.argv, cwd: options.app ? "/app" : "/", hostname: options.hostname || undefined };
  tree.file("/etc/bun-init.json", new TextEncoder().encode(JSON.stringify(config, null, 2) + "\n"), 0o644);
  if (options.hostname) tree.file("/etc/hostname", new TextEncoder().encode(options.hostname + "\n"), 0o644);
  if (options.app) {
    tree.dir("app");
    tree.copyHostDir(resolve(options.app), "/app");
  }
  for (const [host, target] of options.files) tree.file(target, readFileSync(host), 0o755);

  const entries = tree.entries();
  return { entries, interp, files: entries.filter(e => (e.mode & S_IFMT) === S_IFREG).length };
}

// newc (SVR4 without CRC): a 110-byte ASCII header, the NUL-terminated name and
// the data, each padded to 4 bytes.
export function newc(entries: Entry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const pad = (length: number) => new Uint8Array((4 - (length % 4)) % 4);
  let ino = 1;
  const push = (path: string, mode: number, data: Uint8Array, rdev: [number, number]) => {
    const name = encoder.encode(path + "\0");
    const nlink = (mode & S_IFMT) === S_IFDIR ? 2 : 1;
    const fields = [ino++, mode, 0, 0, nlink, 0, data.length, 0, 0, rdev[0], rdev[1], name.length, 0];
    const header = encoder.encode("070701" + fields.map(hex).join(""));
    chunks.push(header, name, pad(header.length + name.length), data, pad(data.length));
  };
  for (const entry of entries) {
    push(entry.path, entry.mode, entry.data ?? new Uint8Array(0), entry.rdev ?? [0, 0]);
  }
  push("TRAILER!!!", 0, new Uint8Array(0), [0, 0]);
  return Buffer.concat(chunks);
}

if (import.meta.main) {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`initramfs: ${error.message}`);
    console.error(
      "usage: bun scripts/aphrody/initramfs.ts --bun <linux bun> --out <file.cpio.gz> [--sysroot <dir>] [--bin <elf>]... [--app <dir>] [--hostname <name>] [--file host:/target]... [--no-gzip] [-- argv...]",
    );
    process.exit(2);
  }
  const built = buildEntries(options);
  const archive = newc(built.entries);
  const output = options.gzip ? Bun.gzipSync(archive, { level: 9 }) : archive;
  await Bun.write(options.out, output);
  console.log(
    `initramfs: ${options.out} (${(output.length / 1048576).toFixed(1)} MiB, interpreter ${built.interp ?? "none"}, ${built.files} files)`,
  );
}
