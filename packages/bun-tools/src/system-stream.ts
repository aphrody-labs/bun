import type { ServerWebSocket } from "bun";

// Adapted from aphrody-labs/omar server/system-stream.ts at d565a5a67d570e3648c091c351698781fb24bf54.
export interface SystemStreamSource {
  snapshot(): unknown;
  events(channel: string, limit: number): string[];
}

export interface SystemStreamOptions {
  port?: number;
  channels?: string[];
  intervalMs?: number;
  source?: SystemStreamSource;
}

type Connection = {
  channels: string[];
  cursors: Map<string, bigint>;
  timer?: ReturnType<typeof setInterval>;
};

export function eventRecordId(xml: string): bigint | null {
  const value = /<EventRecordID>(\d+)<\/EventRecordID>/u.exec(xml)?.[1];
  return value === undefined ? null : BigInt(value);
}

export async function startSystemStream(options: SystemStreamOptions = {}) {
  const intervalMs = options.intervalMs ?? 2000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 50) throw new Error("intervalMs must be at least 50");
  const channels = new Set(options.channels ?? ["System", "Application"]);
  if (!channels.size || channels.size > 16 || [...channels].some(name => !name || name.length > 128)) {
    throw new Error("Expected 1 to 16 explicit event channels");
  }
  let source = options.source;
  if (!source) {
    if (process.platform !== "win32") throw new Error("Native system events require Windows");
    const windows = (await import("bun:windows")).default;
    source = {
      snapshot: () => ({
        observedAt: new Date().toISOString(),
        system: windows.systemInfo(),
        memory: windows.memory.status(),
        processes: windows.processes.list(),
      }),
      events: (channel, limit) => windows.eventLog.query(channel, { limit, newestFirst: true }),
    };
  }
  const provider = source;
  const connections = new Set<ServerWebSocket<Connection>>();
  function publish(socket: ServerWebSocket<Connection>, initial: boolean) {
    try {
      if (socket.send(JSON.stringify({ type: "snapshot", data: provider.snapshot() })) <= 0) return;
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "System snapshot unavailable" }));
    }
    for (const channel of socket.data.channels) {
      try {
        const records = provider
          .events(channel, initial ? 40 : 100)
          .map(xml => ({ id: eventRecordId(xml), xml }))
          .filter((record): record is { id: bigint; xml: string } => record.id !== null)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        let cursor = socket.data.cursors.get(channel) ?? 0n;
        if (records.length && records.at(-1)!.id < cursor) {
          socket.send(JSON.stringify({ type: "reset", channel }));
          cursor = 0n;
        }
        for (const record of records) {
          if (record.id <= cursor) continue;
          // Retain the cursor when the socket cannot accept an event.
          const accepted = socket.send(
            JSON.stringify({ type: "event", channel, id: record.id.toString(), xml: record.xml }),
          );
          if (accepted === 0) break;
          cursor = record.id;
          if (accepted < 0) break;
        }
        socket.data.cursors.set(channel, cursor);
      } catch {
        socket.send(JSON.stringify({ type: "error", channel, message: "Event channel unavailable" }));
      }
    }
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    fetch(request, server) {
      const url = new URL(request.url);
      const peer = server.requestIP(request)?.address;
      const origin = request.headers.get("origin");
      if (
        url.hostname !== "127.0.0.1" ||
        Number(url.port || 80) !== server.port ||
        (peer && peer !== "127.0.0.1" && peer !== "::ffff:127.0.0.1") ||
        (origin !== null && origin !== url.origin) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      ) {
        return new Response("Host access refused", { status: 403 });
      }
      if (url.pathname === "/health") return Response.json({ ok: true, channels: [...channels] });
      if (url.pathname === "/snapshot") {
        try {
          return Response.json(provider.snapshot(), { headers: { "Cache-Control": "no-store" } });
        } catch {
          return Response.json({ error: "System snapshot unavailable" }, { status: 503 });
        }
      }
      if (url.pathname !== "/events") return new Response("Not found", { status: 404 });
      const selected = url.searchParams.getAll("channel");
      const requested = selected.length ? selected : [...channels];
      if (requested.length > channels.size || requested.some(channel => !channels.has(channel))) {
        return new Response("Event channel refused", { status: 400 });
      }
      return server.upgrade(request, { data: { channels: requested, cursors: new Map() } })
        ? undefined
        : new Response("WebSocket upgrade required", { status: 426 });
    },
    websocket: {
      data: {} as Connection,
      open(socket) {
        connections.add(socket);
        publish(socket, true);
        socket.data.timer = setInterval(() => publish(socket, false), intervalMs);
      },
      message() {},
      close(socket) {
        clearInterval(socket.data.timer);
        connections.delete(socket);
      },
    },
  });
  return {
    server,
    async stop() {
      for (const socket of connections) {
        clearInterval(socket.data.timer);
        socket.close(1001, "Stopping");
      }
      connections.clear();
      await server.stop(true);
    },
  };
}
