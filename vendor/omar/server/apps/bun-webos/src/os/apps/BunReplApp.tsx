// SPDX-License-Identifier: Apache-2.0
/**
 * Bun REPL. "natif": the code runs in a child `bun -p` of the WebOS server, in the WebOS home, with
 * every Bun API. "bun_wasm": the code runs on the page's engine with the Bun subset bun_wasm provides
 * (semver, markdown, shell parser; files go to the same home), when the server has bun_wasm.wasm.
 */
import React, { useEffect, useRef, useState } from "react";
import { api, errorText, type CommandResult } from "../api";
import { useWindowReady } from "../ready";
import { WORKER_BASE, type ReplRequest, type ReplResponse } from "../wasm/protocol";

interface Line {
  kind: "in" | "out" | "err" | "log";
  text: string;
}

type Engine = "native" | "wasm";

const COLOR: Record<Line["kind"], string> = {
  in: "text-sky-300",
  out: "text-gray-100",
  err: "text-red-400",
  log: "text-gray-400",
};

export const BunReplApp: React.FC = () => {
  const setReady = useWindowReady();
  const [engine, setEngine] = useState<Engine>("native");
  const [lines, setLines] = useState<Line[]>([]);
  const [last, setLast] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasmState, setWasmState] = useState<string>("non chargé");
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(1);

  useEffect(() => setReady(true), [setReady]);
  useEffect(() => () => worker.current?.terminate(), []);

  const push = (line: Line) => setLines(l => [...l, line]);

  const startWasm = () => {
    if (worker.current) return;
    setWasmState("chargement…");
    const w = new Worker(`${WORKER_BASE}/repl.js`, { type: "module", name: "bun-repl" });
    worker.current = w;
    w.onmessage = (event: MessageEvent<ReplResponse>) => {
      const m = event.data;
      if (m.type === "ready") setWasmState(`Bun ${m.bunVersion} (bun_wasm)`);
      else if (m.type === "failed") setWasmState(`indisponible : ${m.error}`);
      else if (m.type === "log") push({ kind: m.level === "log" ? "log" : "err", text: m.text });
      else {
        push({ kind: m.ok ? "out" : "err", text: m.text });
        setLast(m.text);
        setBusy(false);
      }
    };
    w.onerror = e => setWasmState(`indisponible : ${e.message}`);
    w.postMessage({ type: "init" } satisfies ReplRequest);
  };

  const submit = async () => {
    const code = input.trim();
    if (!code || busy) return;
    push({ kind: "in", text: code });
    setInput("");
    if (engine === "wasm") {
      if (!worker.current) startWasm();
      setBusy(true);
      worker.current!.postMessage({ type: "eval", id: nextId.current++, code } satisfies ReplRequest);
      return;
    }
    setBusy(true);
    try {
      const res = await api<CommandResult>("/api/os/eval", { json: { code } });
      if (res.stdout) push({ kind: "out", text: res.stdout.replace(/\n$/, "") });
      if (res.stderr) push({ kind: "err", text: res.stderr.replace(/\n$/, "") });
      setLast(res.stdout + res.stderr);
    } catch (e) {
      push({ kind: "err", text: errorText(e) });
      setLast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0f1117] font-mono text-xs text-gray-100">
      <div className="flex items-center gap-2 border-b border-gray-800 bg-[#161922] px-3 py-1 text-[11px] text-gray-400">
        {(["native", "wasm"] as const).map(e => (
          <button
            key={e}
            className={`rounded-full px-2 py-0.5 ${engine === e ? "bg-amber-600 text-white" : "hover:bg-white/10"}`}
            onClick={() => {
              setEngine(e);
              if (e === "wasm") startWasm();
            }}
          >
            {e === "native" ? "natif (bun -p)" : "bun_wasm (page)"}
          </button>
        ))}
        <span className="flex-1 truncate">
          {engine === "native" ? "Toutes les API Bun, dans le home WebOS" : wasmState}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {lines.map((l, i) => (
          <pre key={i} className={`whitespace-pre-wrap ${COLOR[l.kind]}`}>
            {l.kind === "in" ? `› ${l.text}` : l.text}
          </pre>
        ))}
        <pre className="hidden" data-webos-result="output" data-webos-output="">
          {last}
        </pre>
      </div>
      <div className="flex border-t border-gray-800">
        <textarea
          data-webos-input=""
          className="h-20 flex-1 resize-none bg-transparent p-2 outline-none"
          placeholder={'Bun.semver.satisfies("1.4.0", "^1.2")  (Ctrl+Entrée)'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          data-webos-action="run"
          disabled={busy}
          className="bg-amber-600 px-4 font-semibold text-white disabled:opacity-50"
          onClick={() => void submit()}
        >
          {busy ? "…" : "Exécuter"}
        </button>
      </div>
    </div>
  );
};
