import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { Dependency } from "../source.ts";

/** Mullvad source of the vpn plugin (aphrody-labs/bun-vpn, submodule `plugins/vpn`); WinFw is built only when it is mounted. */
export const MULLVAD_SOURCE = "plugins/vpn/vendor/mullvad";

// Gitlinks in mullvadvpn-app@493198790be1ec34b5cc3cfbfb50d02197264463 are absent from GitHub archives.
export const WINFW_SOURCE_ARCHIVES = [
  {
    name: "mullvad-libwfp",
    repo: "mullvad/libwfp",
    commit: "94415c7a85ea0ef728dedc6778457395185d8925",
    path: "windows/libwfp",
    patches: ["winfw-libwfp.patch"],
  },
  {
    name: "mullvad-windows-libraries",
    repo: "mullvad/windows-libraries",
    commit: "0267555ea4a8ae6bcfd59930ce454b8614510875",
    path: "windows/windows-libraries",
    patches: [],
  },
] as const;

export function winfwSourceFetchCommands(checkout: string, runtime: string, cache: string): string[][] {
  return WINFW_SOURCE_ARCHIVES.map(source => [
    runtime,
    resolve(import.meta.dir, "../fetch-cli.ts"),
    "dep",
    source.name,
    source.repo,
    source.commit,
    resolve(checkout, MULLVAD_SOURCE, source.path),
    cache,
    ...source.patches.map(patch => resolve(import.meta.dir, patch)),
  ]);
}

export const WINFW_SYSTEM_LIBRARIES = [
  "fwpuclnt.lib",
  "rpcrt4.lib",
  "iphlpapi.lib",
  "advapi32.lib",
  "gdi32.lib",
  "winspool.lib",
  "comdlg32.lib",
  "uuid.lib",
  "odbc32.lib",
  "odbccp32.lib",
];

export function winfwSources(root: string): string[] {
  const projects = [
    "windows/winfw/src/winfw/winfw.vcxproj",
    "windows/libwfp/src/libwfp/libwfp.vcxproj",
    "windows/windows-libraries/src/libcommon/libcommon.vcxproj",
  ];
  const sources = projects
    .flatMap(project => {
      const file = resolve(root, project);
      return [...readFileSync(file, "utf8").matchAll(/<ClCompile Include="([^"]+)"/g)].map(match => {
        const source = resolve(dirname(file), match[1]!.replaceAll("\\", "/"));
        const member = relative(root, source).replaceAll("\\", "/");
        if (member.startsWith("../") || !member.endsWith(".cpp")) throw new Error("Invalid WinFw project source");
        return member;
      });
    })
    .filter(source => !source.endsWith("/dllmain.cpp"));
  sources.push(
    ...["stdafx.cpp", "logging/logsinkadapter.cpp", "logging/stdoutlogger.cpp", "logging/unwind.cpp"].map(
      path => `windows/libshared/src/libshared/${path}`,
    ),
  );
  if (new Set(sources).size !== sources.length || sources.length !== 71)
    throw new Error("WinFw source closure changed");
  return sources;
}

/**
 * Setup fetches the gitlink archives on Windows hosts only. A cross build from Linux or macOS fetches the same
 * pinned archives at configure, the way it fetches the Windows sysroot: configure reads their project files.
 */
function crossWinfwSourceRoot(checkout: string, hostOs: string, cache: string): string {
  const root = resolve(checkout, MULLVAD_SOURCE);
  if (hostOs === "windows" || WINFW_SOURCE_ARCHIVES.every(source => existsSync(resolve(root, source.path))))
    return root;
  for (const command of winfwSourceFetchCommands(checkout, process.execPath, resolve(cache, "tarballs"))) {
    const fetched = spawnSync(command[0]!, command.slice(1), { stdio: "inherit" });
    if (fetched.status !== 0) throw new Error(`WinFw source fetch failed: ${command.slice(3, 5).join(" ")}`);
  }
  return root;
}

export const winfw: Dependency = {
  name: "winfw",
  enabled: cfg => cfg.windows && existsSync(resolve(cfg.cwd, MULLVAD_SOURCE, "Cargo.toml")),
  source: cfg => ({
    kind: "local",
    path: resolve(cfg.cwd, MULLVAD_SOURCE),
    hint: "Mount the vpn plugin: git submodule update --init --checkout --recursive plugins/vpn",
  }),
  build: cfg => ({
    kind: "direct",
    archive: true,
    lang: "cxx",
    preBuild: {
      command: [
        process.execPath,
        resolve(cfg.cwd, "scripts/build/deps/winfw-prepare.ts"),
        resolve(cfg.cwd, MULLVAD_SOURCE),
        resolve(cfg.buildDir, "deps/winfw/generated/winfw/lannetworks.h"),
        resolve(cfg.cwd, "build/winfw-generator"),
        cfg.rustToolchain ?? "",
        cfg.host.os !== "windows" ? (cfg.winsysroot ?? "") : "",
      ],
      cwd: cfg.cwd,
      outputs: [
        resolve(cfg.buildDir, "deps/winfw/generated/winfw/lannetworks.h"),
        ...(cfg.host.os !== "windows" && cfg.winsysroot
          ? [resolve(cfg.buildDir, "deps/winfw/generated/sdk-vfs.json")]
          : []),
      ],
      inputs: [
        "scripts/build/deps/winfw-prepare.ts",
        "scripts/build/deps/winfw-libwfp.patch",
        `${MULLVAD_SOURCE}/Cargo.lock`,
        `${MULLVAD_SOURCE}/talpid-types/Cargo.toml`,
        `${MULLVAD_SOURCE}/talpid-types/src/bin/generate-cpp-lannetworks.rs`,
        `${MULLVAD_SOURCE}/talpid-types/src/net/mod.rs`,
      ].map(path => resolve(cfg.cwd, path)),
    },
    sources: winfwSources(crossWinfwSourceRoot(cfg.cwd, cfg.host.os, cfg.cacheDir)),
    includes: [
      resolve(cfg.buildDir, "deps/winfw/generated"),
      "windows/winfw/src",
      "windows/libwfp/src",
      "windows/windows-libraries/src",
      "windows/libshared/src",
    ],
    defines: { WINFW_STATIC: true, UNICODE: true, _UNICODE: true, _LIB: true, _WINDOWS: true },
    cflags: [
      "/std:c++20",
      "/EHsc",
      "/GR",
      ...["windows/winfw/src/winfw", "windows/libwfp/src/libwfp", "windows/windows-libraries/src/libcommon"].flatMap(
        path => ["/clang:-idirafter", `/clang:${resolve(cfg.cwd, MULLVAD_SOURCE, path)}`],
      ),
      ...(cfg.host.os !== "windows" && cfg.winsysroot
        ? ["/clang:-ivfsoverlay", `/clang:${resolve(cfg.buildDir, "deps/winfw/generated/sdk-vfs.json")}`]
        : []),
    ],
  }),
  provides: () => ({ libs: ["winfw"], includes: [] }),
};
