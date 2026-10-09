import { dlopen, ptr } from "bun:ffi";
import { afterEach, describe, expect, test } from "bun:test";
import { isLinux } from "harness";
import {
  notifyReady,
  notifyReloading,
  notifyStatus,
  notifyStopping,
  sdNotify,
  startWatchdog,
  unixAddress,
} from "../../../../packages/bun-supervisor/src";

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["NOTIFY_SOCKET", "WATCHDOG_USEC", "WATCHDOG_PID"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function waitFor<T>(fn: () => T | undefined | false, ms = 10_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error("timed out");
    await Bun.sleep(2);
  }
}

describe("notify without a socket", () => {
  test("is a no-op when NOTIFY_SOCKET is unset", () => {
    delete process.env.NOTIFY_SOCKET;
    expect(sdNotify("READY=1")).toBe(false);
    expect(notifyReady()).toBe(false);
    expect(notifyStopping()).toBe(false);
    expect(notifyStatus("x")).toBe(false);
    expect(notifyReloading()).toBe(false);
  });

  test("watchdog does nothing without WATCHDOG_USEC or for another pid", () => {
    delete process.env.WATCHDOG_USEC;
    let calls = 0;
    startWatchdog({ health: () => (calls++, true) })();
    process.env.WATCHDOG_USEC = "20000";
    process.env.WATCHDOG_PID = String(process.pid + 1);
    startWatchdog({ health: () => (calls++, true), intervalMs: 1 })();
    expect(calls).toBe(0);
  });

  test("unixAddress marks abstract sockets with a leading NUL", () => {
    const abstract = unixAddress("@name");
    expect([abstract.addr[0], abstract.addr[2], abstract.addr[3], abstract.length]).toEqual([
      1, 0, 110, 7,
    ]);
    const path = unixAddress("/run/notify");
    expect([path.addr[2], path.length]).toEqual([0x2f, 14]);
  });
});

describe.skipIf(!isLinux)("notify over a unix datagram socket", () => {
  function receiver(name: string) {
    const lib = dlopen("libc.so.6", {
      socket: { args: ["i32", "i32", "i32"], returns: "i32" },
      bind: { args: ["i32", "ptr", "u32"], returns: "i32" },
      recv: { args: ["i32", "ptr", "u64", "i32"], returns: "i64" },
      close: { args: ["i32"], returns: "i32" },
    }).symbols;
    const fd = lib.socket(1, 2, 0);
    const { addr, length } = unixAddress(name);
    expect(lib.bind(fd, ptr(addr), length)).toBe(0);
    const buf = Buffer.alloc(512);
    const messages: string[] = [];
    return {
      messages,
      poll() {
        const n = Number(lib.recv(fd, ptr(buf), buf.length, 0x40));
        if (n > 0) messages.push(buf.subarray(0, n).toString());
        return messages.length > 0;
      },
      close: () => lib.close(fd),
    };
  }

  const abstractName = () =>
    `@bun-supervisor-test-${process.pid}-${Math.random().toString(36).slice(2)}`;

  test("sends ready, status, stopping and reloading to an abstract address", async () => {
    const name = abstractName();
    const rx = receiver(name);
    try {
      process.env.NOTIFY_SOCKET = name;
      expect(notifyReady("up")).toBe(true);
      expect(notifyStatus("busy")).toBe(true);
      expect(notifyStopping()).toBe(true);
      expect(notifyReloading()).toBe(true);
      await waitFor(() => (rx.poll(), rx.messages.length >= 4));
      expect(rx.messages.slice(0, 3)).toEqual(["READY=1\nSTATUS=up", "STATUS=busy", "STOPPING=1"]);
      expect(rx.messages[3]).toMatch(/^RELOADING=1\nMONOTONIC_USEC=\d+$/);
    } finally {
      rx.close();
    }
  });

  test("watchdog pings only while health() is true", async () => {
    const name = abstractName();
    const rx = receiver(name);
    try {
      process.env.NOTIFY_SOCKET = name;
      process.env.WATCHDOG_USEC = "20000";
      delete process.env.WATCHDOG_PID;
      let healthy = false;
      let checks = 0;
      const stop = startWatchdog({
        health: () => (checks++, healthy),
      });
      await waitFor(() => checks >= 3);
      rx.poll();
      expect(rx.messages).toEqual([]);
      healthy = true;
      await waitFor(() => (rx.poll(), rx.messages.length >= 1));
      expect(rx.messages[0]).toBe("WATCHDOG=1");
      stop();
    } finally {
      rx.close();
    }
  });
});
