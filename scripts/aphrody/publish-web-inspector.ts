// Builds packages/bun-inspector-frontend (WebKit's Web Inspector UI, bundled for
// Bun) and publishes the result as @aphrody/web-inspector-bun.
//
//   bun scripts/aphrody/publish-web-inspector.ts <build|stage|publish> [--version V] [--out DIR] [--dry-run]
//
// The UI sources come from oven-sh/WebKit at WEBKIT_VERSION (sparse checkout of
// Source/WebInspectorUI/UserInterface); InspectorBackendCommands.js, which WebKit
// generates while building JavaScriptCore, comes from the prebuilt WebKit
// Windows tarball of that same commit (the Linux ones do not ship it). Re-running skips a version already on npm.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../build/config"; // config.ts and deps/webkit.ts import each other: evaluate config.ts first.
import { WEBKIT_VERSION } from "../build/deps/webkit";
import { retirePlaceholder } from "./npm-placeholder";
import { nextVersion } from "./publish-npm";
import { parseRuntimeVersion, readBaseVersion, REPOSITORY, ROOT } from "./publish-runtime";

export const INSPECTOR_PACKAGE = "@aphrody/web-inspector-bun";
export const FRONTEND_DIR = join(ROOT, "packages", "bun-inspector-frontend");
const WEBKIT_REPO = "https://github.com/oven-sh/WebKit.git";

export function inspectorManifest(version: string) {
  return {
    name: INSPECTOR_PACKAGE,
    version,
    description: "WebKit Web Inspector UI bundled for Bun's inspector (static files, open index.html).",
    license: "BSD-2-Clause",
    repository: { type: "git", url: `git+${REPOSITORY}.git`, directory: "packages/bun-inspector-frontend" },
    homepage: `${REPOSITORY}/tree/main/packages/bun-inspector-frontend`,
    exports: { ".": "./index.html", "./*": "./*" },
    files: ["**/*"],
  };
}

function run(cmd: string[], cwd: string, env: Record<string, string | undefined> = {}) {
  console.log(`$ ${cmd.join(" ")}`);
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd[0]} exited with ${r.status ?? r.error?.message}`);
}

/** Fetches the WebKit inputs into `work` and runs the frontend's build; returns its output directory. */
export function build(work: string): string {
  const webkit = join(work, "WebKit");
  if (!existsSync(join(webkit, "Source", "WebInspectorUI", "UserInterface", "Main.html"))) {
    rmSync(webkit, { recursive: true, force: true });
    mkdirSync(webkit, { recursive: true });
    run(["git", "init", "-q"], webkit);
    run(["git", "remote", "add", "origin", WEBKIT_REPO], webkit);
    run(["git", "sparse-checkout", "set", "--no-cone", "/Source/WebInspectorUI/UserInterface/"], webkit, {
      MSYS_NO_PATHCONV: "1",
    });
    run(["git", "fetch", "-q", "--depth=1", "--filter=blob:none", "origin", WEBKIT_VERSION], webkit);
    run(["git", "checkout", "-q", "FETCH_HEAD"], webkit);
  }
  const prebuilt = join(work, "webkit-prebuilt");
  const findBackend = () =>
    [...new Bun.Glob("**/InspectorBackendCommands.js").scanSync({ cwd: prebuilt, absolute: true })][0] as
      | string
      | undefined;
  if (!existsSync(prebuilt) || !findBackend()) {
    const url = `https://github.com/oven-sh/WebKit/releases/download/autobuild-${WEBKIT_VERSION}/bun-webkit-windows-amd64.tar.gz`;
    const tarball = join(work, "bun-webkit.tar.gz");
    run(["curl", "-fsSL", "--retry", "3", "-o", tarball, url], work);
    mkdirSync(prebuilt, { recursive: true });
    run(["tar", "-xzf", tarball, "-C", prebuilt, "--wildcards", "*InspectorBackendCommands.js"], work);
    rmSync(tarball, { force: true });
  }
  const backend = findBackend();
  if (!backend) throw new Error(`no InspectorBackendCommands.js in the prebuilt WebKit`);
  run([process.execPath, "build.ts"], join(FRONTEND_DIR, "scripts"), {
    WEB_INSPECTOR_UI_DIR: join(webkit, "Source", "WebInspectorUI", "UserInterface"),
    INSPECTOR_BACKEND_COMMANDS: backend,
  });
  return join(FRONTEND_DIR, "scripts", "out");
}

/** Copies a build output into `out` with the package manifest; returns the package directory. */
export function stage(version: string, built: string, out: string): string {
  if (!existsSync(join(built, "index.html"))) throw new Error(`no index.html in ${built}`);
  rmSync(out, { recursive: true, force: true });
  cpSync(built, out, { recursive: true });
  writeFileSync(join(out, "package.json"), JSON.stringify(inspectorManifest(version), null, 2) + "\n");
  writeFileSync(
    join(out, "README.md"),
    `# ${INSPECTOR_PACKAGE}\n\nWebKit's Web Inspector UI (oven-sh/WebKit ${WEBKIT_VERSION.slice(0, 12)}) bundled for Bun. ` +
      `Serve this directory and open \`index.html\`; the protocol definitions are in \`Protocol/InspectorBackendCommands.js\`.\n`,
  );
  if (process.env.NPM_TOKEN) writeFileSync(join(out, ".npmrc"), "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n");
  return out;
}

async function publishedVersions(name: string): Promise<string[]> {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`registry ${name}: HTTP ${res.status}`);
  return Object.keys(((await res.json()) as { versions?: object }).versions ?? {});
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (!["build", "stage", "publish"].includes(command)) {
    console.error("usage: publish-web-inspector.ts <build|stage|publish> [--version V] [--out DIR] [--dry-run]");
    process.exit(2);
  }
  const work = join(tmpdir(), "aphrody-web-inspector");
  mkdirSync(work, { recursive: true });
  const built = build(work);
  if (command !== "build") {
    const published = await publishedVersions(INSPECTOR_PACKAGE);
    const version = flag(args, "--version") ?? nextVersion(readBaseVersion(), published).next;
    parseRuntimeVersion(version);
    const dir = stage(version, built, flag(args, "--out") ?? join(work, "npm"));
    console.log(`staged ${INSPECTOR_PACKAGE}@${version} in ${dir}`);
    if (command === "publish") {
      const dryRun = args.includes("--dry-run");
      if (published.includes(version)) console.log(`skip ${INSPECTOR_PACKAGE}@${version}: already on npm`);
      else
        run(
          [process.execPath, "publish", "--access", "public", "--tag", "latest", ...(dryRun ? ["--dry-run"] : [])],
          dir,
        );
      await retirePlaceholder(INSPECTOR_PACKAGE, { cwd: dir, dryRun });
    }
  }
}
