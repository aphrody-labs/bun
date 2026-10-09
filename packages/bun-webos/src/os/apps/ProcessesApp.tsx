// SPDX-License-Identifier: Apache-2.0
/** Processus: the host's processes as the WebOS server reads them (/proc, bun:windows, tasklist or ps). */
import React, { useEffect, useState } from "react";
import { api, errorText } from "../api";
import { useWindowReady } from "../ready";

interface ProcessRow {
  pid: number;
  ppid: number | null;
  name: string;
  rssBytes: number | null;
  owned: boolean;
}

export const ProcessesApp: React.FC = () => {
  const setReady = useWindowReady();
  const [data, setData] = useState<{ source: string; processes: ProcessRow[]; serverPid: number } | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api<{ source: string; processes: ProcessRow[]; serverPid: number }>("/api/os/processes");
        if (alive) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        if (alive) setReady(true);
      }
    };
    void load();
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [setReady]);

  const rows = (data?.processes ?? []).filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="flex h-full flex-col bg-[#0f1117] font-mono text-xs text-gray-100">
      <div className="flex items-center gap-2 border-b border-gray-800 bg-[#161922] px-3 py-1.5 text-[11px] text-gray-400">
        <span className="flex-1">
          {data
            ? `${data.processes.length} processus · source ${data.source} · serveur pid ${data.serverPid}`
            : "Lecture…"}
        </span>
        <input
          className="w-40 rounded bg-black/30 px-2 py-0.5 outline-none"
          placeholder="filtrer"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>
      {error && <div className="bg-rose-950/60 px-3 py-1 text-rose-300">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#161922] text-left text-gray-400">
            <tr>
              <th className="px-3 py-1">PID</th>
              <th className="px-3 py-1">PPID</th>
              <th className="px-3 py-1">Nom</th>
              <th className="px-3 py-1 text-right">RSS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.pid} data-webos-process={p.pid} className={p.owned ? "text-amber-300" : "text-gray-200"}>
                <td className="px-3 py-0.5">{p.pid}</td>
                <td className="px-3 py-0.5 text-gray-500">{p.ppid ?? "—"}</td>
                <td className="px-3 py-0.5">{p.name}</td>
                <td className="px-3 py-0.5 text-right">
                  {p.rssBytes === null ? "—" : `${(p.rssBytes / (1 << 20)).toFixed(1)} MiB`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
