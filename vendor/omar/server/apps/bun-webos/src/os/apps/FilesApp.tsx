// SPDX-License-Identifier: Apache-2.0
/**
 * Files: the WebOS home on the server. Listing and reading go through Bun.file (hash: Bun.hash,
 * Markdown: Bun.markdown.html), search through Bun.Glob, folder download through Bun.Archive.
 */
import React, { useCallback, useEffect, useState } from "react";
import { api, errorText } from "../api";
import { useWindowReady } from "../ready";

interface Entry {
  name: string;
  kind: "file" | "dir" | "symlink" | "other";
  size: number;
  mtimeMs: number;
}

interface OpenFile {
  path: string;
  size: number;
  hash: string;
  text: string | null;
  html: string | null;
  truncated: boolean;
}

const join = (dir: string, name: string) => `${dir.replace(/\/$/, "")}/${name}`;
const parent = (dir: string) => dir.replace(/\/[^/]*$/, "") || "/";
const ICON: Record<Entry["kind"], string> = { dir: "📁", file: "📄", symlink: "🔗", other: "❔" };

function size(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1 << 20
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / (1 << 20)).toFixed(1)} MiB`;
}

export const FilesApp: React.FC = () => {
  const setReady = useWindowReady();
  const [cwd, setCwd] = useState("/");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState<OpenFile | null>(null);
  const [draft, setDraft] = useState("");
  const [pattern, setPattern] = useState("");
  const [matches, setMatches] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (dir: string) => {
      try {
        const res = await api<{ path: string; entries: Entry[] }>(`/api/os/vfs/list?path=${encodeURIComponent(dir)}`);
        setCwd(res.path);
        setEntries(res.entries);
        setError(null);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setReady(true);
      }
    },
    [setReady],
  );

  useEffect(() => {
    void load("/");
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load(cwd);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const openEntry = async (entry: Entry) => {
    const path = join(cwd, entry.name);
    if (entry.kind === "dir") return load(path);
    try {
      const file = await api<OpenFile>(`/api/os/vfs/read?path=${encodeURIComponent(path)}`);
      setOpen(file);
      setDraft(file.text ?? "");
    } catch (e) {
      setError(errorText(e));
    }
  };

  const ask = (label: string, initial = "") => globalThis.prompt(label, initial)?.trim();

  return (
    <div className="flex h-full flex-col bg-[#0f1117] text-xs text-gray-100">
      <div className="flex items-center gap-1 border-b border-gray-800 bg-[#161922] px-2 py-1.5">
        <button
          className="rounded px-2 py-1 hover:bg-white/10"
          disabled={cwd === "/"}
          onClick={() => void load(parent(cwd))}
        >
          ↑
        </button>
        <span className="flex-1 truncate font-mono text-gray-300" data-webos-result="cwd">
          {cwd}
        </span>
        <button
          className="rounded px-2 py-1 hover:bg-white/10"
          onClick={() => {
            const name = ask("Nouveau fichier");
            if (name) void run(() => api("/api/os/vfs/write", { json: { path: join(cwd, name), text: "" } }));
          }}
        >
          + fichier
        </button>
        <button
          className="rounded px-2 py-1 hover:bg-white/10"
          onClick={() => {
            const name = ask("Nouveau dossier");
            if (name) void run(() => api("/api/os/vfs/mkdir", { json: { path: join(cwd, name) } }));
          }}
        >
          + dossier
        </button>
        <a
          className="rounded px-2 py-1 hover:bg-white/10"
          href={`/api/os/vfs/archive?path=${encodeURIComponent(cwd)}`}
          download
        >
          tar.gz
        </a>
        <input
          className="w-32 rounded bg-black/30 px-2 py-1 font-mono outline-none"
          placeholder="**/*.md"
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          onKeyDown={async e => {
            if (e.key !== "Enter") return;
            if (!pattern.trim()) return setMatches(null);
            try {
              const res = await api<{ matches: string[] }>(
                `/api/os/vfs/search?path=${encodeURIComponent(cwd)}&pattern=${encodeURIComponent(pattern)}`,
              );
              setMatches(res.matches);
            } catch (err) {
              setError(errorText(err));
            }
          }}
        />
      </div>
      {error && <div className="bg-rose-950/60 px-3 py-1 text-rose-300">{error}</div>}
      <div className="flex min-h-0 flex-1">
        <ul className="w-1/2 overflow-auto border-r border-gray-800">
          {matches !== null
            ? matches.map(m => (
                <li key={m} className="truncate px-3 py-1 font-mono text-gray-300" data-webos-match={m}>
                  {m}
                </li>
              ))
            : entries.map(e => (
                <li
                  key={e.name}
                  className="group flex items-center gap-2 px-2 py-1 hover:bg-white/5"
                  data-webos-entry={e.name}
                >
                  <button className="flex-1 truncate text-left" onClick={() => void openEntry(e)}>
                    {ICON[e.kind]} {e.name}
                  </button>
                  <span className="text-gray-500">{e.kind === "dir" ? "" : size(e.size)}</span>
                  <button
                    className="hidden text-gray-400 hover:text-white group-hover:inline"
                    onClick={() => {
                      const to = ask("Renommer en", e.name);
                      if (to && to !== e.name)
                        void run(() =>
                          api("/api/os/vfs/move", { json: { from: join(cwd, e.name), to: join(cwd, to) } }),
                        );
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="hidden text-rose-400 hover:text-rose-200 group-hover:inline"
                    onClick={() => {
                      if (globalThis.confirm(`Supprimer ${e.name} ?`))
                        void run(() => api("/api/os/vfs/remove", { json: { path: join(cwd, e.name) } }));
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
          {matches === null && entries.length === 0 && <li className="px-3 py-2 text-gray-500">Dossier vide</li>}
        </ul>
        <div className="flex w-1/2 flex-col">
          {open ? (
            <>
              <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-1 font-mono text-[11px] text-gray-400">
                <span className="flex-1 truncate">{open.path}</span>
                <span title="Bun.hash (wyhash)">#{open.hash}</span>
                {open.text !== null && (
                  <button
                    className="rounded bg-sky-700 px-2 py-0.5 text-white"
                    onClick={() => void run(() => api("/api/os/vfs/write", { json: { path: open.path, text: draft } }))}
                  >
                    Enregistrer
                  </button>
                )}
              </div>
              {open.html !== null ? (
                <div
                  className="prose prose-invert max-h-1/2 overflow-auto border-b border-gray-800 p-3"
                  dangerouslySetInnerHTML={{ __html: open.html }}
                />
              ) : null}
              {open.text !== null ? (
                <textarea
                  className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono outline-none"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                />
              ) : (
                <div className="p-3 text-gray-400">
                  Fichier binaire ({size(open.size)}) —{" "}
                  <a href={`/api/os/vfs/raw?path=${encodeURIComponent(open.path)}`}>télécharger</a>
                </div>
              )}
              {open.truncated && <div className="px-3 py-1 text-amber-300">Affichage limité au premier MiB.</div>}
            </>
          ) : (
            <div className="m-auto text-gray-500">Sélectionnez un fichier</div>
          )}
        </div>
      </div>
    </div>
  );
};
