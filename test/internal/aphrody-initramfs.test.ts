import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildEntries, elfDependencies, newc, parseArgs, resolveInSysroot } from "../../scripts/aphrody/initramfs";
import {
  addressPayload,
  defaultRoutePayload,
  DHCP,
  encodeDhcp,
  hostsFile,
  linkUpPayload,
  parseDhcp,
  prefixFromMask,
  resolvConf,
} from "../../scripts/aphrody/initramfs-net";

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;
const S_IFCHR = 0o020000;

// A minimal ELF64 LE x86_64 file: one PT_LOAD over the whole file, plus
// PT_INTERP and PT_DYNAMIC (DT_NEEDED, DT_RUNPATH, DT_STRTAB) when asked.
function makeElf(opts: { interp?: string; needed?: string[]; runpath?: string } = {}): Uint8Array {
  const base = 0x400000;
  const phnum = 1 + (opts.interp ? 1 : 0) + 1;
  const interpOff = 64 + phnum * 56;
  const interp = opts.interp ? new TextEncoder().encode(opts.interp + "\0") : new Uint8Array(0);
  const strings = ["", ...(opts.needed ?? []), ...(opts.runpath ? [opts.runpath] : [])];
  const strtab: number[] = [];
  const index = new Map<string, number>();
  for (const s of strings) {
    index.set(s, strtab.length);
    strtab.push(...new TextEncoder().encode(s), 0);
  }
  const strOff = interpOff + interp.length;
  const dynOff = Math.ceil((strOff + strtab.length) / 8) * 8;
  const dyn: [number, number][] = [
    ...(opts.needed ?? []).map(n => [1, index.get(n)!] as [number, number]),
    ...(opts.runpath ? [[29, index.get(opts.runpath)!] as [number, number]] : []),
    [5, base + strOff],
    [0, 0],
  ];
  const size = dynOff + dyn.length * 16;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  view.setUint16(0x10, 3, true);
  view.setUint16(0x12, 62, true);
  view.setUint32(0x14, 1, true);
  view.setBigUint64(0x20, 64n, true);
  view.setUint16(0x34, 64, true);
  view.setUint16(0x36, 56, true);
  view.setUint16(0x38, phnum, true);
  let ph = 64;
  const phdr = (type: number, offset: number, filesz: number) => {
    view.setUint32(ph, type, true);
    view.setBigUint64(ph + 8, BigInt(offset), true);
    view.setBigUint64(ph + 16, BigInt(base + offset), true);
    view.setBigUint64(ph + 32, BigInt(filesz), true);
    view.setBigUint64(ph + 40, BigInt(filesz), true);
    ph += 56;
  };
  phdr(1, 0, size);
  if (opts.interp) phdr(3, interpOff, interp.length);
  phdr(2, dynOff, dyn.length * 16);
  bytes.set(interp, interpOff);
  bytes.set(strtab, strOff);
  dyn.forEach(([tag, val], i) => {
    view.setBigInt64(dynOff + i * 16, BigInt(tag), true);
    view.setBigUint64(dynOff + i * 16 + 8, BigInt(val), true);
  });
  return bytes;
}

interface Read {
  path: string;
  mode: number;
  rdev: [number, number];
  data: Uint8Array;
}

// Reads a newc archive back, checking the magic and the 4-byte padding.
function readNewc(archive: Uint8Array): Read[] {
  const out: Read[] = [];
  const text = new TextDecoder();
  let at = 0;
  for (;;) {
    const header = text.decode(archive.subarray(at, at + 110));
    expect(header.slice(0, 6)).toBe("070701");
    const field = (i: number) => parseInt(header.slice(6 + i * 8, 14 + i * 8), 16);
    const namesize = field(11);
    const filesize = field(6);
    const path = text.decode(archive.subarray(at + 110, at + 110 + namesize - 1));
    at += 110 + namesize;
    at += (4 - (at % 4)) % 4;
    const data = archive.slice(at, at + filesize);
    at += filesize;
    at += (4 - (at % 4)) % 4;
    if (path === "TRAILER!!!") break;
    out.push({ path, mode: field(1), rdev: [field(9), field(10)], data });
  }
  expect(at).toBe(archive.length);
  return out;
}

// An Alpine-shaped sysroot: musl loader with its libc.musl symlink, libstdc++
// behind a soname link, a $ORIGIN runpath and an absolute /bin/sh link.
function alpineSysroot(dir: string) {
  const write = (path: string, data: Uint8Array) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), data);
  };
  const link = (path: string, target: string) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    symlinkSync(target, join(dir, path), "file");
  };
  const musl = "/lib/ld-musl-x86_64.so.1";
  write("lib/ld-musl-x86_64.so.1", makeElf());
  link("lib/libc.musl-x86_64.so.1", "ld-musl-x86_64.so.1");
  write("usr/lib/libstdc++.so.6.0.34", makeElf({ needed: ["libgcc_s.so.1", "libc.musl-x86_64.so.1"] }));
  link("usr/lib/libstdc++.so.6", "libstdc++.so.6.0.34");
  write("usr/lib/libgcc_s.so.1", makeElf({ needed: ["libc.musl-x86_64.so.1"] }));
  write("usr/lib/tool/libfoo.so.1", makeElf({ needed: ["libc.musl-x86_64.so.1"] }));
  write(
    "usr/bin/tool",
    makeElf({
      interp: musl,
      needed: ["libfoo.so.1", "libc.musl-x86_64.so.1"],
      runpath: "$ORIGIN/../lib/tool",
    }),
  );
  write("bin/busybox", makeElf({ interp: musl, needed: ["libc.musl-x86_64.so.1"] }));
  link("bin/sh", "/bin/busybox");
  write("bun", makeElf({ interp: musl, needed: ["libc.so", "libstdc++.so.6", "libpthread.so.0"] }));
}

describe("aphrody initramfs", () => {
  test("reads PT_INTERP, DT_NEEDED and DT_RUNPATH", () => {
    const info = elfDependencies(
      makeElf({
        interp: "/lib/ld-musl-x86_64.so.1",
        needed: ["libc.so", "libz.so.1"],
        runpath: "$ORIGIN/lib",
      }),
    );
    expect(info).toEqual({
      interp: "/lib/ld-musl-x86_64.so.1",
      needed: ["libc.so", "libz.so.1"],
      runpath: ["$ORIGIN/lib"],
      machine: 62,
    });
    expect(() => elfDependencies(new Uint8Array(64))).toThrow("not an ELF file");
  });

  test("symlinks resolve inside the sysroot", () => {
    using dir = tempDir("aphrody-initramfs-links", {});
    alpineSysroot(String(dir));
    expect(resolveInSysroot(String(dir), "/bin/sh")).toEqual({
      path: "/bin/busybox",
      links: [["/bin/sh", "/bin/busybox"]],
    });
    expect(resolveInSysroot(String(dir), "/usr/lib/libstdc++.so.6")?.path).toBe("/usr/lib/libstdc++.so.6.0.34");
    expect(resolveInSysroot(String(dir), "/lib/missing.so")).toBeUndefined();
  });

  test("--bin pulls the loader and every DT_NEEDED, recursively", () => {
    using dir = tempDir("aphrody-initramfs-deps", {});
    alpineSysroot(String(dir));
    const options = parseArgs([
      "--bun",
      join(String(dir), "bun"),
      "--sysroot",
      String(dir),
      "--bin",
      "/usr/bin/tool",
      "--bin",
      "/bin/sh",
      "--hostname",
      "vm1",
      "--ip",
      "10.0.2.15/24",
      "--gateway",
      "10.0.2.2",
      "--dns",
      "10.0.2.3",
      "--module",
      "/usr/lib/tool/libfoo.so.1",
      "--out",
      "unused",
    ]);
    const { entries, interp } = buildEntries(options);
    expect(interp).toBe("/lib/ld-musl-x86_64.so.1");
    const kind = (mode: number) =>
      ({ [S_IFREG]: "file", [S_IFLNK]: "link", [S_IFCHR]: "char" })[mode & S_IFMT] ?? "dir";
    const listing = entries
      .filter(e => kind(e.mode) !== "dir")
      .map(e => `${kind(e.mode)} ${e.path}${kind(e.mode) === "link" ? ` -> ${new TextDecoder().decode(e.data)}` : ""}`);
    expect(listing).toEqual([
      "file bin/bun",
      "link bin/bunx -> bun",
      "file bin/busybox",
      "link bin/sh -> /bin/busybox",
      "char dev/console",
      "char dev/null",
      "file etc/bun-init.json",
      "file etc/hostname",
      "file init",
      "file initramfs-net.ts",
      "file lib/ld-musl-x86_64.so.1",
      "link lib/libc.musl-x86_64.so.1 -> ld-musl-x86_64.so.1",
      "file lib/modules/libfoo.so.1",
      "file usr/bin/tool",
      "file usr/lib/libgcc_s.so.1",
      "link usr/lib/libstdc++.so.6 -> libstdc++.so.6.0.34",
      "file usr/lib/libstdc++.so.6.0.34",
      "file usr/lib/tool/libfoo.so.1",
    ]);
    const json = entries.find(e => e.path === "etc/bun-init.json")!;
    expect(JSON.parse(new TextDecoder().decode(json.data))).toEqual({
      argv: ["/bin/bun", "repl"],
      cwd: "/",
      hostname: "vm1",
      network: { address: "10.0.2.15/24", gateway: "10.0.2.2", dns: ["10.0.2.3"] },
      modules: ["/lib/modules/libfoo.so.1"],
    });
    const init = new TextDecoder().decode(entries.find(e => e.path === "init")!.data);
    expect(init).toStartWith("#!/bin/bun\n");
    expect(init).toContain("/proc/sys/kernel/hostname");
    expect(init).toContain('from "./initramfs-net.ts"');
  });

  test("a library missing from the sysroot is an error", () => {
    using dir = tempDir("aphrody-initramfs-missing", {});
    alpineSysroot(String(dir));
    writeFileSync(
      join(String(dir), "lonely"),
      makeElf({ interp: "/lib/ld-musl-x86_64.so.1", needed: ["libnope.so.2"] }),
    );
    const options = parseArgs(["--bun", join(String(dir), "bun"), "--sysroot", String(dir), "--out", "x"]);
    options.bins.push(join(String(dir), "lonely"));
    expect(() => buildEntries(options)).toThrow("libnope.so.2 (needed by /bin/lonely) not found");
  });

  test("the CLI writes a gzip newc archive that reads back", async () => {
    using dir = tempDir("aphrody-initramfs-cli", { "app/index.ts": "console.log('hi')\n" });
    alpineSysroot(String(dir));
    const out = join(String(dir), "initramfs.cpio.gz");
    await using proc = Bun.spawn({
      cmd: [
        bunExe(),
        join(import.meta.dir, "../../scripts/aphrody/initramfs.ts"),
        "--bun",
        join(String(dir), "bun"),
        "--sysroot",
        String(dir),
        "--bin",
        "/bin/sh",
        "--app",
        join(String(dir), "app"),
        "--env",
        "PORT=3000",
        "--env",
        "MOTD=a=b",
        "--argv0",
        "server",
        "--out",
        out,
      ],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toBe("");
    expect(stdout).toContain("interpreter /lib/ld-musl-x86_64.so.1");
    expect(exitCode).toBe(0);

    const read = readNewc(Bun.gunzipSync(await Bun.file(out).bytes()));
    const byPath = new Map(read.map(e => [e.path, e]));
    expect(new TextDecoder().decode(byPath.get("app/index.ts")!.data)).toBe("console.log('hi')\n");
    expect(byPath.get("dev/console")!.rdev).toEqual([5, 1]);
    expect(byPath.get("bin/sh")!.mode).toBe(S_IFLNK | 0o777);
    expect(byPath.get("init")!.mode).toBe(S_IFREG | 0o755);
    expect(JSON.parse(new TextDecoder().decode(byPath.get("etc/bun-init.json")!.data))).toEqual({
      argv: ["/bin/bun", "/app/index.ts"],
      argv0: "server",
      env: { PORT: "3000", MOTD: "a=b" },
      cwd: "/app",
      hostname: "aphrody",
    });
    expect(readNewc(newc([]))).toEqual([]);
  });
});

// A BOOTREPLY as a DHCP server sends it: yiaddr, then the options.
function dhcpReply(type: number, xid: number, options: [number, number[]][]): Uint8Array {
  const out = new Uint8Array(300);
  const view = new DataView(out.buffer);
  out[0] = 2;
  view.setUint32(4, xid);
  out.set([10, 0, 2, 15], 16);
  view.setUint32(236, 0x63825363);
  let at = 240;
  for (const [code, data] of [[53, [type]], ...options] as [number, number[]][]) {
    out[at++] = code;
    out[at++] = data.length;
    out.set(data, at);
    at += data.length;
  }
  out[at] = 255;
  return out;
}

describe("initramfs network", () => {
  test("rtnetlink payloads: link up, address, default route", () => {
    expect(Array.from(linkUpPayload(2))).toEqual([0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    // ifaddrmsg (AF_INET, /24, index 2), then IFA_LOCAL, IFA_ADDRESS, IFA_BROADCAST.
    expect(Array.from(addressPayload(2, Uint8Array.of(10, 0, 2, 15), 24))).toEqual([
      2, 24, 0, 0, 2, 0, 0, 0, 8, 0, 2, 0, 10, 0, 2, 15, 8, 0, 1, 0, 10, 0, 2, 15, 8, 0, 4, 0, 10, 0, 2, 255,
    ]);
    // rtmsg (AF_INET, main table, RTPROT_BOOT, universe, unicast), RTA_OIF, RTA_GATEWAY.
    expect(Array.from(defaultRoutePayload(2, Uint8Array.of(10, 0, 2, 2)))).toEqual([
      2, 0, 0, 0, 254, 3, 0, 1, 0, 0, 0, 0, 8, 0, 4, 0, 2, 0, 0, 0, 8, 0, 5, 0, 10, 0, 2, 2,
    ]);
    // Without a gateway the route is on-link (RT_SCOPE_LINK), as used for the DHCP broadcasts.
    expect(Array.from(defaultRoutePayload(3))).toEqual([
      2, 0, 0, 0, 254, 3, 253, 1, 0, 0, 0, 0, 8, 0, 4, 0, 3, 0, 0, 0,
    ]);
  });

  test("DHCP request encoding and reply parsing", () => {
    const mac = Uint8Array.of(0x52, 0x54, 0, 0x12, 0x34, 0x56);
    const request = encodeDhcp({
      type: DHCP.REQUEST,
      xid: 0x01020304,
      mac,
      requested: Uint8Array.of(10, 0, 2, 15),
      server: Uint8Array.of(10, 0, 2, 2),
      hostname: "vm1",
    });
    const view = new DataView(request.buffer);
    expect([request[0], request[1], request[2], view.getUint32(4), view.getUint16(10)]).toEqual([
      1, 1, 6, 0x01020304, 0x8000,
    ]);
    expect(Array.from(request.subarray(28, 34))).toEqual(Array.from(mac));
    expect(view.getUint32(236)).toBe(0x63825363);
    expect(Array.from(request.subarray(240, 270))).toEqual([
      53, 1, 3, 61, 7, 1, 0x52, 0x54, 0, 0x12, 0x34, 0x56, 50, 4, 10, 0, 2, 15, 54, 4, 10, 0, 2, 2, 12, 3, 118, 109, 49,
      55,
    ]);
    // A client's own request is not a reply.
    expect(parseDhcp(request)).toBeUndefined();

    const ack = dhcpReply(DHCP.ACK, 0x01020304, [
      [1, [255, 255, 255, 0]],
      [3, [10, 0, 2, 2]],
      [6, [10, 0, 2, 3, 1, 1, 1, 1]],
      [51, [0, 0, 0x0e, 0x10]],
      [54, [10, 0, 2, 2]],
    ]);
    expect(parseDhcp(ack)).toEqual({
      type: DHCP.ACK,
      xid: 0x01020304,
      address: "10.0.2.15",
      mask: "255.255.255.0",
      router: "10.0.2.2",
      dns: ["10.0.2.3", "1.1.1.1"],
      server: "10.0.2.2",
      leaseSeconds: 3600,
    });
    expect(prefixFromMask(Uint8Array.of(255, 255, 240, 0))).toBe(20);
  });

  test("--ip dhcp, resolv.conf and hosts", () => {
    const options = parseArgs(["--bun", "b", "--out", "o", "--ip", "dhcp", "--interface", "enp0s3"]);
    expect(options.network).toEqual({ interface: "enp0s3" });
    expect(parseArgs(["--bun", "b", "--out", "o", "--ip", "192.168.1.9"]).network).toEqual({
      address: "192.168.1.9/24",
    });
    expect(() => parseArgs(["--bun", "b", "--out", "o", "--ip", "10.0.2/24"])).toThrow("invalid IPv4 address");
    expect(parseArgs(["--bun", "b", "--out", "o"]).network).toBeUndefined();
    expect(() => parseArgs(["--bun", "b", "--out", "o", "--env", "=x"])).toThrow("--env expects KEY=value");
    expect(resolvConf(["10.0.2.3", "1.1.1.1"])).toBe("nameserver 10.0.2.3\nnameserver 1.1.1.1\n");
    expect(hostsFile("vm1")).toBe("127.0.0.1\tlocalhost vm1\n::1\tlocalhost\n");
  });
});
