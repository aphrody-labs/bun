import { describe, expect, test } from "bun:test";
import windows from "bun:windows";
import { bunEnv, bunExe, isWindows } from "harness";

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe.skipIf(isWindows)("non-Windows", () => {
  test("reports unsupported and throws", () => {
    expect(windows.isSupported).toBe(false);
    expect(windows.isWindows11()).toBe(false);
    expect(errorCode(() => windows.version())).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    expect(errorCode(() => windows.registry.get("HKCU\\Software"))).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    expect(errorCode(() => new windows.Job())).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
  });
});

describe.skipIf(!isWindows)("bun:windows", () => {
  test("version", () => {
    const v = windows.version();
    expect(v.major).toBe(10);
    expect(v.build).toBeGreaterThan(0);
    expect(v.version).toBe(`${v.major}.${v.minor}.${v.build}.${v.ubr}`);
    expect(v.isWindows11).toBe(v.build >= 22000);
    expect(windows.isWindows11()).toBe(v.isWindows11);
    if (v.isWindows11 && v.installationType === "Client") expect(v.productName).toContain("Windows 11");
    expect(windows.version()).toBe(v);
  });

  test("systemInfo and isElevated", () => {
    const info = windows.systemInfo();
    expect(info.processors).toBeGreaterThan(0);
    expect(info.totalMemory).toBeGreaterThan(info.freeMemory);
    expect(info.computerName.length).toBeGreaterThan(0);
    expect(["dark", "light"]).toContain(info.theme);
    expect(typeof windows.isElevated()).toBe("boolean");
  });

  test("registry round-trip", () => {
    const key = `HKCU\\Software\\BunTest-${process.pid}`;
    const { registry } = windows;
    try {
      registry.set(key, "sz", "héllo");
      registry.set(key, "dword", 42);
      registry.set(key, "qword", 2n ** 40n);
      registry.set(key, "multi", ["a", "b"]);
      registry.set(key, "bin", new Uint8Array([1, 2, 255]));
      registry.set(key, "expand", "%SystemRoot%", "REG_EXPAND_SZ");
      registry.createKey(`${key}\\child`);

      expect(registry.get(key, "sz")).toEqual({ type: "REG_SZ", value: "héllo" });
      expect(registry.get(key, "dword")).toEqual({ type: "REG_DWORD", value: 42 });
      expect(registry.get(key, "qword")).toEqual({ type: "REG_QWORD", value: 2n ** 40n });
      expect(registry.get(key, "multi")).toEqual({ type: "REG_MULTI_SZ", value: ["a", "b"] });
      expect(registry.get(`${key}`.replace("HKCU", "HKEY_CURRENT_USER"), "bin")).toEqual({
        type: "REG_BINARY",
        value: Buffer.from([1, 2, 255]),
      });
      expect(registry.get(key, "expand")).toEqual({ type: "REG_EXPAND_SZ", value: "%SystemRoot%" });
      expect(registry.get(key, "missing")).toBeNull();
      expect(registry.get(`${key}\\missing`, "x")).toBeNull();

      const listing = registry.list(key)!;
      expect(listing.keys).toEqual(["child"]);
      expect(listing.values.map(v => v.name).sort()).toEqual(["bin", "dword", "expand", "multi", "qword", "sz"]);

      expect(registry.deleteValue(key, "sz")).toBe(true);
      expect(registry.deleteValue(key, "sz")).toBe(false);
      expect(registry.list(`${key}\\missing`)).toBeNull();
    } finally {
      registry.deleteKey(key, { recursive: true });
    }
    expect(registry.get(key, "dword")).toBeNull();
    expect(registry.deleteKey(key)).toBe(false);
  });

  test("registry argument validation", () => {
    expect(errorCode(() => windows.registry.get("HKXX\\Software"))).toBe("ERR_INVALID_ARG_VALUE");
    expect(errorCode(() => windows.registry.set("HKCU\\Software\\x", "v", -1))).toBe("ERR_OUT_OF_RANGE");
    expect(errorCode(() => windows.registry.set("HKCU\\Software\\x", "v", {} as any))).toBe("ERR_INVALID_ARG_TYPE");
    expect(errorCode(() => windows.registry.deleteKey("HKCU"))).toBe("ERR_INVALID_ARG_VALUE");
  });

  test("known folders", () => {
    const docs = windows.knownFolder("Documents");
    expect(docs).toBe(windows.knownFolder(`{${windows.knownFolders.Documents}}`));
    expect(windows.knownFolder("Windows").toLowerCase()).toBe(process.env.SystemRoot!.toLowerCase());
    expect(() => windows.knownFolder("not-a-guid")).toThrow();
  });

  test("processes", () => {
    const self = windows.processes.list().find(p => p.pid === process.pid);
    expect(self).toBeDefined();
    expect(self!.threads).toBeGreaterThan(0);
    expect(windows.processes.path(process.pid).toLowerCase()).toBe(process.execPath.toLowerCase());
  });

  test("services", () => {
    const svc = windows.services.get("EventLog")!;
    expect(svc.name).toBe("EventLog");
    expect(svc.state).toBe("running");
    expect(svc.pid).toBeGreaterThan(0);
    expect(windows.services.get("bun-no-such-service")).toBeNull();
    expect(windows.services.list().some(s => s.name.toLowerCase() === "eventlog")).toBe(true);
  });

  test("event log query", () => {
    const events = windows.eventLog.query("System", { limit: 2 });
    expect(events.length).toBeLessThanOrEqual(2);
    for (const xml of events) expect(xml).toStartWith("<Event ");
  });

  test("Job assign, info, terminate", async () => {
    using job = new windows.Job({ killOnClose: true });
    await using child = Bun.spawn({
      cmd: [bunExe(), "-e", "setInterval(() => {}, 1000)"],
      env: bunEnv,
      stdout: "ignore",
      stderr: "ignore",
    });
    job.assign(child);
    const info = job.info();
    expect(info.pids).toContain(child.pid);
    expect(info.activeProcesses).toBe(1);
    job.terminate(7);
    expect(await child.exited).toBe(7);
    job.close();
    expect(job.closed).toBe(true);
    expect(errorCode(() => job.info())).toBe("ERR_INVALID_STATE");
  });

  test("Job limits", () => {
    using job = new windows.Job({ jobMemory: 256 * 1024 * 1024, activeProcesses: 4, cpuRate: 50 });
    expect(job.info().totalProcesses).toBe(0);
    expect(errorCode(() => job.setLimits({ cpuRate: 0 }))).toBe("ERR_OUT_OF_RANGE");
  });

  test("clipboard round-trip", () => {
    let previous: string | null;
    try {
      previous = windows.clipboard.readText();
    } catch {
      // No interactive desktop (service session): nothing to test.
      return;
    }
    try {
      windows.clipboard.writeText("bun:windows ✓");
      expect(windows.clipboard.readText()).toBe("bun:windows ✓");
      windows.clipboard.clear();
      expect(windows.clipboard.readText()).toBeNull();
    } finally {
      if (previous !== null) windows.clipboard.writeText(previous);
    }
  });

  test("wsl.distributions", () => {
    const distros = windows.wsl.distributions();
    expect(Array.isArray(distros)).toBe(true);
    for (const d of distros) {
      expect(typeof d.name).toBe("string");
      expect([1, 2]).toContain(d.version);
    }
    expect(distros.filter(d => d.default).length).toBeLessThanOrEqual(1);
  });
});
