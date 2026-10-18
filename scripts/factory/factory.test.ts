import { expect, test } from "bun:test";
import factory from "../../tools/config/fusion-factory.json";
import { JOBS, choose, cpuList, jobs, multi, plan, slotLocks, slotSets, slots, withJobs, wrap } from "./factory.ts";

test("multi mode splits the host into slots of jobsPerSlot CPUs", () => {
  expect(multi("multi")).toBe(true);
  expect(multi("single")).toBe(false);
  if (!multi()) return;
  const { slots, jobsPerSlot } = factory.builds;
  expect(slots * jobsPerSlot).toBeLessThanOrEqual(factory.google.jobs);
  if (process.platform !== "win32")
    expect(slotLocks()).toEqual([
      "/home/ubuntu/build/locks/heavy.lock",
      "/home/ubuntu/build/locks/heavy.1.lock",
      "/home/ubuntu/build/locks/heavy.2.lock",
    ]);
  expect(cpuList([0])).toBe("0-3");
  expect(cpuList([1, 2])).toBe("4-7,8-11");
  expect(jobs(1)).toBe(4);
  expect(jobs(2)).toBe(8);
  expect(jobs(9)).toBe(12);
});

test("slot sets are ascending so concurrent builds never deadlock", () => {
  expect(slotSets(1, 3)).toEqual([[0], [1], [2]]);
  expect(slotSets(2, 3)).toEqual([
    [0, 1],
    [0, 2],
    [1, 2],
  ]);
  for (const set of slotSets(2, 3)) expect([...set].sort()).toEqual(set);
});

test("wrap takes every held slot, then pins and renices the command", () => {
  if (!multi()) return;
  if (process.platform === "win32") {
    const command = wrap(["ninja"], [1], false);
    expect(command.slice(0, 1)).toEqual([process.execPath]);
    expect(command.slice(2)).toEqual(["--windows-locks", "try", "1", "--", "ninja"]);
    return;
  }
  expect(wrap(["ninja"], [1], false)).toEqual([
    "flock",
    "-n",
    "-E",
    "222",
    "/home/ubuntu/build/locks/heavy.1.lock",
    "taskset",
    "-c",
    "4-7",
    "nice",
    "-n",
    "10",
    "ninja",
  ]);
  expect(wrap(["ninja"], [0, 2], true).slice(0, 4)).toEqual([
    "flock",
    "/home/ubuntu/build/locks/heavy.lock",
    "flock",
    "/home/ubuntu/build/locks/heavy.2.lock",
  ]);
});

test.skipIf(process.platform !== "win32")(
  "Windows factory mutex excludes other processes and releases after owner termination",
  async () => {
    const previous = process.env.BUN_FACTORY_LOCK_ROOT;
    process.env.BUN_FACTORY_LOCK_ROOT = `${import.meta.dir}/../../build/factory/test-${crypto.randomUUID()}`;
    const module = new URL("./factory.ts", import.meta.url).href;
    const holder = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `
    const { windowsSlotLock } = await import(${JSON.stringify(module)});
    const release = windowsSlotLock(0, false);
    if (!release) throw new Error("Test slot was taken");
    console.log("held");
    await new Response(Bun.stdin.stream()).text();
    release();
  `,
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env }, windowsHide: true, timeout: 10_000 },
    );
    try {
      const reader = holder.stdout.getReader();
      const ready = await reader.read();
      reader.releaseLock();
      expect(new TextDecoder().decode(ready.value).trim()).toBe("held");
      expect(slots()[0]!.taken).toBe(true);
      const rejected = Bun.spawn(
        [
          process.execPath,
          import.meta.dir + "/factory.ts",
          "--windows-locks",
          "try",
          "0",
          "--",
          process.execPath,
          "--eval",
          'console.log("must-not-run")',
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env },
          windowsHide: true,
          timeout: 5000,
        },
      );
      expect(await new Response(rejected.stdout).text()).toBe("");
      expect(await rejected.exited).toBe(222);
      holder.kill();
      await holder.exited;
      expect(slots()[0]!.taken).toBe(false);
      const next = Bun.spawn(
        [
          process.execPath,
          import.meta.dir + "/factory.ts",
          "run",
          "--max-slots",
          "1",
          "--",
          process.execPath,
          "--eval",
          'console.log("next-build")',
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env },
          windowsHide: true,
          timeout: 5000,
        },
      );
      expect(await new Response(next.stdout).text()).toContain("next-build");
      expect(await new Response(next.stderr).text()).toBe("");
      expect(await next.exited).toBe(0);
      expect(slots()[0]!.taken).toBe(false);
      const wrapper = Bun.spawn(
        [
          process.execPath,
          import.meta.dir + "/factory.ts",
          "--windows-locks",
          "try",
          "0",
          "--",
          process.execPath,
          "--eval",
          "console.log(process.pid); setInterval(() => {}, 1000)",
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env },
          windowsHide: true,
          timeout: 5000,
        },
      );
      try {
        const output = wrapper.stdout.getReader();
        const ready = await output.read();
        output.releaseLock();
        const pid = Number(new TextDecoder().decode(ready.value).trim());
        expect(pid).toBeGreaterThan(0);
        const { dlopen } = require("bun:ffi") as typeof import("bun:ffi");
        const kernel = dlopen("kernel32.dll", {
          OpenProcess: { args: ["u32", "i32", "u32"], returns: "ptr" },
          WaitForSingleObject: { args: ["ptr", "u32"], returns: "u32" },
          CloseHandle: { args: ["ptr"], returns: "i32" },
        });
        const processHandle = kernel.symbols.OpenProcess(0x100000, 0, pid);
        expect(processHandle).not.toBeNull();
        try {
          wrapper.kill();
          await wrapper.exited;
          expect(kernel.symbols.WaitForSingleObject(processHandle, 5000)).toBe(0);
          expect(slots()[0]!.taken).toBe(false);
        } finally {
          kernel.symbols.CloseHandle(processHandle);
          kernel.close();
        }
      } finally {
        wrapper.kill();
        await wrapper.exited;
      }
    } finally {
      holder.kill();
      await holder.exited;
      if (previous === undefined) delete process.env.BUN_FACTORY_LOCK_ROOT;
      else process.env.BUN_FACTORY_LOCK_ROOT = previous;
    }
  },
  15_000,
);

test("a step alone takes every free slot, within its bounds", () => {
  if (!multi()) return;
  expect(choose([0, 1, 2], 1)).toEqual([0, 1, 2]);
  expect(choose([1, 2], 1)).toEqual([1, 2]);
  expect(choose([0, 1, 2], 2, 2)).toEqual([0, 1]);
  expect(choose([2], 2)).toBeUndefined();
  expect(choose([], 1)).toBeUndefined();
  expect(withJobs(["ninja", "-j", JOBS], 3)).toEqual(["ninja", "-j", "12"]);
});

test("chromium builds in two slots, syncs and generates in one", () => {
  if (!multi()) return;
  const steps = plan("chromium");
  const build = steps.find(s => s.argv[0] === "autoninja")!;
  expect(build.slots).toBe(2);
  expect(build.maxSlots).toBe(2);
  expect(build.argv).toContain(JOBS);
  for (const s of steps.filter(s => s.argv[0] === "gclient" && s.argv[1] === "sync")) expect(s.slots).toBe(1);
  expect(steps.find(s => s.argv[0] === "gn")!.slots).toBe(1);
});
