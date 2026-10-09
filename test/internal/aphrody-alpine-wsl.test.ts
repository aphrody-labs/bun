import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DROPPED, REQUIRED, normalize, parse, tarFilter } from "../../scripts/aphrody/alpine/wsl.ts";

const ALPINE = join(import.meta.dir, "..", "..", "scripts", "aphrody", "alpine");
const OVERLAY = join(ALPINE, "wsl", "overlay");

function ini(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const s = /^\[(.+)\]$/.exec(line);
    if (s) {
      section = s[1];
      out[section] ??= {};
      continue;
    }
    const kv = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
    if (!kv || !section) throw new Error(`bad line: ${line}`);
    out[section][kv[1]] = kv[2];
  }
  return out;
}

function header(name: string, size: number, type = "0"): Uint8Array {
  const h = new Uint8Array(512);
  const enc = new TextEncoder();
  h.set(enc.encode(name).subarray(0, 100), 0);
  h.set(enc.encode("0000644\0"), 100);
  h.set(enc.encode(size.toString(8).padStart(11, "0") + "\0"), 124);
  h[156] = type.charCodeAt(0);
  h.set(enc.encode("ustar\0" + "00"), 257);
  return h;
}

function entry(name: string, data: string, type = "0"): Uint8Array[] {
  const bytes = new TextEncoder().encode(data);
  const padded = new Uint8Array(Math.ceil(bytes.length / 512) * 512);
  padded.set(bytes);
  return [header(name, bytes.length, type), padded];
}

async function filter(parts: Uint8Array[], chunk: number) {
  const all = Buffer.concat([...parts, new Uint8Array(1024)]);
  const seen = new Set<string>();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < all.length; i += chunk) c.enqueue(all.subarray(i, i + chunk));
      c.close();
    },
  }).pipeThrough(tarFilter(DROPPED, seen));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  return { out, seen };
}

describe("wsl.conf and wsl-distribution.conf", () => {
  const conf = ini(readFileSync(join(OVERLAY, "etc", "wsl.conf"), "utf8"));
  const dist = ini(readFileSync(join(OVERLAY, "etc", "wsl-distribution.conf"), "utf8"));
  // https://learn.microsoft.com/windows/wsl/wsl-config#wslconf
  const known: Record<string, string[]> = {
    boot: ["systemd", "command", "protectBinfmt", "initTimeout"],
    automount: ["enabled", "mountFsTab", "root", "options", "ldconfig", "cgroups"],
    network: ["generateHosts", "generateResolvConf", "hostname"],
    interop: ["enabled", "appendWindowsPath"],
    user: ["default"],
    gpu: ["enabled", "appendLibPath"],
    time: ["useWindowsTimezone"],
  };

  test("wsl.conf only uses documented keys and no systemd", () => {
    for (const [section, keys] of Object.entries(conf)) {
      expect(known[section]).toBeDefined();
      for (const key of Object.keys(keys)) expect(known[section]).toContain(key);
    }
    expect(conf.boot.systemd).toBe("false");
    expect(conf.automount.ldconfig).toBe("false");
  });

  test("boot and oobe commands exist in the overlay and are scripts", () => {
    for (const cmd of [conf.boot.command, dist.oobe.command]) {
      expect(cmd.startsWith("/usr/lib/wsl/")).toBe(false);
      const file = join(OVERLAY, ...cmd.split("/").filter(Boolean));
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8").startsWith("#!/bin/sh\n")).toBe(true);
      expect(statSync(file).isFile()).toBe(true);
    }
    expect(dist.oobe.defaultUid).toBe("1000");
    expect(dist.oobe.defaultName).toBe("AphrodyAlpine");
    expect(dist.shortcut.icon.endsWith(".ico")).toBe(true);
    expect(REQUIRED).toContain(dist.shortcut.icon.slice(1));
  });
});

describe("tarFilter", () => {
  test("drops WSL-generated files, keeps the rest byte for byte", async () => {
    const kept = [...entry("./etc/wsl.conf", "[boot]\n"), ...entry("usr/local/bin/bun", "x".repeat(700))];
    const parts = [...entry("etc/resolv.conf", "nameserver 1.1.1.1\n"), ...kept, ...entry(".dockerenv", "")];
    for (const chunk of [1, 100, 512, 4096]) {
      const { out, seen } = await filter(parts, chunk);
      expect([...seen]).toEqual(["etc/wsl.conf", "usr/local/bin/bun"]);
      expect(Buffer.from(out)).toEqual(Buffer.concat([...kept, new Uint8Array(1024)]));
    }
  });

  test("pax path records name the entry and are dropped with it", async () => {
    const pax = (path: string) => {
      const body = `${path.length + 7 + String(path.length + 7).length} path=${path}\n`;
      return entry("PaxHeaders/x", body, "x");
    };
    const long = "usr/share/" + "d".repeat(120) + "/file";
    const parts = [...pax("etc/hosts"), ...entry("etc/hosts", "127.0.0.1\n"), ...pax(long), ...entry("short", "y")];
    const { seen } = await filter(parts, 333);
    expect([...seen]).toEqual([long]);
  });

  test("normalize", () => {
    expect(normalize("./etc/wsl.conf")).toBe("etc/wsl.conf");
    expect(normalize("/usr/")).toBe("usr");
  });
});

test("parse defaults", () => {
  const o = parse(["--arch", "aarch64"]);
  expect(o.base).toBe("ghcr.io/aphrody-labs/alpine:3.24-runtime");
  expect(o.out.endsWith("aphrody-alpine-aarch64.wsl")).toBe(true);
  expect(() => parse(["--arch", "riscv64"])).toThrow();
});
