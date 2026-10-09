// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { parseApkInstalled, parseDpkgStatus } from "../src/server/packages";
import { parsePs, parseTasklist } from "../src/server/processes";

test("apk installed database", () => {
  const db = [
    "C:Q1abc=\nP:musl\nV:1.2.5-r10\nA:x86_64\nS:400000\nI:409600\nT:the musl c library\no:musl\n",
    "P:busybox\nV:1.37.0-r30\nT:Size optimized toolbox\n",
    "V:no-name\n",
  ].join("\n");
  expect(parseApkInstalled(db)).toEqual([
    { name: "musl", version: "1.2.5-r10", description: "the musl c library", sizeBytes: 409600, origin: "musl" },
    { name: "busybox", version: "1.37.0-r30", description: "Size optimized toolbox", sizeBytes: null, origin: null },
  ]);
});

test("dpkg status keeps installed packages only", () => {
  const status = [
    "Package: bash\nStatus: install ok installed\nInstalled-Size: 7000\nVersion: 5.2.37-1\nDescription: GNU Bourne Again SHell\n",
    "Package: gone\nStatus: deinstall ok config-files\nVersion: 1\n",
    "Package: libc6\nStatus: install ok installed\nSource: glibc\nVersion: 2.41-6\nDescription: GNU C Library\n",
  ].join("\n");
  expect(parseDpkgStatus(status)).toEqual([
    { name: "bash", version: "5.2.37-1", description: "GNU Bourne Again SHell", sizeBytes: 7000 * 1024, origin: null },
    { name: "libc6", version: "2.41-6", description: "GNU C Library", sizeBytes: null, origin: "glibc" },
  ]);
});

test("tasklist csv", () => {
  const csv = '"System Idle Process","0","Services","0","8 K"\r\n"bun.exe","4242","Console","1","54 236 K"\r\n';
  expect(parseTasklist(csv)).toEqual([
    { pid: 0, ppid: null, name: "System Idle Process", rssBytes: 8 * 1024 },
    { pid: 4242, ppid: null, name: "bun.exe", rssBytes: 54236 * 1024 },
  ]);
});

test("ps -axo pid=,ppid=,rss=,comm=", () => {
  const ps = "    1     0  1024 /sbin/init\n  300     1   512 /usr/bin/my app\ngarbage\n";
  expect(parsePs(ps)).toEqual([
    { pid: 1, ppid: 0, name: "/sbin/init", rssBytes: 1024 * 1024 },
    { pid: 300, ppid: 1, name: "/usr/bin/my app", rssBytes: 512 * 1024 },
  ]);
});
