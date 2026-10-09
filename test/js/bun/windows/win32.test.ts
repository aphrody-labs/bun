import { describe, expect, test } from "bun:test";
import windows from "bun:windows";
import { CFunction, read } from "bun:ffi";
import { isWindows } from "harness";
import { join } from "node:path";

// The generated families live unpacked in packages/bun-windows-<dll> of this checkout.
process.env.BUN_WINDOWS_FAMILY_PATH = join(import.meta.dir, "..", "..", "..", "..", "packages");

describe.skipIf(!isWindows)("windows.win32", () => {
  const { win32 } = windows;

  test("generated families load and bind functions lazily", () => {
    const kernel32 = windows.family("kernel32");
    expect(kernel32.dll).toBe("kernel32.dll");
    expect(windows.families.kernel32).toBe(kernel32);
    expect(kernel32.GetCurrentProcessId()).toBe(process.pid);
    expect(kernel32.constants.PROCESS_QUERY_LIMITED_INFORMATION).toBe(0x1000);
    expect(windows.family("user32").constants.WM_CLOSE).toBe(16);
  });

  test("structs: layout, size field, PWSTR output buffers", () => {
    const kernel32 = windows.family("kernel32");
    expect(win32.sizeof("MEMORYSTATUSEX")).toBe(64);
    const mem = win32.struct("MEMORYSTATUSEX");
    expect(mem.dwLength).toBe(64);
    expect(kernel32.GlobalMemoryStatusEx(mem)).toBe(1);
    expect(mem.ullTotalPhys).toBeGreaterThan(mem.ullAvailPhys);

    const path = new Uint16Array(32768);
    const n = kernel32.GetModuleFileNameW(null, path, path.length);
    expect(win32.readWide(path, n)!.toLowerCase()).toBe(process.execPath.toLowerCase());
  });

  test("structs: WCHAR arrays and Toolhelp32 iteration", () => {
    const kernel32 = windows.family("kernel32");
    const snapshot = kernel32.CreateToolhelp32Snapshot(kernel32.constants.TH32CS_SNAPPROCESS, 0);
    const entry = win32.struct("PROCESSENTRY32W");
    expect(entry.dwSize).toBe(568);
    let self: string | undefined;
    for (let ok = kernel32.Process32FirstW(snapshot, entry); ok; ok = kernel32.Process32NextW(snapshot, entry))
      if (entry.th32ProcessID === process.pid) self = entry.szExeFile;
    expect(kernel32.CloseHandle(snapshot)).toBe(1);
    expect(self!.toLowerCase()).toBe(process.execPath.split("\\").pop()!.toLowerCase());
  });

  test("struct by value and anonymous unions", () => {
    const user32 = windows.family("user32");
    const rect = win32.struct("RECT", { left: 0, top: 0, right: 10, bottom: 10 });
    expect(user32.PtInRect(rect, { x: 5, y: 5 })).toBe(1);
    expect(user32.PtInRect(rect, { x: 15, y: 5 })).toBe(0);

    const input = win32.struct("INPUT", { type: 1, ki: { wVk: 0x41, dwFlags: 2 } });
    expect(input.$size).toBe(40);
    expect(input.Anonymous.ki.wVk).toBe(0x41);
    expect(input.ki.dwFlags).toBe(2);
    expect(new DataView(input.$buffer.buffer).getUint16(8, true)).toBe(0x41);
  });

  test("callbacks receive native arguments", () => {
    const kernel32 = windows.family("kernel32");
    const pages: number[] = [];
    const ok = kernel32.EnumSystemCodePagesW((name: number) => {
      pages.push(Number(win32.readWide(name)));
      return 1;
    }, kernel32.constants.CP_INSTALLED);
    expect(ok).toBe(1);
    expect(pages).toContain(65001);
  });

  test("SetLastError functions record lastError", () => {
    const kernel32 = windows.family("kernel32");
    expect(kernel32.GetFileAttributesW("C:\\does\\not\\exist\\bun-win32")).toBe(0xffffffff);
    expect([2, 3]).toContain(win32.lastError());
  });

  test("COM: Task Scheduler through vtables, BSTR and VARIANT", () => {
    const service = win32.com.create("TaskScheduler", "System.TaskScheduler.ITaskService");
    expect(service.$interface).toBe("System.TaskScheduler.ITaskService");
    service.Connect(undefined, undefined, undefined, undefined);
    expect(service.get_Connected()).toBe(-1);
    expect(service.get_HighestVersion()).toBeGreaterThanOrEqual(0x10002);
    const root = service.GetFolder("\\");
    expect(root.get_Path()).toBe("\\");
    expect(typeof root.GetTasks(1).get_Count()).toBe("number");
    const dispatch = root.as("System.Com.IDispatch");
    expect(dispatch.GetTypeInfoCount()).toBe(1);
    expect(dispatch.release()).toBeGreaterThanOrEqual(0);
    expect(() => service.GetFolder("\\bun-win32-missing-folder")).toThrow(win32.Win32Error);
  });

  test("COM delegates run handlers on the JS thread when invoked from another thread", async () => {
    const kernel32 = windows.family("kernel32");
    const iid = "6a7f2f1c-6a52-4c4e-9d55-1b3b8f8f7d10";
    const { promise, resolve } = Promise.withResolvers<number>();
    const delegate = win32.com.delegate(iid, () => resolve(kernel32.GetCurrentThreadId()));

    const vtbl = read.ptr(delegate, 0);
    const queryInterface = new CFunction({ ptr: read.ptr(vtbl, 0), args: ["ptr", "ptr", "ptr"], returns: "i32" });
    const out = new BigUint64Array(1);
    expect(queryInterface(delegate, win32.guid(iid), out)).toBe(0);
    expect(Number(out[0])).toBe(delegate);
    expect(win32.com.release(delegate)).toBe(1);
    expect(queryInterface(delegate, win32.guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), out)).toBe(0);
    expect(win32.com.release(delegate)).toBe(1);

    // A native thread whose start routine is Invoke(this = delegate).
    const thread = kernel32.CreateThread(null, 0, read.ptr(vtbl, 24), delegate, 0, null);
    expect(thread).not.toBe(0);
    expect(await promise).toBe(kernel32.GetCurrentThreadId());
    expect(kernel32.WaitForSingleObject(thread, 0xffffffff)).toBe(0);
    expect(kernel32.CloseHandle(thread)).toBe(1);
    expect(win32.com.release(delegate)).toBeGreaterThanOrEqual(0);
  });

  test("errors name the missing type or export", () => {
    expect(() => win32.struct("NOT_A_WIN32_STRUCT")).toThrow("NOT_A_WIN32_STRUCT");
    expect(win32.guidString(win32.guid("{00000000-0000-0000-C000-000000000046}"))).toBe(
      "00000000-0000-0000-c000-000000000046",
    );
  });
});
