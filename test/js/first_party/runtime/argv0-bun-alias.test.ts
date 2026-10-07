// Aphrody fork: a compiled executable linked as `bun` is the engine (one `yolo` file, aliases bun and vu by argv0).
import { describe, expect, test } from "bun:test";
import { bunExe, tempDir } from "harness";
import { symlinkSync } from "node:fs";
import { join } from "node:path";

describe.skipIf(process.platform === "win32")("compiled executable argv0 aliases", () => {
  test("yolo runs the embedded program, bun and a plain bun-named link run the engine", async () => {
    using dir = tempDir("argv0-alias", {
      "main.ts": 'console.log("embedded program", process.argv0.split("/").pop());\n',
    });
    const exe = join(String(dir), "yolo");
    const compile = Bun.spawnSync({
      cmd: [bunExe(), "build", "--compile", join(String(dir), "main.ts"), "--outfile", exe],
      cwd: String(dir),
    });
    expect(compile.stderr.toString()).not.toContain("error");
    expect(compile.exitCode).toBe(0);

    const asYolo = Bun.spawnSync([exe]);
    expect(asYolo.stdout.toString().trim()).toBe("embedded program yolo");

    symlinkSync("yolo", join(String(dir), "bun"));
    const asBun = Bun.spawnSync([join(String(dir), "bun"), "-e", 'console.log("engine", typeof Bun.version)']);
    expect(asBun.stderr.toString()).toBe("");
    expect(asBun.stdout.toString().trim()).toBe("engine string");

    // The engine still starts the program when asked to: `bun <file>` runs the file, not the payload.
    const asBunFile = Bun.spawnSync([join(String(dir), "bun"), join(String(dir), "main.ts")]);
    expect(asBunFile.stdout.toString().trim()).toBe("embedded program bun");

    // `bunx` is the engine too, so a `bunx -> yolo` link runs packages instead of the payload.
    symlinkSync("yolo", join(String(dir), "bunx"));
    const asBunx = Bun.spawnSync([join(String(dir), "bunx"), "--version"]);
    expect(asBunx.stdout.toString().trim()).toBe(Bun.version);

    // A `node -> yolo` link (Bun's Node.js alias) runs scripts with the engine.
    symlinkSync("yolo", join(String(dir), "node"));
    const asNode = Bun.spawnSync([join(String(dir), "node"), "-e", 'console.log("engine")']);
    expect(asNode.stdout.toString().trim()).toBe("engine");
  });

  test("BUN_BE_BUN=1 keeps working under the original name", () => {
    using dir = tempDir("argv0-be-bun", { "main.ts": 'console.log("payload");\n' });
    const exe = join(String(dir), "yolo");
    expect(
      Bun.spawnSync({ cmd: [bunExe(), "build", "--compile", join(String(dir), "main.ts"), "--outfile", exe] }).exitCode,
    ).toBe(0);
    const r = Bun.spawnSync({ cmd: [exe, "-e", 'console.log("engine")'], env: { ...process.env, BUN_BE_BUN: "1" } });
    expect(r.stdout.toString().trim()).toBe("engine");
  });
});
