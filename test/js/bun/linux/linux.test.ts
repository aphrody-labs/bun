import linux from "bun:linux";
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { bunEnv, bunExe, isLinux, tempDir } from "harness";

const isRoot = isLinux && process.getuid?.() === 0;
const hasSysAdmin =
  isLinux && (linux.capabilities.get().effective & (1n << BigInt(linux.constants.CAP_SYS_ADMIN))) !== 0n;

function cgroupWritable(): boolean {
  try {
    fs.accessSync("/sys/fs/cgroup/cgroup.controllers", fs.constants.R_OK);
    fs.accessSync("/sys/fs/cgroup", fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe.skipIf(isLinux)("non-Linux", () => {
  test("reports unsupported and throws", () => {
    expect(linux.isSupported).toBe(false);
    expect(() => linux.memfdCreate("x")).toThrow();
    expect(() => linux.sysctl.get("kernel.ostype")).toThrow();
  });
});

describe.skipIf(!isLinux)("bun:linux", () => {
  test("isSupported and constants", () => {
    expect(linux.isSupported).toBe(true);
    expect(linux.constants.CLONE_NEWNS).toBe(0x20000);
    expect(linux.constants.CLONE_NEWNET).toBe(0x40000000);
    expect(linux.constants.MS_BIND).toBe(4096);
    expect(linux.constants.CAP_SYS_ADMIN).toBe(21);
    expect(linux.constants.MFD_CLOEXEC).toBe(1);
    expect(Object.isFrozen(linux.constants)).toBe(true);
  });

  test("memfdCreate round-trips data through fs", () => {
    const fd = linux.memfdCreate("bun-linux-test");
    try {
      expect(fd).toBeGreaterThan(2);
      expect(fs.writeSync(fd, "hello memfd")).toBe(11);
      const buffer = Buffer.alloc(11);
      expect(fs.readSync(fd, buffer, 0, 11, 0)).toBe(11);
      expect(buffer.toString()).toBe("hello memfd");
    } finally {
      fs.closeSync(fd);
    }
  });

  test("pidfdOpen and pidfdSendSignal kill a child", async () => {
    await using proc = Bun.spawn({
      cmd: [bunExe(), "-e", "setInterval(() => {}, 1000)"],
      env: bunEnv,
      stdout: "ignore",
      stderr: "ignore",
    });
    const fd = linux.pidfdOpen(proc.pid);
    try {
      expect(fd).toBeGreaterThan(2);
      linux.pidfdSendSignal(fd, "SIGKILL");
      await proc.exited;
      expect(proc.signalCode).toBe("SIGKILL");
    } finally {
      fs.closeSync(fd);
    }
  });

  test("pidfdOpen rejects a missing process", () => {
    expect(errorCode(() => linux.pidfdOpen(2147483647))).toBe("ESRCH");
  });

  test("capabilities.get returns bigint sets", () => {
    const sets = linux.capabilities.get();
    expect(typeof sets.effective).toBe("bigint");
    expect(typeof sets.permitted).toBe("bigint");
    expect(typeof sets.inheritable).toBe("bigint");
    expect(sets.effective & ~sets.permitted).toBe(0n);
  });

  test("sysctl.get reads kernel.ostype", () => {
    expect(linux.sysctl.get("kernel.ostype")).toBe("Linux");
  });

  test("sysctl rejects bad names", () => {
    for (const name of ["", "..", "kernel/ostype", "kernel..ostype", ".kernel", "kernel.", "../etc/passwd"]) {
      expect(() => linux.sysctl.get(name)).toThrow();
      expect(() => linux.sysctl.set(name, "1")).toThrow();
    }
  });

  test("landlock.abiVersion is a non-negative integer", () => {
    const version = linux.landlock.abiVersion();
    expect(Number.isInteger(version)).toBe(true);
    expect(version).toBeGreaterThanOrEqual(0);
  });

  test("ioUring.probe has the documented shape", () => {
    const result = linux.ioUring.probe();
    expect(typeof result.supported).toBe("boolean");
    expect(Array.isArray(result.ops)).toBe(true);
    if (!result.supported) expect(result.ops).toEqual([]);
    for (const op of result.ops) expect(Number.isInteger(op)).toBe(true);
  });

  test("prctl reads no-new-privs", () => {
    expect([0, 1]).toContain(linux.prctl(linux.constants.PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0));
  });

  test("cgroup.current returns a string or null", () => {
    const current = linux.cgroup.current();
    expect(current === null || typeof current === "string").toBe(true);
  });

  test("argument validation throws", () => {
    expect(() => linux.unshare("1" as any)).toThrow();
    expect(() => linux.unshare(-1)).toThrow();
    expect(() => linux.setns(-1)).toThrow();
    expect(() => linux.mount(1 as any, "/x", null)).toThrow();
    expect(() => linux.mount(null, 1 as any, null)).toThrow();
    expect(() => linux.pivotRoot("/a", 1 as any)).toThrow();
    expect(() => linux.pidfdOpen(0)).toThrow();
    expect(() => linux.pidfdSendSignal(3, "SIGNOPE" as any)).toThrow();
    expect(() => linux.memfdCreate(1 as any)).toThrow();
    expect(() => linux.capabilities.dropBounding(-1)).toThrow();
    expect(() => linux.prctl("x" as any)).toThrow();
    expect(() => linux.prctl(1, 1.5)).toThrow();
    expect(() => linux.reboot(12345)).toThrow();
    expect(() => linux.finitModule({} as any)).toThrow();
    expect(() => linux.initModule(new ArrayBuffer(1) as any)).toThrow();
    expect(() => linux.landlock.restrictSelf({ readOnly: "/tmp" as any })).toThrow();
  });

  test("cgroup argument validation throws before any I/O", () => {
    expect(() => linux.cgroup.create("../escape")).toThrow();
    expect(() => linux.cgroup.create("a/../b")).toThrow();
    expect(() => linux.cgroup.create("")).toThrow();
    expect(() => linux.cgroup.remove("/")).toThrow();
    expect(() => linux.cgroup.read("a/../../b", "memory.current")).toThrow();
    expect(() => linux.cgroup.create("ok", { bogus: 1 } as any)).toThrow();
    expect(() => linux.cgroup.create("ok", { memoryMax: -1 })).toThrow();
    expect(() => linux.cgroup.create("ok", { pidsMax: "lots" as any })).toThrow();
    expect(() => linux.cgroup.create("ok", { cpuWeight: 0 })).toThrow();
    expect(() => linux.cgroup.create("ok", { cpuMax: 0 })).toThrow();
    expect(() => linux.cgroup.create("ok", { cpuMax: "fast" })).toThrow();
  });

  test.skipIf(isRoot || hasSysAdmin)("mount and pivotRoot fail with EPERM without privileges", () => {
    using dir = tempDir("bun-linux-eperm", { "a/.keep": "", "b/.keep": "" });
    expect(errorCode(() => linux.mount("tmpfs", String(dir), "tmpfs"))).toBe("EPERM");
    expect(errorCode(() => linux.pivotRoot(`${dir}/a`, `${dir}/b`))).toBe("EPERM");
  });

  test.skipIf(isRoot)("reboot without privileges fails with EPERM", () => {
    expect(errorCode(() => linux.reboot(linux.constants.RB_DISABLE_CAD))).toBe("EPERM");
  });
});

describe.skipIf(!isRoot)("bun:linux as root", () => {
  test.skipIf(!hasSysAdmin).concurrent("unshare(CLONE_NEWNS) isolates a tmpfs mount", async () => {
    using dir = tempDir("bun-linux-mount", { "mnt/.keep": "" });
    const mnt = `${dir}/mnt`;
    const script = `
      import linux from "bun:linux";
      import fs from "node:fs";
      const { CLONE_NEWNS, MS_REC, MS_PRIVATE } = linux.constants;
      const mnt = ${JSON.stringify(mnt)};
      linux.unshare(CLONE_NEWNS);
      linux.mount(null, "/", null, MS_REC | MS_PRIVATE);
      linux.mount("tmpfs", mnt, "tmpfs", 0, "size=1m");
      fs.writeFileSync(mnt + "/file", "inside");
      console.log(fs.readFileSync(mnt + "/file", "utf8"));
      linux.umount(mnt);
      console.log(fs.existsSync(mnt + "/file"));
    `;
    await using proc = Bun.spawn({
      cmd: [bunExe(), "-e", script],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toBe("");
    expect(stdout).toBe("inside\nfalse\n");
    expect(exitCode).toBe(0);
    expect(fs.existsSync(`${mnt}/file`)).toBe(false);
  });

  test.skipIf(!cgroupWritable())("cgroup create, limits, attach and remove", async () => {
    const name = `bun-linux-test-${process.pid}`;
    const path = linux.cgroup.create(name, { pidsMax: 100, memoryMax: "max" });
    try {
      expect(path).toBe(`/sys/fs/cgroup/${name}`);
      expect(fs.existsSync(path)).toBe(true);
      expect(linux.cgroup.read(name, "pids.max").trim()).toBe("100");

      linux.cgroup.setLimits(name, { pidsMax: 50 });
      expect(linux.cgroup.read(path, "pids.max").trim()).toBe("50");

      await using proc = Bun.spawn({
        cmd: [bunExe(), "-e", "setInterval(() => {}, 1000)"],
        env: bunEnv,
        stdout: "ignore",
        stderr: "ignore",
      });
      linux.cgroup.attach(name, proc.pid);
      expect(linux.cgroup.current(proc.pid)).toBe(`/${name}`);
      proc.kill("SIGKILL");
      await proc.exited;
    } finally {
      // The kernel empties the cgroup asynchronously after the process exits.
      const deadline = Date.now() + 5000;
      while (true) {
        try {
          linux.cgroup.remove(name);
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "EBUSY" || Date.now() > deadline) throw error;
          await Bun.sleep(1);
        }
      }
    }
    expect(fs.existsSync(path)).toBe(false);
  });

  test("sysctl.set round-trips a safe value", () => {
    const name = "kernel.domainname";
    const original = linux.sysctl.get(name);
    try {
      linux.sysctl.set(name, "bun-linux-test");
      expect(linux.sysctl.get(name)).toBe("bun-linux-test");
    } finally {
      linux.sysctl.set(name, original);
    }
    expect(linux.sysctl.get(name)).toBe(original);
  });
});
function probe(fn: () => unknown): boolean {
  if (!isLinux) return false;
  try {
    const fd = fn();
    if (typeof fd === "number") fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

const perfAvailable = probe(() =>
  linux.perfEvent.open({ type: linux.constants.PERF_TYPE_SOFTWARE, config: linux.constants.PERF_COUNT_SW_TASK_CLOCK }),
);
const bpfAvailable = probe(() =>
  linux.bpf.mapCreate({ type: linux.constants.BPF_MAP_TYPE_HASH, keySize: 4, valueSize: 8, maxEntries: 4 }),
);

describe.skipIf(!isLinux)("bun:linux seccomp", () => {
  test("filter assembles an arch-checked deny-list", () => {
    const program = linux.seccomp.filter({ deny: [1, 2], errno: 13 });
    const view = new DataView(program.buffer, program.byteOffset, program.byteLength);
    const x64 = process.arch === "x64";
    expect(program.byteLength).toBe((5 + (x64 ? 2 : 0) + 4) * 8);
    expect(view.getUint16(0, true)).toBe(0x20);
    expect(view.getUint32(4, true)).toBe(4);
    expect(view.getUint32(12, true)).toBe(x64 ? 0xc000003e : 0xc00000b7);
    const last = program.byteLength - 8;
    expect(view.getUint16(last, true)).toBe(0x06);
    expect(view.getUint32(last + 4, true)).toBe(linux.constants.SECCOMP_RET_ALLOW);
    expect(view.getUint32(last - 4, true)).toBe((linux.constants.SECCOMP_RET_ERRNO | 13) >>> 0);
  });

  test("filter and setFilter validate their arguments", () => {
    expect(errorCode(() => linux.seccomp.filter({ deny: "mkdir" } as never))).toBe("ERR_INVALID_ARG_TYPE");
    expect(errorCode(() => linux.seccomp.filter({ deny: [-1] }))).toBe("ERR_OUT_OF_RANGE");
    expect(errorCode(() => linux.seccomp.setFilter("x" as never))).toBe("ERR_INVALID_ARG_TYPE");
    expect(() => linux.seccomp.setFilter(new Uint8Array(12))).toThrow();
  });

  test("actionAvailable knows SECCOMP_RET_ALLOW", () => {
    expect(linux.seccomp.actionAvailable(linux.constants.SECCOMP_RET_ALLOW)).toBe(true);
  });

  test("setFilter denies syscalls in a child process", async () => {
    const script = `
      const linux = require("bun:linux").default;
      const fs = require("node:fs");
      const deny = process.arch === "x64" ? [83, 258] : [34];
      linux.seccomp.setFilter(linux.seccomp.filter({ deny, errno: 1 }));
      try {
        fs.mkdirSync(require("node:path").join(process.env.SECCOMP_DIR, "denied"));
        console.log("created");
      } catch (error) {
        console.log(error.code);
      }
      console.log(linux.prctl(linux.constants.PR_GET_NO_NEW_PRIVS));
    `;
    using dir = tempDir("bun-linux-seccomp", {});
    await using proc = Bun.spawn({
      cmd: [bunExe(), "-e", script],
      env: { ...bunEnv, SECCOMP_DIR: String(dir) },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toBe("");
    expect(stdout).toBe("EPERM\n1\n");
    expect(fs.existsSync(`${dir}/denied`)).toBe(false);
    expect(exitCode).toBe(0);
  });
});

describe.skipIf(!isLinux)("bun:linux perfEvent", () => {
  test("open validates its options", () => {
    expect(errorCode(() => linux.perfEvent.open({} as never))).toBe("ERR_INVALID_ARG_TYPE");
    expect(errorCode(() => linux.perfEvent.open({ type: 1, pid: -1 }))).toBe("ERR_INVALID_ARG_VALUE");
    expect(errorCode(() => linux.perfEvent.open({ type: 1, disabled: 1 as never }))).toBe("ERR_INVALID_ARG_TYPE");
    expect(() => linux.perfEvent.ioctl(0, 0x80082407)).toThrow();
  });

  test.skipIf(!perfAvailable)("counts task-clock between enable and disable", () => {
    const { constants } = linux;
    const fd = linux.perfEvent.open({
      type: constants.PERF_TYPE_SOFTWARE,
      config: constants.PERF_COUNT_SW_TASK_CLOCK,
      disabled: true,
    });
    try {
      linux.perfEvent.ioctl(fd, constants.PERF_EVENT_IOC_RESET);
      linux.perfEvent.ioctl(fd, constants.PERF_EVENT_IOC_ENABLE);
      let sum = 0;
      for (let i = 0; i < 1e6; i++) sum += i;
      linux.perfEvent.ioctl(fd, constants.PERF_EVENT_IOC_DISABLE);
      expect(sum).toBeGreaterThan(0);
      expect(linux.perfEvent.read(fd)).toBeGreaterThan(0n);
    } finally {
      fs.closeSync(fd);
    }
  });
});

describe.skipIf(!isLinux)("bun:linux bpf", () => {
  test("mapCreate and progLoad validate their options", () => {
    expect(errorCode(() => linux.bpf.mapCreate({} as never))).toBe("ERR_INVALID_ARG_TYPE");
    expect(errorCode(() => linux.bpf.progLoad({ type: 1, insns: [] as never }))).toBe("ERR_INVALID_ARG_TYPE");
    expect(errorCode(() => linux.bpf.mapLookup(0, "k" as never, new Uint8Array(8)))).toBe("ERR_INVALID_ARG_TYPE");
  });

  test.skipIf(!bpfAvailable)("hash map update, lookup, iterate and delete", () => {
    const { constants } = linux;
    const fd = linux.bpf.mapCreate({
      type: constants.BPF_MAP_TYPE_HASH,
      keySize: 4,
      valueSize: 8,
      maxEntries: 4,
      name: "bun_test",
    });
    try {
      const key = new Uint32Array([7]);
      const value = new BigUint64Array([0x1234_5678_9abcn]);
      const out = new BigUint64Array(1);
      const next = new Uint32Array(1);
      expect(linux.bpf.mapNextKey(fd, null, next)).toBe(false);
      linux.bpf.mapUpdate(fd, key, value, constants.BPF_ANY);
      expect(linux.bpf.mapLookup(fd, key, out)).toBe(true);
      expect(out[0]).toBe(0x1234_5678_9abcn);
      expect(linux.bpf.mapNextKey(fd, null, next)).toBe(true);
      expect(next[0]).toBe(7);
      expect(linux.bpf.mapNextKey(fd, next, next)).toBe(false);
      expect(() => linux.bpf.mapLookup(fd, new Uint8Array(2), out)).toThrow();
      expect(linux.bpf.mapDelete(fd, key)).toBe(true);
      expect(linux.bpf.mapDelete(fd, key)).toBe(false);
      expect(linux.bpf.mapLookup(fd, key, out)).toBe(false);
    } finally {
      fs.closeSync(fd);
    }
  });

  test.skipIf(!bpfAvailable)("progLoad accepts a socket filter and reports the verifier log", () => {
    const { constants } = linux;
    // r0 = 0; exit
    const ok = new Uint8Array([0xb7, 0, 0, 0, 0, 0, 0, 0, 0x95, 0, 0, 0, 0, 0, 0, 0]);
    const fd = linux.bpf.progLoad({ type: constants.BPF_PROG_TYPE_SOCKET_FILTER, insns: ok, name: "bun_ok" });
    expect(fd).toBeGreaterThan(2);
    fs.closeSync(fd);

    // exit without setting r0
    const bad = new Uint8Array([0x95, 0, 0, 0, 0, 0, 0, 0]);
    let error: { code?: string; log?: string } | undefined;
    try {
      linux.bpf.progLoad({ type: constants.BPF_PROG_TYPE_SOCKET_FILTER, insns: bad, logSize: 4096 });
    } catch (e) {
      error = e as typeof error;
    }
    expect(error?.code).toBe("EACCES");
    expect(error?.log).toContain("R0");
  });
});

describe.skipIf(!isLinux)("bun:linux reapOrphans", () => {
  test("validates exclude", () => {
    expect(errorCode(() => linux.reapOrphans(5 as never))).toBe("ERR_INVALID_ARG_TYPE");
    expect(linux.reapOrphans([])).toBeArray();
  });

  test("a subreaper collects its orphaned grandchildren", async () => {
    const script = `
      const linux = require("bun:linux").default;
      linux.prctl(linux.constants.PR_SET_CHILD_SUBREAPER, 1);
      const shell = Bun.spawnSync(["/bin/sh", "-c", "sleep 0 & echo $!"]);
      const orphan = Number(shell.stdout.toString().trim());
      const deadline = Date.now() + 5000;
      let reaped = [];
      while (reaped.length === 0 && Date.now() < deadline) {
        reaped = linux.reapOrphans().filter(r => r.pid === orphan);
        if (reaped.length === 0) await Bun.sleep(5);
      }
      console.log(reaped.length, reaped[0]?.status);
    `;
    await using proc = Bun.spawn({
      cmd: [bunExe(), "-e", script],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toBe("");
    expect(stdout).toBe("1 0
");
    expect(exitCode).toBe(0);
  });
});

describe.skipIf(!isLinux)("bun:linux netlink", () => {
  test("encode and parse round-trip", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const message = linux.netlink.encode({ type: 18, flags: 0x301, seq: 9, payload });
    expect(message.byteLength).toBe(20);
    expect(linux.netlink.parse(message)).toEqual([
      { type: 18, flags: 0x301, seq: 9, pid: 0, payload: new Uint8Array([1, 2, 3]) },
    ]);
  });

  test("request dumps the network links, loopback included", () => {
    const { constants } = linux;
    const message = linux.netlink.encode({
      type: constants.RTM_GETLINK,
      flags: constants.NLM_F_REQUEST | constants.NLM_F_DUMP,
      payload: new Uint8Array(16),
    });
    const replies = linux.netlink.request(constants.NETLINK_ROUTE, message);
    const links = replies.filter(reply => reply.type === constants.RTM_NEWLINK);
    expect(links.length).toBeGreaterThan(0);
    const indexes = links.map(link => new DataView(link.payload.buffer, link.payload.byteOffset).getInt32(4, true));
    expect(indexes).toContain(1);
    expect(replies.at(-1)?.type).toBe(constants.NLMSG_DONE);
  });

  test("request throws the errno of a negative NLMSG_ERROR", () => {
    const { constants } = linux;
    const ifinfo = new Uint8Array(16);
    new DataView(ifinfo.buffer).setInt32(4, 0x7ffffff0, true);
    const message = linux.netlink.encode({
      type: constants.RTM_GETLINK,
      flags: constants.NLM_F_REQUEST | constants.NLM_F_ACK,
      payload: ifinfo,
    });
    expect(errorCode(() => linux.netlink.request(constants.NETLINK_ROUTE, message))).toBe("ENODEV");
  });
});
