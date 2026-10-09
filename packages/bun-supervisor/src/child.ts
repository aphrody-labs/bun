import { Budget, type ShrinkLevel } from "./budget";

export type ParentMessage =
  | { type: "budget"; bytes: number }
  | { type: "shrink"; level: ShrinkLevel }
  | { type: "idle" };

export type ChildMessage = { type: "mem"; rss: number; heapUsed: number } | { type: "ready" };

export interface ChildRuntimeOptions {
  /** How often the child reports its memory to the parent. Default 5000, 0 disables. */
  reportMs?: number;
  /** Sends `{type:"ready"}` to the parent right away. */
  ready?: boolean;
}

/**
 * Child side of `Supervisor.spawnSelf`. Builds the local Budget from SUPERVISOR_BUDGET_BYTES,
 * applies `budget` and `shrink` messages from the parent and reports memory over IPC.
 */
export function childBudget(opts: ChildRuntimeOptions = {}): Budget {
  const name = process.env.SUPERVISOR_NAME ?? "child";
  const env = Number(process.env.SUPERVISOR_BUDGET_BYTES);
  const budget = env > 0 ? Budget.root({ name, bytes: env }) : Budget.fromCgroup({ name });
  const send = (msg: ChildMessage) => {
    try {
      process.send?.(msg);
    } catch {}
  };
  if (typeof process.send === "function") {
    process.on("message", (msg: any) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "budget" && msg.bytes > 0) budget.resize(msg.bytes);
      else if (msg.type === "shrink") void budget.shrink(msg.level === "hard" ? "hard" : "soft");
      else if (msg.type === "idle") void budget.idle();
    });
    const every = opts.reportMs ?? 5000;
    if (every > 0) {
      const report = () =>
        send({
          type: "mem",
          rss: process.memoryUsage().rss,
          heapUsed: process.memoryUsage().heapUsed,
        });
      report();
      setInterval(report, every).unref();
    }
    if (opts.ready) send({ type: "ready" });
  }
  return budget;
}
