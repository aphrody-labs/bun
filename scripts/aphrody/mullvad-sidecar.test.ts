import { expect, test } from "bun:test";
import { createMullvadBuildPlan, MULLVAD_ASSET, MULLVAD_LINUX_TARGET } from "./mullvad-sidecar.ts";

const bunSource = "a".repeat(40);
const mullvadSource = "b".repeat(40);

test("Mullvad VPS release plan keeps the daemon in its own Linux sidecar", () => {
  const plan = createMullvadBuildPlan(bunSource, mullvadSource);
  expect(plan.target).toBe(MULLVAD_LINUX_TARGET);
  expect(plan.asset).toBe(MULLVAD_ASSET);
  expect(plan.workingDirectory).toBe("plugins/vpn/vendor/mullvad");
  expect(plan.factoryLock).toBe("/home/ubuntu/build/locks/heavy.lock");
  expect(plan.cargo[0]?.[0]).toBe("/home/ubuntu/src/aphrody/scripts/build/rust/cargo-serial.sh");
  expect(plan.cargo[0]?.[1]).toBe("+1.97.1");
  expect(plan.runtimeLinked).toBe(false);
  expect(plan.performanceQualified).toBe(false);
  expect(plan.smoke.some(([binary]) => binary === "mullvad-exclude")).toBe(false);
  expect(plan.cargo[0]).toContain("mullvad-daemon/cgroup2");
  expect(plan.files).toContain("usr/bin/mullvad-daemon");
  expect(plan.files).toContain("usr/lib/systemd/system/mullvad-early-boot-blocking.service");
  expect(plan.files).toContain("usr/share/doc/bun-vpn/THIRD_PARTY.md");
  expect(plan.requirements).toContain(
    "/dev/net/tun and CAP_NET_ADMIN (normally root) are required to create a tunnel and update routes/firewall.",
  );
});

test("Mullvad VPS release plan requires immutable Bun and vendor revisions", () => {
  expect(() => createMullvadBuildPlan("main", mullvadSource)).toThrow("Exact Bun and Mullvad source revisions");
  expect(() => createMullvadBuildPlan(bunSource, "HEAD")).toThrow("Exact Bun and Mullvad source revisions");
});
