// PID 1 of the initramfs built by scripts/aphrody/initramfs.ts. The builder
// copies this file to /init behind a `#!/bin/bun` line.
//
// It mounts the pseudo file systems through bun:linux, runs the workload named
// in /etc/bun-init.json, reaps the orphans the kernel reparents to PID 1, and
// powers the machine off (or reboots) once the workload exits.
//
//   /etc/bun-init.json  { "argv": ["/bin/bun", "/app/index.ts"], "env": {}, "cwd": "/app", "onExit": "poweroff" | "reboot" | "halt" }

import linux from "bun:linux";
import { mkdirSync, readFileSync } from "node:fs";

interface InitConfig {
  argv: string[];
  env?: Record<string, string>;
  cwd?: string;
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

const workload = Bun.spawn({
  cmd: config.argv,
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
