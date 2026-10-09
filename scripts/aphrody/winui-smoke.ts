// Runs test/js/bun/winui/winui-window.fixture.ts (a real WinUI 3 window) with a Bun that has no bun:winui
// builtin yet: the fixture's import is pointed at src/js/bun/winui.ts with the WinRT core of this checkout.
//   bun scripts/aphrody/winui-smoke.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..", "..");
const slash = (p: string) => p.replaceAll("\\", "/");
const fixture = await Bun.file(join(repo, "test/js/bun/winui/winui-window.fixture.ts")).text();
const shim = [
  `import winuiModule from "${slash(join(repo, "src/js/bun/winui.ts"))}";`,
  `const winrt = require("${slash(join(repo, "packages/bun-windows-winrt/index.js"))}");`,
  `const winui = { ...winuiModule, start: (options = {}) => winuiModule.start({ ...options, winrt }) };`,
].join("\n");
if (!fixture.includes(`import winui from "bun:winui";`)) throw new Error("fixture import not found");

const dir = mkdtempSync(join(tmpdir(), "winui-smoke-"));
try {
  const file = join(dir, "winui-window.fixture.ts");
  await Bun.write(file, fixture.replace(`import winui from "bun:winui";`, shim));
  const proc = Bun.spawn({ cmd: [process.execPath, file], cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (exitCode !== 0 || !stdout.includes("closed true true")) {
    console.error(`winui-smoke: exit ${exitCode}`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
