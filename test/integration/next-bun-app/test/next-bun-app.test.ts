import { expect, test } from "bun:test";
import { cpSync } from "fs";
import { bunEnv, bunExe, isDebug } from "harness";
import { join } from "path";
import { installFixture } from "../../next-app/test/next-helpers";

// `@aphrody/next-bun/app`: the Next.js `app/` conventions (React Server Components, server actions,
// streaming SSR, static generation, middleware) on Bun.build + Bun.serve, without Next. The suites in
// `suite/` run inside the installed fixture so that the package resolves React 19 and
// react-server-dom-parcel from the fixture's bun.lock.

const fixture = join(import.meta.dir, "..");
const nextBunPackage = join(import.meta.dir, "..", "..", "..", "..", "packages", "bun-next");
const suites = ["scan", "plugin", "router", "compile"].map(name => `./suite/${name}.suite.ts`);

test(
  "@aphrody/next-bun/app scans, bundles, renders, prerenders and compiles an App Router project",
  async () => {
    using dir = await installFixture(fixture, ["app", "proxy.ts", "public", "suite", "package.json", "bun.lock"]);
    cpSync(nextBunPackage, join(String(dir), "node_modules", "@aphrody", "next-bun"), { recursive: true });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "test", ...suites],
      cwd: String(dir),
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    const failures = (stdout + stderr).split("\n").filter(line => line.startsWith("(fail)"));
    expect(failures).toEqual([]);
    expect(stderr).toMatch(/\b55 pass\b/);
    expect(stderr).toMatch(/\b0 fail\b/);
    expect(exitCode).toBe(0);
  },
  isDebug ? Infinity : 300_000,
);
