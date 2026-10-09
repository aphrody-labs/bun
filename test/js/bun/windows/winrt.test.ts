import { describe, expect, test } from "bun:test";
import winrt from "bun:winrt";
import { isWindows, tempDir } from "harness";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe.skipIf(!isWindows)("bun:winrt", () => {
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
