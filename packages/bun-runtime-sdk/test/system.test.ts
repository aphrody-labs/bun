// SPDX-License-Identifier: MIT
import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";
import { ProcessExitedError, processes, system } from "../src/system.ts";

test("system identity and statistics belong to the running Bun executable", () => {
  const info = system.info();
  expect(info.name).toBe("bun");
  expect(info.version).toBe(Bun.version);
  expect(info.revision).toBe(Bun.revision);
  expect(info.executable).toBe(process.execPath);
  const stats = system.stats();
  expect(stats.os).toBe(process.platform);
  expect(stats.arch).toBe(process.arch);
  expect(stats.cpuCores).toBeGreaterThan(0);
  expect(stats.totalMemoryBytes).toBeGreaterThan(0);
  expect(stats.freeMemoryBytes).toBeLessThanOrEqual(stats.totalMemoryBytes);
});

test("native subprocess owner captures both binary streams and nonzero status", async () => {
  await using child = processes.spawn({
    program: bunExe(),
    args: [
      "-e",
      "process.stdout.write(Buffer.from([0,255,128,42]));process.stderr.write(Buffer.from([254,0]));process.exitCode=7",
    ],
    env: bunEnv,
    stdio: "capture-lossless",
  });
  const output = await child.collectOutput();
  expect([...output.stdout]).toEqual([0, 255, 128, 42]);
  expect([...output.stderr]).toEqual([254, 0]);
  expect(output.status.running).toBe(false);
  expect(output.status.exitCode).toBe(7);
});

test("capture limits stop the owned subprocess before rejecting", async () => {
  await using child = processes.spawn({
    program: bunExe(),
    args: ["-e", "process.stdout.write(Buffer.alloc(4096,42));setInterval(()=>{},1000)"],
    env: bunEnv,
    stdio: "capture-lossless",
    maxOutputBytes: 100,
  });
  await expect(child.collectOutput()).rejects.toThrow("byte budget");
  expect(child.status().running).toBe(false);
});

test("pre-aborted collection stops its child and preserves the abort reason", async () => {
  await using child = processes.spawn({
    program: bunExe(),
    args: ["-e", "setInterval(()=>{},1000)"],
    env: bunEnv,
    stdio: "capture-lossless",
  });
  const signal = AbortSignal.abort(new Error("cancel owned process"));
  await expect(child.collectOutput({ signal })).rejects.toThrow("cancel owned process");
  await child.stopAsync();
  expect(child.status().running).toBe(false);
});

test("readiness awaits pipe data and rejects process exit before a line", async () => {
  await using ready = processes.spawn({
    program: bunExe(),
    args: ["-e", "console.log('ready');setInterval(()=>{},1000)"],
    env: bunEnv,
    stdio: "capture-lossless",
  });
  expect(await ready.waitForStdoutLine()).toBe("ready");
  expect(ready.status().running).toBe(true);
  await using exited = processes.spawn({
    program: bunExe(),
    args: ["-e", "process.exitCode=3"],
    env: bunEnv,
    stdio: "capture-lossless",
  });
  await expect(exited.waitForStdoutLine()).rejects.toBeInstanceOf(ProcessExitedError);
  expect(exited.status().exitCode).toBe(3);
});

test("HTTP readiness observes a loopback response without following another host", async () => {
  using server = Bun.serve({ port: 0, fetch: () => new Response(null, { status: 204 }) });
  expect(await processes.probeHttp("127.0.0.1", server.port!)).toBe(204);
  await expect(processes.probeHttp("127.0.0.1", server.port!, "http://other.invalid/")).rejects.toThrow(
    "selected host",
  );
});
