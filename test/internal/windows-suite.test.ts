import { expect, test } from "bun:test";
import { buildCommand } from "../../scripts/aphrody/windows-suite";

test("Windows source builds route through Bun owners", () => {
  expect(buildCommand("roslyn").slice(0, 3)).toEqual([process.execPath, "dotnet", "build"]);
  expect(buildCommand("terminal").slice(0, 4)).toEqual([process.execPath, "msvc", "exec", "--"]);
  expect(buildCommand("vcpkg")[0]).toBe("cmd.exe");
  expect(buildCommand("powershell")[0]).toBe("pwsh");
});
