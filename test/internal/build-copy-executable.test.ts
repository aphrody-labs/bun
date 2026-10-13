import { expect, test } from "bun:test";
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "harness";
import { copyExecutable } from "../../scripts/build/copy-executable";
import { unlockRunningExe } from "../../scripts/build/lock";

test.skipIf(process.platform !== "win32")(
  "copy releases an executable started after configure and preserves its process",
  async () => {
    using directory = tempDir("build-copy-executable", {});
    const executable = join(String(directory), "running.exe");
    const input = join(String(directory), "replacement");
    copyFileSync(process.execPath, executable);
    unlockRunningExe(executable);
    writeFileSync(input, "new executable payload");
    await using child = Bun.spawn({
      cmd: [
        executable,
        "-e",
        "console.log('ready'); for await (const data of Bun.stdin.stream()) { break; } console.log('preserved');",
      ],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const reader = child.stdout.getReader();
    try {
      expect(new TextDecoder().decode((await reader.read()).value).trim()).toBe("ready");
      expect(child.exitCode).toBeNull();
      copyExecutable(input, executable);
      expect(await Bun.file(executable).text()).toBe("new executable payload");
      child.stdin.write("release\n");
      child.stdin.end();
      expect(new TextDecoder().decode((await reader.read()).value).trim()).toBe("preserved");
      expect(await child.exited).toBe(0);
      expect(await child.stderr.text()).toBe("");
    } finally {
      reader.releaseLock();
      child.kill();
    }
  },
);
