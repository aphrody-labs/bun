(() => {
  const h = globalThis.webkit && webkit.messageHandlers && webkit.messageHandlers.__bunConsole;
  if (!h) return;
  const remote = v => {
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return { type: t, value: v };
    if (t === "undefined") return { type: "undefined" };
    if (t === "bigint") return { type: "bigint", description: v + "n" };
    if (t === "symbol") return { type: "symbol", description: String(v) };
    if (v === null) return { type: "object", subtype: "null", value: null };
    let description;
    try {
      description = v instanceof Error ? v.name + ": " + v.message + (v.stack ? "\n" + v.stack : "") : String(v);
    } catch {
      description = Object.prototype.toString.call(v);
    }
    const o = { type: t, className: (v.constructor && v.constructor.name) || "Object", description };
    try {
      if (t === "object" && !(v instanceof Node)) o.value = JSON.parse(JSON.stringify(v));
    } catch {}
    return o;
  };
  const types = {
    log: "log",
    info: "info",
    warn: "warning",
    error: "error",
    debug: "debug",
    trace: "trace",
    dir: "dir",
    table: "table",
  };
  for (const name of Object.keys(types)) {
    const orig = console[name];
    console[name] = function (...args) {
      try {
        h.postMessage(JSON.stringify({ type: types[name], args: args.map(remote) }));
      } catch {}
      return orig.apply(this, args);
    };
  }
})();
