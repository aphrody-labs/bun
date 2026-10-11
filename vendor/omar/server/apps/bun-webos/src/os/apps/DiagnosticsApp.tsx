// SPDX-License-Identifier: Apache-2.0
/** Diagnostics: benchmarks of native Bun APIs measured in a Bun Worker of the server, and bun:ffi probes. */
import React, { useEffect, useState } from "react";
import { api, errorText } from "../api";
import { useWindowReady } from "../ready";

interface BenchResult {
  name: string;
  iterations: number;
  durationMs: number;
  opsPerSec: number;
  environment: string;
}

export const DiagnosticsApp: React.FC = () => {
  const setReady = useWindowReady();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setReady(true), [setReady]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResults((await api<{ results: BenchResult[] }>("/api/benchmarks/run", { method: "POST" })).results);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0e1017] p-4 text-gray-200">
      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
        <div>
          <div className="text-sm font-semibold text-white">Diagnostics Bun</div>
          <div className="mt-0.5 font-mono text-[11px] text-gray-400">
            Mesuré dans un Worker du serveur avec Bun.nanoseconds() ; rien n'est précalculé.
          </div>
        </div>
        <button
          data-webos-action="run"
          onClick={() => void run()}
          disabled={running}
          className="rounded-lg bg-indigo-600 px-4 py-2 font-mono text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {running ? "Mesure…" : "Lancer"}
        </button>
      </div>
      {error && <div className="mt-2 text-rose-300">{error}</div>}
      <div className="mt-3 min-h-0 flex-1 overflow-auto">
        {results ? (
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b border-gray-800 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="pb-2">API</th>
                <th className="pb-2 text-right">Itérations</th>
                <th className="pb-2 text-right">Durée</th>
                <th className="pb-2 text-right">ops/s</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.name} data-webos-bench={r.name} className="border-b border-gray-800/40">
                  <td className="py-2 font-bold text-purple-300">{r.name}</td>
                  <td className="py-2 text-right">{r.iterations}</td>
                  <td className="py-2 text-right text-emerald-400">{r.durationMs} ms</td>
                  <td className="py-2 text-right">{r.opsPerSec.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-xs text-gray-500">
            « Lancer » mesure chaque API sur ce serveur.
          </div>
        )}
        {results && <div className="mt-2 font-mono text-[11px] text-gray-500">{results[0]?.environment}</div>}
      </div>
    </div>
  );
};
