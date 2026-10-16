import { expect, test } from "bun:test";
import factory from "../../tools/config/fusion-factory.json";
import { JOBS, choose, cpuList, jobs, multi, plan, slotLocks, slotSets, withJobs, wrap } from "./factory.ts";

test("multi mode splits the host into slots of jobsPerSlot CPUs", () => {
  expect(multi("multi")).toBe(true);
  expect(multi("single")).toBe(false);
  if (!multi()) return;
  const { slots, jobsPerSlot } = factory.builds;
  expect(slots * jobsPerSlot).toBeLessThanOrEqual(factory.google.jobs);
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
