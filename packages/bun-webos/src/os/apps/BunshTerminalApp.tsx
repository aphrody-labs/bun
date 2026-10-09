// SPDX-License-Identifier: Apache-2.0
/**
 * Terminal. "pty": an interactive shell on Bun.Terminal through the /api/os/pty WebSocket — bunsh
 * (Bun Shell as a login shell) when the server's Bun has it, the host shell otherwise. "Bun Shell":
 * each line runs once through `$` on the server (/api/os/exec). Output is shown without ANSI styling.
 */
import React, { useEffect, useRef, useState } from "react";
import { api, errorText, type CommandResult } from "../api";
import { useWindowReady } from "../ready";

interface BunshTerminalAppProps {
  /** False when `appId` names no application. */
  onOpenApp?: (appId: string) => boolean;
}

type Mode = "pty" | "shell";

// CSI, OSC and two-byte escape sequences; enough for a line-oriented view of a PTY.
// oxlint-disable-next-line no-control-regex -- matching terminal escape sequences is the point
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|\r(?!\n)/g;
const MAX_CHARS = 200_000;

export const BunshTerminalApp: React.FC<BunshTerminalAppProps> = ({ onOpenApp }) => {
  const setReady = useWindowReady();
  const [mode, setMode] = useState<Mode>("pty");
  const [status, setStatus] = useState("connexion…");
  const [output, setOutput] = useState("");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const socket = useRef<WebSocket | null>(null);
  const bottom = useRef<HTMLSpanElement | null>(null);

  const append = (text: string) => setOutput(prev => (prev + text).slice(-MAX_CHARS));

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [output]);

  useEffect(() => {
    if (mode !== "pty") {
      setStatus("Bun Shell ($) — une commande par ligne");
      setReady(true);
      return;
    }
    const url = new URL("/api/os/pty?cols=110&rows=32", location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    socket.current = ws;
    const decoder = new TextDecoder();
    ws.onmessage = event => {
      if (typeof event.data === "string") {
        const msg = JSON.parse(event.data) as {
          type: string;
          shell?: string;
          bunsh?: boolean;
          pid?: number;
          code?: number;
          error?: string;
        };
        if (msg.type === "started") setStatus(`${msg.bunsh ? "bunsh" : msg.shell} · pid ${msg.pid} · Bun.Terminal`);
        else if (msg.type === "exit") setStatus(`shell terminé (code ${msg.code})`);
        else if (msg.type === "error") setStatus(`échec : ${msg.error}`);
        setReady(true);
        return;
      }
      append(decoder.decode(event.data as ArrayBuffer, { stream: true }).replace(ANSI, ""));
    };
    ws.onerror = () => {
      setStatus("PTY indisponible : mode Bun Shell");
      setMode("shell");
    };
    ws.onclose = event => {
      if (event.code !== 1000)
        setStatus(s => (s.startsWith("échec") ? s : `déconnecté (${event.code} ${event.reason})`));
      setReady(true);
    };
    return () => ws.close();
  }, [mode, setReady]);

  const runLine = async (line: string) => {
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (cmd === "clear") return setOutput("");
    if (cmd === "open" && onOpenApp)
      return append(onOpenApp(args[0] ?? "") ? `open ${args[0]}\n` : `open: application inconnue '${args[0]}'\n`);
    if (mode === "pty" && socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(`${line}\r`);
      return;
    }
    append(`$ ${line}\n`);
    try {
      const res = await api<CommandResult>("/api/os/exec", { json: { command: line } });
      append(res.stdout + res.stderr + (res.exitCode === 0 ? "" : `[code ${res.exitCode}]\n`));
    } catch (e) {
      append(`${errorText(e)}\n`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const line = input;
      setInput("");
      setCursor(-1);
      if (line.trim()) setHistory(h => [...h, line]);
      void runLine(line);
    } else if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const next = cursor === -1 ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setInput(history[next]);
    } else if (e.key === "ArrowDown" && cursor !== -1) {
      e.preventDefault();
      const next = cursor + 1;
      setCursor(next >= history.length ? -1 : next);
      setInput(next >= history.length ? "" : history[next]);
    } else if (e.key === "c" && e.ctrlKey && mode === "pty") {
      e.preventDefault();
      socket.current?.send("\x03");
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0c10] p-2 font-mono text-xs text-gray-200">
      <div className="flex items-center gap-2 pb-1 text-[11px] text-gray-400">
        {(["pty", "shell"] as const).map(m => (
          <button
            key={m}
            className={`rounded-full px-2 py-0.5 ${mode === m ? "bg-purple-700 text-white" : "hover:bg-white/10"}`}
            onClick={() => setMode(m)}
          >
            {m === "pty" ? "PTY" : "Bun Shell"}
          </button>
        ))}
        <span className="truncate" data-webos-result="shell">
          {status}
        </span>
      </div>
      <pre
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap leading-relaxed"
        data-webos-result="output"
        data-webos-output=""
      >
        {output}
        <span ref={bottom} />
      </pre>
      <div className="flex items-center gap-2 border-t border-gray-800/80 pt-2">
        <span className="font-bold text-purple-400">❯</span>
        <input
          data-webos-input=""
          className="flex-1 bg-transparent text-white caret-purple-400 outline-none"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          placeholder="ls, echo $HOME, bun --version, open files…"
        />
      </div>
    </div>
  );
};
