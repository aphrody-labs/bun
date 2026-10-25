import { expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { vendorPreparationCommands } from "../../scripts/aphrody/setup.ts";
import { WINFW_SOURCE_ARCHIVES, winfwSources } from "../../scripts/build/deps/winfw.ts";
import { computeSourceIdentity } from "../../scripts/build/fetch-cli.ts";

function project(prefix: string, count: number) {
  return ["dllmain.cpp", ...Array.from({ length: count }, (_, i) => `${prefix}\\source${i}.cpp`)]
    .map(file => `<ClCompile Include="${file}" />`)
    .join("\n");
}

test.each(["linux", "darwin"] as const)("%s setup does not fetch the Windows gitlinks", platform => {
  expect(vendorPreparationCommands(resolve("checkout with spaces"), bunExe(), platform)).toEqual([
    [bunExe(), "scripts/build.ts", "--profile=debug", "--configure-only"],
  ]);
});

test("Windows setup materializes pinned archives and patched sources before configure, then reuses them", async () => {
  expect(WINFW_SOURCE_ARCHIVES.map(({ repo, commit }) => ({ repo, commit }))).toEqual([
    { repo: "mullvad/libwfp", commit: "94415c7a85ea0ef728dedc6778457395185d8925" },
    { repo: "mullvad/windows-libraries", commit: "0267555ea4a8ae6bcfd59930ce454b8614510875" },
  ]);
  using directory = tempDir("winfw-source-preparation", {
    "plugins/vpn/vendor/mullvad/windows/winfw/src/winfw/winfw.vcxproj": project("winfw", 24),
    "plugins/vpn/vendor/mullvad/unrelated-source.txt": "preserved parent source",
  });
  const root = String(directory);
  const cache = join(root, "archive cache");
  mkdirSync(cache);
  const commands = vendorPreparationCommands(root, bunExe(), "win32", cache);
  expect(commands).toHaveLength(3);
  expect(commands.at(-1)).toEqual([bunExe(), "scripts/build.ts", "--profile=debug", "--configure-only"]);
  const sourceRoot = join(root, "plugins/vpn/vendor/mullvad");
  expect(() => winfwSources(sourceRoot)).toThrow("ENOENT");

  for (const source of WINFW_SOURCE_ARCHIVES) {
    const files: Record<string, string> =
      source.name === "mullvad-libwfp"
        ? {
            "src/libwfp/libwfp.vcxproj": project("wfp", 20),
            ...Object.fromEntries(
              ["filter", "provider", "sublayer"].map(name => [
                `src/libwfp/${name}builder.h`,
                `public:\n\n\tbool build(${name[0]!.toUpperCase() + name.slice(1)}Sink sink);\n\n\tconst GUID &IIdentifiable::id() const override;\n\tconst GUID &IIdentifiable::providerId() const override;\n\nprivate:\n\n`,
              ]),
            ),
          }
        : { "src/libcommon/libcommon.vcxproj": project("common", 23) };
    const archive = Object.fromEntries(
      Object.entries(files).map(([name, body]) => [`source-${source.commit}/${name}`, body]),
    );
    const url = `https://github.com/${source.repo}/archive/${source.commit}.tar.gz`;
    const key = new Bun.CryptoHasher("sha256").update(url).digest("hex").slice(0, 16);
    await Bun.write(
      join(cache, `${source.name}-${key}.tar.gz`),
      await new Bun.Archive(archive, { compress: "gzip" }).bytes(),
    );
  }

  const execute = async () => {
    let configured = false;
    for (const command of commands) {
      if (command.includes("--configure-only")) {
        // Configure reads the closure before any preBuild edge runs. No compiler is invoked here.
        const sources = winfwSources(sourceRoot);
        expect(sources).toHaveLength(71);
        expect(new Set(sources).size).toBe(71);
        expect(sources.some(source => source.endsWith("/dllmain.cpp"))).toBe(false);
        expect(readFileSync(join(sourceRoot, "windows/libwfp/src/libwfp/filterbuilder.h"), "utf8")).toContain(
          "const GUID &id() const override;",
        );
        configured = true;
        continue;
      }
      expect(configured).toBe(false);
      const child = Bun.spawn(command, { cwd: root, env: bunEnv, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
      expect({ stderr, code }).toEqual({ stderr: "", code: 0 });
      expect(stdout).toMatch(/done →|up to date/);
    }
    expect(configured).toBe(true);
  };
  await execute();
  const stamps = WINFW_SOURCE_ARCHIVES.map(source => {
    const path = join(sourceRoot, source.path, ".ref");
    const patches = source.patches.map(name =>
      readFileSync(resolve(import.meta.dir, "../../scripts/build/deps", name), "utf8"),
    );
    expect(readFileSync(path, "utf8").trim()).toBe(computeSourceIdentity(source.commit, patches));
    return { path, mtimeMs: statSync(path).mtimeMs };
  });
  for (const file of new Bun.Glob("*.tar.gz").scanSync({ cwd: cache })) {
    // A matching .ref must avoid downloading or re-extracting even if its archive cache is unusable.
    writeFileSync(join(cache, file), "not an archive");
  }
  await execute();
  for (const stamp of stamps) expect(statSync(stamp.path).mtimeMs).toBe(stamp.mtimeMs);
  expect(readFileSync(join(sourceRoot, "unrelated-source.txt"), "utf8")).toBe("preserved parent source");
  expect(existsSync(join(sourceRoot, "windows/windows-libraries/src/libcommon/libcommon.vcxproj"))).toBe(true);
});
