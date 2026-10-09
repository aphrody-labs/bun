// PID 1 of the initramfs built by scripts/aphrody/initramfs.ts. The builder
// copies this file to /init behind a `#!/bin/bun` line.
//
// It mounts the pseudo file systems through bun:linux, runs the workload named
// in /etc/bun-init.json, reaps the orphans the kernel reparents to PID 1, and
// powers the machine off (or reboots) once the workload exits.
//
//   /etc/bun-init.json  { "argv": ["/bin/bun", "/app/index.ts"], "argv0": "app", "env": {}, "cwd": "/app",
//                         "hostname": "aphrody",
//                         "network": { "address": "10.0.2.15/24", "gateway": "10.0.2.2", "dns": ["10.0.2.3"] },
//                         "modules": ["/lib/modules/virtio_net.ko.gz"],
//                         "onExit": "poweroff" | "reboot" | "halt" }
//
// "network" without "address" asks for a DHCP lease; a network failure is
// logged and the workload still starts.

import linux from "bun:linux";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { configureNetwork, type NetworkConfig } from "./initramfs-net.ts";

interface InitConfig {
  argv: string[];
  argv0?: string;
  env?: Record<string, string>;
  cwd?: string;
  hostname?: string;
  network?: NetworkConfig;
  modules?: string[];
  onExit?: "poweroff" | "reboot" | "halt";
}

const c = linux.constants;
const SECURE = c.MS_NOSUID | c.MS_NODEV | c.MS_NOEXEC;

function mountOnce(source: string, target: string, fstype: string, flags: number, data?: string) {
  mkdirSync(target, { recursive: true });
  try {
    linux.mount(source, target, fstype, flags, data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EBUSY") throw error;
  }
}

mountOnce("proc", "/proc", "proc", SECURE);
mountOnce("sysfs", "/sys", "sysfs", SECURE);
mountOnce("devtmpfs", "/dev", "devtmpfs", c.MS_NOSUID, "mode=0755");
mountOnce("devpts", "/dev/pts", "devpts", c.MS_NOSUID | c.MS_NOEXEC, "gid=5,mode=0620,ptmxmode=0666");
mountOnce("tmpfs", "/run", "tmpfs", c.MS_NOSUID | c.MS_NODEV, "mode=0755");
mountOnce("tmpfs", "/tmp", "tmpfs", c.MS_NOSUID | c.MS_NODEV, "mode=1777");

const config: InitConfig = JSON.parse(readFileSync("/etc/bun-init.json", "utf8"));
if (config.hostname) writeFileSync("/proc/sys/kernel/hostname", config.hostname);
for (const module of config.modules ?? []) {
  try {
    const bytes = readFileSync(module);
    const image = module.endsWith(".gz")
      ? Bun.gunzipSync(bytes)
      : module.endsWith(".zst")
        ? Bun.zstdDecompressSync(bytes)
        : bytes;
    linux.initModule(image, "");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EEXIST")
      console.error(`bun-init: ${module}: ${(error as Error).message}`);
  }
}
if (config.network) {
  try {
    const lease = await configureNetwork(linux, config.network, config.hostname);
    const via = lease.gateway ? ` via ${lease.gateway}` : "";
    console.log(
      `bun-init: ${config.network.interface ?? "eth0"} ${lease.address}/${lease.prefix}${via} dns ${lease.dns.join(",")}`,
    );
  } catch (error) {
    console.error(`bun-init: network: ${(error as Error).message}`);
  }
}

const workload = Bun.spawn({
  cmd: config.argv,
  argv0: config.argv0,
  cwd: config.cwd ?? "/",
  env: { PATH: "/bin:/usr/bin", HOME: "/root", TERM: "linux", ...config.env },
  stdio: ["inherit", "inherit", "inherit"],
});

// Orphans become zombies of PID 1 until it waits for them. The workload is
// excluded so that `workload.exited` still observes its status.
const reaper = setInterval(() => linux.reapOrphans([workload.pid]), 1000);

const code = await workload.exited;
clearInterval(reaper);
linux.reapOrphans();
console.log(`bun-init: workload exited with ${code}`);

const command =
  config.onExit === "reboot" ? c.RB_AUTOBOOT : config.onExit === "halt" ? c.RB_HALT_SYSTEM : c.RB_POWER_OFF;
linux.reboot(command);
