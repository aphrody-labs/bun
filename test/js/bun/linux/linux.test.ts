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
