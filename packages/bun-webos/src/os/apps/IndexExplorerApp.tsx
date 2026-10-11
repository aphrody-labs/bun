// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useRef, useState } from "react";
import { api, errorText } from "../api";
import { useReadyOnMount } from "../ready";
import { ExplorerServices } from "./ExplorerServices";

type Tab = "Fichiers" | "System32" | "Graphe" | "Services" | "Chat";
type Item = {
  id?: string;
  path: string;
  name: string;
  kind?: string;
  is_directory?: number;
  imports?: number;
  exports?: number;
  bytes?: number;
  machine?: string;
};
const tabs: Tab[] = ["Fichiers", "System32", "Graphe", "Services", "Chat"];
const number = (value: number | undefined) => (value ?? 0).toLocaleString("fr-FR");
const button =
  "rounded-lg px-3 py-2 text-xs hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] disabled:opacity-40";

export const IndexExplorerApp: React.FC = () => {
  useReadyOnMount();
  const [tab, setTab] = useState<Tab>("Fichiers");
  const [graphScope, setGraphScope] = useState<"Code" | "Binaires">("Code");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ items: Item[]; more: boolean; pending?: boolean } | null>(
    null,
  );
  const [summary, setSummary] = useState<any>(null);
  const [cache, setCache] = useState<any>(null);
  const [resources, setResources] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatNotice, setChatNotice] = useState("");
  const chatAbort = useRef<AbortController | null>(null);
  const request = useRef<AbortController | null>(null);

  async function refresh() {
    try {
      const [s, c, r] = await Promise.all([
        api("/api/explorer/summary"),
        api("/api/explorer/cache").catch(() => null),
        api<any[]>("/api/explorer/resources").catch(() => []),
      ]);
      setSummary(s);
      setCache(c);
      setResources(r);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function search(next = 0, active: Tab = tab) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: query,
        mode: active === "Fichiers" ? "ntfs" : "pe",
        offset: String(next),
      });
      const route = active === "Graphe" && graphScope === "Code" ? "graph" : "search";
      const value = await api<any>(`/api/explorer/${route}?${params}`, {
        signal: controller.signal,
      });
      setResult(value);
      setOffset(next);
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e));
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      clearInterval(timer);
      request.current?.abort();
      chatAbort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (["Fichiers", "System32", "Graphe"].includes(tab)) void search(0, tab);
  }, [tab, graphScope]);

  async function inspect(item: Item) {
    if (tab === "Fichiers") {
      setSelected(item);
      return;
    }
    setError(null);
    try {
      setSelected(
        await api(
          `/api/explorer/${item.id ? "graph" : "binary"}?${new URLSearchParams(item.id ? { id: item.id } : { path: item.path })}`,
        ),
      );
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function chat() {
    if (!draft.trim() || chatBusy) return;
    const history = [...messages, { role: "user" as const, content: draft.trim() }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setChatBusy(true);
    setError(null);
    setChatNotice("");
    const controller = new AbortController();
    chatAbort.current = controller;
    let answer = "";
    try {
      const response = await fetch("/api/explorer/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `Assistant HTTP ${response.status}`);
      }
      if (!response.body) throw new Error("Le flux IA est indisponible.");
      const pruned = Number(response.headers.get("X-WebOS-History-Pruned"));
      if (pruned > 0)
        setChatNotice(
          `${pruned} anciens messages ont été retirés du contexte envoyé au modèle. La conversation affichée est conservée.`,
        );
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        pending += decoder.decode(part.value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line.slice(6).trim() === "[DONE]") continue;
          const data = JSON.parse(line.slice(6));
          answer += data.choices?.[0]?.delta?.content ?? "";
          setMessages([...history, { role: "assistant", content: answer }]);
        }
      }
      if (!answer) throw new Error("Le serveur IA n’a renvoyé aucun texte.");
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e));
    } finally {
      setChatBusy(false);
      chatAbort.current = null;
    }
  }

  const dependencies = selected?.imports?.slice(0, 12) ?? [];
  return (
    <section
      className="flex h-full min-w-0 select-text flex-col bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
      aria-label="Index explorer"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div>
          <h2 className="text-base font-semibold">Index explorer</h2>
          <p className="mt-1 text-xs opacity-65">
            {summary
              ? summary.configured
                ? `${number(summary.ntfs?.entries)} fichiers · ${number(summary.system32?.binaries)} binaires · Bun ${summary.runtime?.version}`
                : "No metadata index configured"
              : "Loading index…"}
          </p>
        </div>
        <button className={button} onClick={() => void refresh()}>
          Actualiser
        </button>
      </header>
      <nav
        className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-2"
        aria-label="Vues de l’explorateur"
      >
        {tabs.map((name) => (
          <button
            key={name}
            className={`${button} ${tab === name ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]" : ""}`}
            aria-pressed={tab === name}
            onClick={() => {
              setTab(name);
              setSelected(null);
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="mx-4 mt-3 rounded-lg bg-rose-950/40 p-3 text-xs text-rose-200">
          {error}
        </p>
      )}
      {["Fichiers", "System32", "Graphe"].includes(tab) && (
        <>
          {tab === "Graphe" && (
            <div className="flex gap-2 px-4 pt-3">
              <button
                className={button}
                aria-pressed={graphScope === "Code"}
                onClick={() => {
                  setGraphScope("Code");
                  setSelected(null);
                }}
              >
                Code
              </button>
              <button
                className={button}
                aria-pressed={graphScope === "Binaires"}
                onClick={() => {
                  setGraphScope("Binaires");
                  setSelected(null);
                }}
              >
                Binaires Windows
              </button>
              <span className="self-center text-xs opacity-60">
                {number(summary?.code?.nodes)} nœuds de code · {number(summary?.code?.edges)} liens
              </span>
            </div>
          )}
          <form
            className="flex gap-2 px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Rechercher dans {tab}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  tab === "Fichiers"
                    ? "Indexed file or directory"
                    : tab === "Graphe" && graphScope === "Code"
                      ? "Symbole ou fichier du monorepo"
                      : "EXE ou DLL de System32"
                }
                className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)]"
              />
            </label>
            <button
              className={`${button} bg-[var(--md-sys-color-primary-container)]`}
              disabled={busy}
            >
              Rechercher
            </button>
          </form>
          <div className="min-h-0 flex-1 overflow-auto px-4" aria-busy={busy}>
            {tab === "Graphe" && selected && (
              <div className="mb-4 overflow-x-auto rounded-xl border border-white/10">
                <svg
                  viewBox="0 0 780 300"
                  className="min-w-[600px] w-full"
                  role="img"
                  aria-label={`Dépendances de ${selected.relative_path}`}
                >
                  {dependencies.map((item: any, i: number) => {
                    const x = i % 2 ? 600 : 160;
                    const y = 35 + Math.floor(i / 2) * 45;
                    return (
                      <g
                        key={item.id ?? `${item.module}:${i}`}
                        role={item.id ? "button" : undefined}
                        tabIndex={item.id ? 0 : undefined}
                        onClick={() =>
                          item.id && void inspect({ id: item.id, path: "", name: item.module })
                        }
                        onKeyDown={(e) => {
                          if (item.id && ["Enter", " "].includes(e.key)) {
                            e.preventDefault();
                            void inspect({ id: item.id, path: "", name: item.module });
                          }
                        }}
                        style={{ cursor: item.id ? "pointer" : undefined }}
                      >
                        <line x1="380" y1="150" x2={x} y2={y} stroke="currentColor" opacity="0.2" />
                        <circle cx={x} cy={y} r="4" fill="var(--md-sys-color-primary)" />
                        <text
                          x={x + (i % 2 ? 10 : -10)}
                          y={y + 4}
                          textAnchor={i % 2 ? "start" : "end"}
                          fill="currentColor"
                          fontSize="11"
                        >
                          {item.module}
                        </text>
                      </g>
                    );
                  })}
                  <circle cx="380" cy="150" r="42" fill="var(--md-sys-color-primary-container)" />
                  <text
                    x="380"
                    y="154"
                    textAnchor="middle"
                    fill="var(--md-sys-color-on-primary-container)"
                    fontSize="11"
                  >
                    {selected.relative_path.split(/[\\/]/).at(-1)?.slice(0, 17)}
                  </text>
                </svg>
                <p className="px-3 pb-3 text-xs opacity-65">
                  Aperçu de {dependencies.length} dépendances sur {selected.import_module_count}. Le
                  graphe SQLite conserve les liens indexés.
                </p>
              </div>
            )}
            {busy && (
              <p role="status" className="pb-3 text-xs opacity-65">
                Recherche…
              </p>
            )}
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <caption className="sr-only">Résultats de recherche dans {tab}</caption>
              <thead className="sticky top-0 bg-[var(--md-sys-color-surface-container)]">
                <tr>
                  <th scope="col" className="p-2">
                    Nom
                  </th>
                  <th scope="col" className="p-2">
                    {tab === "Fichiers" || (graphScope === "Code" && tab === "Graphe")
                      ? "Type"
                      : "Imports / exports"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result?.items.map((item, i) => (
                  <tr key={`${item.id ?? item.path}:${i}`} className="align-top">
                    <th
                      scope="row"
                      className="max-w-[560px] border-b border-white/5 py-2 pr-3 font-normal"
                    >
                      <button
                        className="block max-w-full text-left text-[var(--md-sys-color-primary)] underline-offset-4 hover:underline focus-visible:outline-2"
                        onClick={() => void inspect(item)}
                      >
                        {item.name}
                      </button>
                      <p className="mt-1 break-all text-[10px] opacity-60">{item.path}</p>
                    </th>
                    <td className="whitespace-nowrap border-b border-white/5 p-2 opacity-70">
                      {item.kind ??
                        (tab === "Fichiers"
                          ? item.is_directory
                            ? "Dossier"
                            : "Fichier"
                          : `${number(item.imports)} / ${number(item.exports)}`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!busy && !result?.items.length && (
              <p className="py-6 text-sm opacity-65">
                {result?.pending
                  ? "L’index NTFS est en cours de génération. Actualisez après sa fin."
                  : "Aucun résultat. Essayez un autre nom."}
              </p>
            )}
            {selected && tab !== "Graphe" && (
              <aside className="my-4 rounded-xl border border-white/10 p-3">
                <h3 className="break-all text-sm font-semibold">
                  {selected.relative_path ?? selected.name}
                </h3>
                <p className="mt-2 break-all text-xs opacity-70">{selected.path}</p>
                {selected.sha256 && (
                  <>
                    <p className="mt-2 text-xs">
                      {selected.machine}, {selected.bits} bits ·{" "}
                      {number(selected.import_symbol_count)} symboles importés ·{" "}
                      {number(selected.export_count)} exports
                    </p>
                    <p className="mt-2 break-all text-[10px] opacity-60">
                      SHA-256 {selected.sha256}
                    </p>
                    <button
                      className={`${button} mt-2`}
                      onClick={() => {
                        setGraphScope("Binaires");
                        setTab("Graphe");
                      }}
                    >
                      Voir les dépendances
                    </button>
                  </>
                )}
              </aside>
            )}
          </div>
          <footer className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-xs">
            <span>
              Résultats {number(result?.items.length ? offset + 1 : 0)}–
              {number(offset + (result?.items.length ?? 0))}
            </span>
            <div>
              <button
                className={button}
                disabled={!offset || busy}
                onClick={() => void search(Math.max(0, offset - 50))}
              >
                Précédents
              </button>
              <button
                className={button}
                disabled={!result?.more || busy}
                onClick={() => void search(offset + 50)}
              >
                Suivants
              </button>
            </div>
          </footer>
        </>
      )}
      {tab === "Services" && <ExplorerServices resources={resources} cache={cache} />}
      {tab === "Chat" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="px-4 pt-3 text-xs opacity-65">Configured assistant</p>
          {chatNotice && (
            <p className="px-4 pt-2 text-xs opacity-65" role="status">
              {chatNotice}
            </p>
          )}
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4" aria-live="polite">
            {!messages.length && (
              <p className="text-sm opacity-65">Écrivez un message pour ouvrir la conversation.</p>
            )}
            {messages.map((message, i) => (
              <article
                key={i}
                className={`max-w-[80ch] rounded-xl p-3 text-sm ${message.role === "user" ? "ml-auto bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]" : "bg-[var(--md-sys-color-surface-container)]"}`}
              >
                <p className="mb-1 text-xs opacity-60">
                  {message.role === "user" ? "You" : "Assistant"}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.content || "Réponse…"}</p>
              </article>
            ))}
          </div>
          <form
            className="flex items-end gap-2 border-t border-white/10 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void chat();
            }}
          >
            <label className="flex-1">
              <span className="sr-only">Message for the configured assistant</span>
              <textarea
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="w-full resize-none rounded-lg border border-white/15 bg-transparent p-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)]"
              />
            </label>
            {chatBusy ? (
              <button type="button" className={button} onClick={() => chatAbort.current?.abort()}>
                Arrêter
              </button>
            ) : (
              <button
                className={`${button} bg-[var(--md-sys-color-primary-container)]`}
                disabled={!draft.trim()}
              >
                Envoyer
              </button>
            )}
          </form>
        </div>
      )}
    </section>
  );
};
