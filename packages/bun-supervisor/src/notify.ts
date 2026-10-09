import { dlopen, ptr } from "bun:ffi";

type Libc = {
  socket(domain: number, type: number, protocol: number): number;
  sendto(
    fd: number,
    buf: any,
    len: number | bigint,
    flags: number,
    addr: any,
    addrlen: number,
  ): number | bigint;
  close(fd: number): number;
};

export const AF_UNIX = 1;
export const SOCK_DGRAM = 2;
const SOCK_CLOEXEC = 0x80000;
const MSG_NOSIGNAL = 0x4000;

let libc: Libc | null | undefined;

/** Loads libc through `bun:ffi`. Works inside `bun build --compile` executables. Returns null off Linux. */
export function loadLibc(): Libc | null {
  if (libc !== undefined) return libc;
  libc = null;
  if (process.platform !== "linux") return libc;
  for (const name of ["libc.so.6", "libc.musl-x86_64.so.1", "libc.musl-aarch64.so.1", "libc.so"]) {
    try {
      const lib = dlopen(name, {
        socket: { args: ["i32", "i32", "i32"], returns: "i32" },
        sendto: { args: ["i32", "ptr", "u64", "i32", "ptr", "u32"], returns: "i64" },
        close: { args: ["i32"], returns: "i32" },
      });
      libc = lib.symbols as unknown as Libc;
      break;
    } catch {}
  }
  return libc;
}

/** Builds a `sockaddr_un`. A leading `@` selects the abstract namespace. */
export function unixAddress(path: string): { addr: Uint8Array; length: number } {
  const bytes = Buffer.from(path);
  if (bytes.length === 0 || bytes.length > 107) throw new RangeError("invalid unix socket path");
  const addr = new Uint8Array(110);
  addr[0] = AF_UNIX;
  addr.set(bytes, 2);
  if (bytes[0] === 0x40) {
    addr[2] = 0;
    return { addr, length: 2 + bytes.length };
  }
  return { addr, length: 2 + bytes.length + 1 };
}

/**
 * Sends one `sd_notify` datagram to `$NOTIFY_SOCKET`.
 * Returns false when the variable is unset, off Linux, or when the send fails.
 */
export function sdNotify(state: string): boolean {
  const target = process.env.NOTIFY_SOCKET;
  if (!target) return false;
  const c = loadLibc();
  if (!c) return false;
  let fd = -1;
  try {
    const { addr, length } = unixAddress(target);
    fd = c.socket(AF_UNIX, SOCK_DGRAM | SOCK_CLOEXEC, 0);
    if (fd < 0) return false;
    const msg = Buffer.from(state);
    return Number(c.sendto(fd, ptr(msg), msg.length, MSG_NOSIGNAL, ptr(addr), length)) >= 0;
  } catch {
    return false;
  } finally {
    if (fd >= 0) c.close(fd);
  }
}

export const notifyReady = (status?: string): boolean =>
  sdNotify(status ? `READY=1\nSTATUS=${status}` : "READY=1");
export const notifyStopping = (): boolean => sdNotify("STOPPING=1");
export const notifyStatus = (status: string): boolean => sdNotify(`STATUS=${status}`);
export const notifyReloading = (): boolean =>
  sdNotify(`RELOADING=1\nMONOTONIC_USEC=${process.hrtime.bigint() / 1000n}`);

export interface WatchdogOptions {
  health: () => boolean | Promise<boolean>;
  /** Defaults to WATCHDOG_USEC / 2. */
  intervalMs?: number;
  /** Overrides WATCHDOG_USEC. */
  usec?: number;
}

/**
 * Sends `WATCHDOG=1` every WATCHDOG_USEC/2 while `health()` is true.
 * No-op when WATCHDOG_USEC is unset or WATCHDOG_PID names another process. Returns `stop()`.
 */
export function startWatchdog(opts: WatchdogOptions): () => void {
  const usec = opts.usec ?? Number(process.env.WATCHDOG_USEC ?? 0);
  const pid = process.env.WATCHDOG_PID;
  if (!(usec > 0) || (pid && Number(pid) !== process.pid)) return () => {};
  const every = opts.intervalMs ?? Math.max(1, Math.floor(usec / 2000));
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      if (await opts.health()) sdNotify("WATCHDOG=1");
    } catch {
    } finally {
      busy = false;
    }
  }, every);
  timer.unref();
  return () => clearInterval(timer);
}
