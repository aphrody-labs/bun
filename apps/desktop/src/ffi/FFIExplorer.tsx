// SPDX-License-Identifier: Apache-2.0
/**
 * bun:ffi on the WebOS server: `dlopen` of the host C library (its getpid must equal the server pid)
 * and `cc`, which compiles a C function with Bun's built-in TinyCC and calls it.
 */
import React, { useEffect, useState } from "react";
import { api, errorText } from "../os/api";
import { useWindowReady } from "../os/ready";

type FfiProbe =
  | { ok: true; library: string; symbol: string; value: number; matchesProcessPid: boolean }
  | { ok: false; tried: string[]; error: string };

type CcResult =
  | { ok: true; source: string; calls: { args: [number, number]; result: number }[] }
  | { ok: false; error: string };

export const FFIExplorer: React.FC = () => {
  const setReady = useWindowReady();
  const [probe, setProbe] = useState<FfiProbe | null>(null);
  const [cc, setCc] = useState<CcResult | null>(null);
  const [a, setA] = useState(84);
  const [b, setB] = useState(36);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<FfiProbe>("/api/ffi/probe")
      .then(setProbe, e => setError(errorText(e)))
      .finally(() => setReady(true));
  }, [setReady]);

  const compile = async () => {
    try {
      setCc(await api<CcResult>("/api/ffi/cc", { json: { pairs: [[a, b]] } }));
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 bg-[#0f1117] p-4 font-mono text-xs text-gray-200">
      <section className="rounded-lg border border-gray-800 p-3">
        <div className="mb-1 font-sans text-sm font-semibold text-white">dlopen</div>
        {probe === null ? (
          "…"
        ) : probe.ok ? (
          <div data-webos-result="ffi-dlopen">
            {probe.library} · {probe.symbol}() = {probe.value}{" "}
            {probe.matchesProcessPid ? "= process.pid ✓" : "≠ process.pid"}
          </div>
        ) : (
          <div className="text-rose-300">
            {probe.tried.join(", ")} : {probe.error}
          </div>
        )}
      </section>
      <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-800 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-sans text-sm font-semibold text-white">cc (TinyCC)</span>
          <input
            type="number"
            className="w-20 rounded bg-black/30 px-2 py-0.5"
            value={a}
            onChange={e => setA(Number(e.target.value))}
          />
          <input
            type="number"
            className="w-20 rounded bg-black/30 px-2 py-0.5"
            value={b}
            onChange={e => setB(Number(e.target.value))}
          />
          <button
            data-webos-action="run"
            className="rounded bg-slate-600 px-3 py-0.5 text-white"
            onClick={() => void compile()}
          >
            Compiler et appeler
          </button>
        </div>
        {cc?.ok && (
          <>
            <pre className="overflow-auto rounded bg-black/40 p-2 text-gray-300">{cc.source}</pre>
            {cc.calls.map(c => (
              <div key={c.args.join(",")} data-webos-result="ffi-cc">
                webos_gcd({c.args.join(", ")}) = {c.result}
              </div>
            ))}
          </>
        )}
        {cc && !cc.ok && <div className="text-rose-300">{cc.error}</div>}
      </section>
      {error && <div className="text-rose-300">{error}</div>}
    </div>
  );
};
