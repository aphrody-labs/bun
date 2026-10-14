// The processes that the tests of `bun lint`, `bun fmt` and `bun check` start.
//
// A test that runs out of time never gets to the end of its `await using`, and `bun test` ends what such a test has started only
// if the test ran alone: not in a concurrent group, where these tests are. A linter in an endless loop would run on, and when
// `bun test` is through, without a parent. So each has a limit of its own, and what is left at the end of the file is ended:
//
//     afterAll(endChildren);
import { isASAN, isDebug } from "harness";

const running = new Set<{ kill(signal: "SIGKILL"): void }>();

/** Concurrent native CLI fixtures need a bounded pool, unless they are testing a thread setting. */
export function nativeThreads(args: string[], bunfig?: string): string[] {
  const separator = args.indexOf("--");
  const flags = separator < 0 ? args : args.slice(0, separator);
  if (flags.some(arg => /^--threads(?:=|$)/.test(arg))) return [];
  if (bunfig) {
    try {
      if ((Bun.TOML.parse(bunfig) as { lint?: { threads?: unknown } }).lint?.threads !== undefined) return [];
    } catch {
      // Invalid configuration still goes to the native parser and keeps its diagnostic.
    }
  }
  return ["--threads", "1"];
}

/** `Bun.spawn`. `timeout` can be set to less. */
export function spawn<
  const In extends Bun.SpawnOptions.Writable = "ignore",
  const Out extends Bun.SpawnOptions.Readable = "pipe",
  const Err extends Bun.SpawnOptions.Readable = "inherit",
>(options: Bun.SpawnOptions.SpawnOptions<In, Out, Err> & { cmd: string[] }): Bun.Subprocess<In, Out, Err> {
  const proc = Bun.spawn({ timeout: isDebug || isASAN ? 100_000 : 30_000, killSignal: "SIGKILL", ...options });
  running.add(proc);
  void proc.exited.then(() => running.delete(proc));
  return proc;
}

/** For what takes long by its nature: just below the limit that a test has on CI, which is 90 s, and 270 s with ASAN. */
export const longLimit = isDebug || isASAN ? 250_000 : 80_000;

export function endChildren() {
  for (const proc of running) proc.kill("SIGKILL");
  running.clear();
}
