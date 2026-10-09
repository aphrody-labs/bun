// Runs test/js/bun/winui/winui-window.fixture.ts (a real WinUI 3 window) with this Bun, which needs the
// bun:winui and bun:winrt builtins (a fork build: `bun bd scripts/aphrody/winui-smoke.ts` or a canary).
//   bun scripts/aphrody/winui-smoke.ts
import { join } from "node:path";

const probe = Bun.spawnSync({ cmd: [process.execPath, "-e", `require("bun:winui"); require("bun:winrt")`], stderr: "pipe" });
if (probe.exitCode !== 0) {
  console.error(`winui-smoke: ${process.execPath} (Bun ${Bun.version}) has no bun:winui/bun:winrt builtin`);
  process.exit(2);
}

const fixture = join(import.meta.dir, "..", "..", "test/js/bun/winui/winui-window.fixture.ts");
const proc = Bun.spawn({ cmd: [process.execPath, fixture], stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
process.stdout.write(stdout);
process.stderr.write(stderr);
if (exitCode !== 0 || !stdout.includes("closed true true")) {
  console.error(`winui-smoke: exit ${exitCode}`);
  process.exit(1);
}
