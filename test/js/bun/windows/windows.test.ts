import { describe, expect, test } from "bun:test";
import windows from "bun:windows";
import { readFileSync } from "node:fs";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";

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
    expect(errorCode(() => windows.storage.drives())).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    expect(errorCode(() => windows.memory.status())).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    expect(errorCode(() => windows.toolchain())).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    expect(errorCode(() => windows.processes.setPriority(0, "normal"))).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    expect(errorCode(() => new windows.Job())).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    expect(errorCode(() => new windows.ntfs.Volume())).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    expect(errorCode(() => windows.pe.catalogFile("C:\\x"))).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    expect(errorCode(() => windows.pe.releaseCatalogContexts())).toBe("ERR_BUN_WINDOWS_UNSUPPORTED");
    // Pure byte parsing (no Win32 dependency) still works off Windows.
    expect(windows.pe.looksLikePe(new Uint8Array([0x4d, 0x5a]))).toBe(true);
    expect(windows.pe.looksLikePe(new Uint8Array([0, 0]))).toBe(false);
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

  test("logical drive capacity", () => {
    const drives = windows.storage.drives();
    expect(drives.length).toBeGreaterThan(0);
    const systemRoot = process.env.SystemRoot!.slice(0, 3).toLowerCase();
    const systemDrive = drives.find(drive => drive.root.toLowerCase() === systemRoot)!;
    expect(systemDrive).toBeDefined();
    expect(systemDrive.type).toBe("fixed");
    expect(systemDrive.totalBytes).toBeGreaterThan(0);
    expect(systemDrive.freeBytes).toBeLessThanOrEqual(systemDrive.totalBytes);
    expect(systemDrive.availableBytes).toBeLessThanOrEqual(systemDrive.totalBytes);
  });

  test("physical, page-file and virtual memory status", () => {
    const memory = windows.memory.status();
    expect(memory.totalPhysical).toBeGreaterThan(0);
    expect(memory.availablePhysical).toBeLessThanOrEqual(memory.totalPhysical);
    expect(memory.totalPageFile).toBeGreaterThan(0);
    expect(memory.availablePageFile).toBeLessThanOrEqual(memory.totalPageFile);
    expect(memory.memoryLoad).toBeGreaterThanOrEqual(0);
    expect(memory.memoryLoad).toBeLessThanOrEqual(100);
  });

  test("toolchain discovers Visual Studio, MSVC, the SDK and the vcvars environment", () => {
    const tc = windows.toolchain();
    expect(Object.isFrozen(tc)).toBe(true);
    expect(tc.arch).toBe(tc.host);
    expect(Array.isArray(tc.instances)).toBe(true);
    expect(errorCode(() => windows.toolchain({ arch: "sparc" as never }))).toBe("ERR_INVALID_ARG_TYPE");
    expect(windows.toolchain({ arch: "x86_64" }).arch).toBe("x64");
    if (tc.msvc === null) return;
    expect(tc.instance).toEqual(tc.instances.find(i => i.id === tc.instance!.id)!);
    expect(tc.msvc.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(tc.tools.cl).toEndWith("\\cl.exe");
    expect(tc.tools.link).toEndWith("\\link.exe");
    expect(tc.env!.VCToolsVersion).toBe(tc.msvc.version);
    expect(tc.env!.PATH.toLowerCase()).toStartWith(tc.msvc.bin.toLowerCase());
    expect(tc.paths!.include.some(dir => dir.toLowerCase().endsWith("\\include"))).toBe(true);
    if (tc.sdk) {
      expect(tc.sdk.version).toMatch(/^10\.0\.\d+\.\d+$/);
      expect(tc.env!.WindowsSDKVersion).toBe(tc.sdk.version + "\\");
    }
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

  test("process controls", () => {
    const pid = process.pid;
    windows.processes.setPriority(pid, "normal");
    windows.processes.setEcoMode(pid, true);
    windows.processes.setEcoMode(pid, false);
    windows.processes.trimWorkingSet(pid);
    expect(errorCode(() => windows.processes.setAffinity(pid, 0))).toBe("ERR_OUT_OF_RANGE");
    expect(errorCode(() => windows.processes.setPriority(pid, "invalid" as any))).toBe("ERR_INVALID_ARG_VALUE");
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

  test.skipIf(!windows.isElevated())(
    "ntfs: USN journal and MFT enumeration",
    () => {
      using vol = new windows.ntfs.Volume("C");
      expect(vol.drive).toBe("C");
      expect(vol.closed).toBe(false);

      const journal = vol.queryOrCreateJournal();
      expect(typeof journal.journalId).toBe("bigint");
      expect(journal.nextUsn).toBeGreaterThanOrEqual(journal.firstUsn);

      const records = vol.enumerateMft(4 << 20);
      expect(records.length).toBeGreaterThan(1000);
      // `FSCTL_ENUM_USN_DATA` does not surface the reserved metadata files (record numbers
      // below 16, including the volume root at `ROOT_RECORD`): assert record/parent integrity
      // instead of looking for a specific reserved record. A real parent-child edge (a record
      // whose declared parent is itself a record present in the dump) proves the 64-bit file
      // reference numbers were decoded and masked correctly, not just that bytes were copied.
      const byRecord = new Map(records.map(r => [r.record, r]));
      const child = records.find(r => r.parent !== r.record && byRecord.has(r.parent));
      expect(child).toBeDefined();
      expect(byRecord.get(child!.parent)).toBeDefined();
      expect(records.some(r => (r.attributes & windows.ntfs.FILE_ATTRIBUTE_DIRECTORY) !== 0)).toBe(true);

      const read = vol.readJournal(journal.nextUsn, journal.journalId);
      expect(typeof read.next).toBe("bigint");
      expect(read.next).toBeGreaterThanOrEqual(journal.nextUsn);
      expect(Array.isArray(read.records)).toBe(true);

      vol.close();
      expect(vol.closed).toBe(true);
      expect(errorCode(() => vol.queryJournal())).toBe("ERR_INVALID_STATE");
    },
    180_000,
  );

  test("ntfs: opening without an administrator token reports ERROR_ACCESS_DENIED, never a fake volume", () => {
    if (windows.isElevated()) return;
    expect(errorCode(() => new windows.ntfs.Volume("C"))).toBeDefined();
  });

  test("pe: parses kernel32.dll (headers, exports, catalog signature)", () => {
    const path = `${process.env.SystemRoot}\\System32\\kernel32.dll`;
    const bytes = new Uint8Array(readFileSync(path));
    expect(windows.pe.looksLikePe(bytes)).toBe(true);

    const info = windows.pe.parse(bytes, "kernel32.dll");
    expect(info).not.toBeNull();
    expect(info!.kind).toBe("dll");
    expect(info!.bits === 32 || info!.bits === 64).toBe(true);
    expect(["x86", "x64", "arm64", "arm64ec"]).toContain(info!.machine);
    expect(info!.isDotnet).toBe(false);
    expect(info!.sections.length).toBeGreaterThan(0);
    // kernel32.dll exports hundreds of functions, including this one.
    expect(info!.exports.some(e => e.name === "CreateFileW")).toBe(true);
    expect(info!.exportName?.toLowerCase()).toBe("kernel32.dll");
    expect(info!.warnings).toEqual([]);

    // Depending on the Windows build, kernel32.dll either embeds its Authenticode signature in
    // the certificate table or is signed only through a system catalog; the catalog lookup below
    // never executes or maps the file either way.
    if (info!.authenticode !== null) {
      expect(typeof info!.authenticode.signer === "string" || info!.authenticode.signer === null).toBe(true);
      expect(typeof info!.authenticode.issuer === "string" || info!.authenticode.issuer === null).toBe(true);
      expect(typeof info!.authenticode.digest).toBe("string");
      expect(info!.authenticode.certificates).toBeGreaterThan(0);
    }
    const catalog = windows.pe.catalogFile(path);
    expect(typeof catalog === "string" || catalog === null).toBe(true);
    if (catalog !== null) {
      const signature = windows.pe.catalogSignature(path);
      expect(signature).not.toBeNull();
      expect(signature!.catalog).toBe(catalog.split("\\").pop());
    }
    windows.pe.releaseCatalogContexts();
  });

  test("pe: authenticode.parse rejects non-PKCS#7 bytes without throwing a confusing error", () => {
    expect(windows.pe.authenticode.parse(new Uint8Array([0, 1, 2, 3]))).toBeNull();
    expect(errorCode(() => windows.pe.authenticode.parse("not bytes" as never))).toBe("ERR_INVALID_ARG_TYPE");
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

describe("families", () => {
  test("loads @aphrody/bun-windows-<family> once, from the working directory", async () => {
    using dir = tempDir("bun-windows-family", {
      "node_modules/@aphrody/bun-windows-demo/package.json": JSON.stringify({
        name: "@aphrody/bun-windows-demo",
        main: "index.js",
      }),
      "node_modules/@aphrody/bun-windows-demo/index.js":
        "globalThis.loads = (globalThis.loads ?? 0) + 1; exports.answer = 42;",
      "main.js": `
        import windows from "bun:windows";
        const a = windows.family("demo");
        console.log(JSON.stringify([a.answer, windows.families.demo === a, "demo" in windows.families, "other" in windows.families, globalThis.loads]));
        try { windows.family("other"); } catch (e) { console.log(e.code); }
        try { windows.family("Bad Name"); } catch (e) { console.log(e.code); }
      `,
    });
    await using proc = Bun.spawn({ cmd: [bunExe(), "main.js"], env: bunEnv, cwd: String(dir), stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stdout.trim().split("\n")).toEqual([
      "[42,true,true,false,1]",
      "ERR_BUN_WINDOWS_FAMILY_NOT_FOUND",
      "ERR_INVALID_ARG_VALUE",
    ]);
    expect(exitCode).toBe(0);
  });
});
