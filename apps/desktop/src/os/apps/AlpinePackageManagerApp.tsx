// SPDX-License-Identifier: Apache-2.0
/**
 * System packages: what the server reads from `bun pm apk`, the apk or dpkg database, or Bun's own
 * system-source database. Installing calls `bun pm apk add`; nothing is listed that the host lacks.
 */
import React, { useEffect, useState } from "react";
import { api, errorText } from "../api";
import { useWindowReady } from "../ready";

interface SystemPackage {
  name: string;
  version: string;
  description: string;
  sizeBytes: number | null;
  origin: string | null;
}

interface Listing {
  source: string;
  packages: SystemPackage[];
  unavailable: string[];
}

export const AlpinePackageManagerApp: React.FC = () => {
  const setReady = useWindowReady();
  const [listing, setListing] = useState<Listing | null>(null);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      setListing(await api<Listing>("/api/os/apk/packages"));
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const install = async (name: string) => {
    setMessage(`bun pm apk add ${name}…`);
    try {
      const res = await api<{ ok: boolean; output: string }>("/api/os/apk/install", { json: { name } });
      setMessage(res.output || `${name} installé`);
      await load();
    } catch (e) {
      setMessage(errorText(e));
    }
  };

  const shown = (listing?.packages ?? []).filter(
    p => !filter || p.name.includes(filter) || p.description.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col bg-[#0f1117] text-xs text-gray-100">
      <div className="flex items-center gap-2 border-b border-gray-800 bg-[#161922] px-3 py-1.5">
        <span className="flex-1 font-mono text-[11px] text-gray-400" data-webos-result="package-source">
          {listing ? `${listing.packages.length} paquets · source ${listing.source}` : "Lecture…"}
        </span>
        <input
          className="w-40 rounded bg-black/30 px-2 py-0.5 font-mono outline-none"
          placeholder="filtrer / nom à installer"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-2 py-0.5 font-semibold text-white disabled:opacity-40"
          disabled={!filter.trim()}
          onClick={() => void install(filter.trim())}
        >
          Installer
        </button>
      </div>
      {message && <div className="whitespace-pre-wrap bg-black/40 px-3 py-1 font-mono text-amber-200">{message}</div>}
      {listing && listing.packages.length === 0 && (
        <ul className="px-3 py-2 font-mono text-gray-400">
          {listing.unavailable.map(reason => (
            <li key={reason}>· {reason}</li>
          ))}
        </ul>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <tbody>
            {shown.map(p => (
              <tr key={`${p.origin}:${p.name}`} data-webos-package={p.name} className="border-b border-gray-800/40">
                <td className="px-3 py-1 font-mono font-semibold text-sky-300">{p.name}</td>
                <td className="px-3 py-1 font-mono text-gray-400">{p.version}</td>
                <td className="px-3 py-1 text-gray-300">{p.description}</td>
                <td className="px-3 py-1 text-right font-mono text-gray-500">
                  {p.sizeBytes === null ? "" : `${(p.sizeBytes / 1024).toFixed(0)} KiB`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
