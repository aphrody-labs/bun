import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";

// A Windows App Runtime (WinUI 3) framework package loads. WindowsApps is not listable without admin rights.
function hasWindowsAppRuntime() {
  if (!isWindows) return false;
  const probe = Bun.spawnSync({
    cmd: [bunExe(), "-e", `import w from "bun:winui"; process.exit(w.isSupported() ? 0 : 1)`],
    env: bunEnv,
    stdout: "ignore",
    stderr: "ignore",
  });
  return probe.exitCode === 0;
}

function project() {
  return tempDir("bun-winui", {});
}

async function run(args: string[], cwd: string) {
  await using proc = Bun.spawn({ cmd: [bunExe(), ...args], env: bunEnv, cwd, stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("bun:winui", () => {
  test("exports", async () => {
    const winui = (await import("bun:winui")).default;
    expect(Object.keys(winui).sort()).toEqual([
      "Application",
      "Element",
      "Window",
      "app",
      "isSupported",
      "runtime",
      "start",
    ]);
    expect(winui.app).toBeNull();
  });

  test.skipIf(isWindows)("is unsupported off Windows", async () => {
    const winui = (await import("bun:winui")).default;
    expect(winui.isSupported()).toBe(false);
    expect(() => winui.start()).toThrow(expect.objectContaining({ code: "ERR_WINUI_UNSUPPORTED" }));
  });

  test.skipIf(!isWindows)("reports a missing Windows App Runtime", async () => {
    using dir = project();
    const { stdout, exitCode } = await run(
      [
        "-e",
        `import winui from "bun:winui";
         console.log(winui.isSupported({ version: "0.1" }));
         try { winui.runtime({ version: "0.1" }); } catch (e) { console.log(e.code); }
         try { winui.start({ version: "x" }); } catch (e) { console.log(e.name); }`,
      ],
      String(dir),
    );
    expect(stdout).toBe("false\nERR_WINUI_RUNTIME_NOT_FOUND\nTypeError\n");
    expect(exitCode).toBe(0);
  });

  // A real WinUI 3 window: XAML tree with the core controls, properties, events, then it closes itself.
  test.skipIf(!hasWindowsAppRuntime())(
    "opens a WinUI 3 window, checks its XAML tree and closes itself",
    async () => {
      using dir = project();
      const { stdout, stderr, exitCode } = await run([join(import.meta.dir, "winui-window.fixture.ts")], String(dir));
      const [json, last] = stdout.split(/\n(?=closed )/);
      let result;
      try {
        result = JSON.parse(json);
      } catch {
        result = { stdout, stderr };
      }
      expect(result).toEqual({
        runtime: true,
        hwnd: true,
        title: "bun:winui fixture",
        loaded: true,
        tree: {
          type: "StackPanel",
          name: "root",
          children: [
            { type: "TextBlock", name: "label" },
            { type: "TextBox", name: "input" },
            { type: "PasswordBox", name: "password" },
            { type: "RichEditBox", name: "rich" },
            { type: "AutoSuggestBox", name: "search" },
            { type: "ComboBox", name: "combo" },
            { type: "CalendarDatePicker", name: "date" },
            { type: "CommandBar", name: "commands" },
            { type: "Button", name: "ok" },
            { type: "Pivot", name: "pivot" },
            { type: "CalendarView", name: "calendar" },
            { type: "ToggleSwitch", name: "toggle" },
          ],
        },
        label: "Au revoir",
        password: "secret",
        combo: "Deux",
        toggle: true,
        menu: "MenuFlyout",
        events: ["Click Button", "TextChanged modifié"],
      });
      expect(last).toBe("closed true true\n");
      expect(exitCode).toBe(0);
    },
    60_000,
  );
});
