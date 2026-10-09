// Builds a gzip newc initramfs whose PID 1 is Bun (chantier V (c)).
//
// /bin/bun is a Linux Bun binary (the musl build for Alpine); its ELF
// interpreter and DT_NEEDED libraries are copied from --sysroot so the image
// runs without a distribution. /init is scripts/aphrody/initramfs-init.ts,
// transpiled, behind a `#!/bin/bun` line; it reads /etc/bun-init.json for the
// workload. The kernel needs CONFIG_BINFMT_SCRIPT, CONFIG_DEVTMPFS and CONFIG_RD_GZIP.
//
//   bun scripts/aphrody/initramfs.ts --bun build/release/bun --sysroot /path/to/alpine-rootfs \
//     --app ./app --out build/initramfs.cpio.gz [--file host:/target]... [-- /bin/bun /app/index.ts]
//
// Boot it with `qemu-system-x86_64 -kernel bzImage -initrd build/initramfs.cpio.gz -append console=ttyS0 -nographic`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";

interface Entry {
  path: string;
  mode: number;
  data?: Uint8Array;
  rdev?: [number, number];
}

const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;
const S_IFCHR = 0o020000;

function usage(message: string): never {
  console.error(`initramfs: ${message}`);
  console.error(
    "usage: bun scripts/aphrody/initramfs.ts --bun <linux bun> --out <file.cpio.gz> [--sysroot <dir>] [--app <dir>] [--file host:/target]... [--no-gzip] [-- argv...]",
  );
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const options = {
    bun: "",
    out: "",
    sysroot: "/",
    app: "",
    files: [] as [string, string][],
    gzip: true,
    argv: [] as string[],
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

// ELF64 little-endian: the interpreter (PT_INTERP) and DT_NEEDED sonames.
export function elfDependencies(bytes: Uint8Array): { interp?: string; needed: string[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x7f454c46) throw new Error("not an ELF file");
  if (bytes[4] !== 2 || bytes[5] !== 1) throw new Error("only ELF64 little-endian is supported");
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
  if (!dynamic) return { interp, needed: [] };

  const toOffset = (vaddr: number) => {
    const load = loads.find(l => vaddr >= l.vaddr && vaddr < l.vaddr + l.filesz);
    if (!load) throw new Error(`address 0x${vaddr.toString(16)} is outside every PT_LOAD`);
    return vaddr - load.vaddr + load.offset;
  };
  let strtab = 0;
  const neededOffsets: number[] = [];
  for (let at = dynamic[0]; at + 16 <= dynamic[0] + dynamic[1]; at += 16) {
    const tag = Number(view.getBigInt64(at, true));
    const val = Number(view.getBigUint64(at + 8, true));
    if (tag === 0) break;
    if (tag === 1) neededOffsets.push(val);
    else if (tag === 5) strtab = toOffset(val);
  }
  return { interp, needed: neededOffsets.map(offset => cstr(strtab + offset)) };
}

function findLibrary(sysroot: string, soname: string): string {
  for (const dir of ["lib", "usr/lib", "lib64", "usr/lib64", "usr/local/lib"]) {
    const candidate = join(sysroot, dir, soname);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  throw new Error(`${soname} not found under ${sysroot}; pass --sysroot or --file`);
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
    const nlink = (mode & 0o170000) === S_IFDIR ? 2 : 1;
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

class Tree {
  #entries = new Map<string, Entry>();

  dir(path: string, mode = 0o755) {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      const sub = parts.slice(0, i).join("/");
      if (!this.#entries.has(sub)) this.#entries.set(sub, { path: sub, mode: S_IFDIR | mode });
    }
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

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2));
  const tree = new Tree();
  for (const dir of ["dev", "proc", "sys", "run", "tmp", "root", "etc", "bin"]) tree.dir(dir);
  tree.charDevice("/dev/console", 0o600, 5, 1);
  tree.charDevice("/dev/null", 0o666, 1, 3);

  const bun = readFileSync(resolve(options.bun));
  tree.file("/bin/bun", bun, 0o755);
  tree.symlink("/bin/bunx", "bun");

  const { interp, needed } = elfDependencies(bun);
  if (interp) tree.file(interp, readFileSync(join(options.sysroot, interp)), 0o755);
  for (const soname of needed) {
    // musl's libc.so is the interpreter itself.
    if (interp && posix.basename(interp).startsWith("ld-musl") && soname === "libc.so") continue;
    tree.file(`/lib/${soname}`, readFileSync(findLibrary(options.sysroot, soname)), 0o755);
  }

  // /init has no extension, so Bun loads it as JavaScript: strip the types here.
  const init = new Bun.Transpiler({ loader: "ts", target: "bun" }).transformSync(
    readFileSync(join(import.meta.dir, "initramfs-init.ts"), "utf8"),
  );
  tree.file("/init", new TextEncoder().encode(`#!/bin/bun\n${init}`), 0o755);
  tree.file(
    "/etc/bun-init.json",
    new TextEncoder().encode(JSON.stringify({ argv: options.argv, cwd: options.app ? "/app" : "/" }, null, 2) + "\n"),
    0o644,
  );
  if (options.app) {
    tree.dir("app");
    tree.copyHostDir(resolve(options.app), "/app");
  }
  for (const [host, target] of options.files) tree.file(target, readFileSync(host), 0o755);

  const archive = newc(tree.entries());
  const output = options.gzip ? Bun.gzipSync(archive, { level: 9 }) : archive;
  await Bun.write(options.out, output);
  console.log(
    `initramfs: ${options.out} (${(output.length / 1048576).toFixed(1)} MiB, interpreter ${interp ?? "none"}, ${needed.length} libraries)`,
  );
}
