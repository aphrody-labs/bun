import { expect, test } from "bun:test";
import { dotnet } from "../src/index.ts";

test("le SDK .NET peut être interrogé depuis Bun", async () => {
  const result = await dotnet(["--version"]);
  expect(result.stdout.trim()).toBe("10.0.401");
  expect(result.exitCode).toBe(0);
});
