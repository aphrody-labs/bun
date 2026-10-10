import { describe, expect, test } from "bun:test";
import winrt from "bun:winrt";
import windows from "bun:windows";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe.skipIf(!isWindows)("bun:winrt", () => {
  test.each(["uninitialized", "mta", "sta"] as const)(
    "toast releases its WinRT apartment after invalid XML (%s)",
    async mode => {
      await using child = Bun.spawn({
        cmd: [
          bunExe(),
          "-e",
          `
        import windows from "bun:windows";
        import { dlopen, FFIType, ptr } from "bun:ffi";
        const values = new Int32Array(2);
        const api = dlopen("combase.dll", {
          CoGetApartmentType: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
          RoInitialize: { args: [FFIType.i32], returns: FFIType.i32 },
          RoUninitialize: { args: [], returns: FFIType.void },
        });
        const state = () => api.symbols.CoGetApartmentType(ptr(values), ptr(values, 4));
        const before = state();
        const mode = ${JSON.stringify(mode)};
        if (mode !== "uninitialized" && api.symbols.RoInitialize(mode === "mta" ? 1 : 0) < 0) {
          throw new Error("Failed to initialize the test apartment");
        }
        const apartmentBefore = state();
        let rejected = false;
        try {
          windows.toast("<toast>", { appId: "Aphrody.Bun.Qualification" });
        } catch (error) {
          if (!error.message.includes("IXmlDocumentIO.LoadXml")) throw error;
          rejected = true;
        }
        const apartmentAfter = state();
        if (mode !== "uninitialized") api.symbols.RoUninitialize();
        const after = state();
        api.close();
        console.log(JSON.stringify({ rejected, before, after, apartmentBefore, apartmentAfter }));
      `,
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
      expect(JSON.parse(stdout)).toEqual({
        rejected: true,
        before: -2147221008,
        after: -2147221008,
        apartmentBefore: mode === "uninitialized" ? -2147221008 : 0,
        apartmentAfter: mode === "uninitialized" ? -2147221008 : 0,
      });
      expect(stderr).toBe("");
      expect(code).toBe(0);
    },
  );

  test("projects System32 namespaces on demand", () => {
    const { Uri } = winrt.namespace("Windows.Foundation");
    const uri = Uri.CreateUri("https://example.com:8443/a/b?c=1#d");
    expect(uri.Host).toBe("example.com");
    expect(uri.Port).toBe(8443);
    expect(uri.Path).toBe("/a/b");
    expect(uri.runtimeClassName).toBe("Windows.Foundation.Uri");
    // IStringable is not the default interface: bound through QueryInterface.
    expect(uri.ToString()).toBe("https://example.com:8443/a/b?c=1#d");
    expect(() => Uri.CreateUri("not a uri")).toThrow("HRESULT");
  });

  test("IAsyncOperation and IAsyncAction resolve as Promises, IVectorView is iterable", async () => {
    using dir = tempDir("bun-winrt", { "a.txt": "a", "b.txt": "b" });
    const { StorageFolder } = winrt.namespace("Windows.Storage");
    const folder = await StorageFolder.GetFolderFromPathAsync(String(dir));
    expect(folder.Path.toLowerCase()).toBe(String(dir).toLowerCase());

    const files = await folder.GetFilesAsyncOverloadDefaultOptionsStartAndCount();
    expect(files.Size).toBe(2);
    expect([...files].map(file => file.Name).sort()).toEqual(["a.txt", "b.txt"]);

    const file = await folder.GetFileAsync("a.txt");
    expect(await file.DeleteAsyncOverloadDefaultOptions()).toBeUndefined();
    expect(existsSync(join(String(dir), "a.txt"))).toBe(false);

    await expect((async () => folder.GetFileAsync("missing.txt"))()).rejects.toThrow("HRESULT");
  });
});
