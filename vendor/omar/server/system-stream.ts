import windows from "bun:windows";

const channels = new Set(["System", "Application", "Security"]);
const host = "127.0.0.1";
const port = 8796;
const encoder = new TextEncoder();

function parseRecordId(xml: string): number {
  const value = /<EventRecordID>(\d+)<\/EventRecordID>/u.exec(xml)?.[1];
  return value ? Number(value) : 0;
}

function collect(channel: string, after: number, initial: boolean) {
  const records = windows.eventLog.query(channel, { limit: initial ? 40 : 100, newestFirst: true }) as string[];
  return records
    .map((xml) => ({ id: parseRecordId(xml), xml }))
    .filter((record) => record.id > after)
    .sort((a, b) => a.id - b.id);
}

function snapshot() {
  return {
    observedAt: new Date().toISOString(),
    system: windows.systemInfo(),
    memory: windows.memory.status(),
    gpu: windows.gpu.d3d12.info(),
    processes: windows.processes.list(),
  };
}

Bun.serve({
  hostname: host,
  port,
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, channels: [...channels] });
    const origin=request.headers.get("origin");
    if(origin){
      try{if(new URL(origin).host!==request.headers.get("host"))return new Response("Origin refused",{status:403});}
      catch{return new Response("Origin refused",{status:403});}
    }
    if (url.pathname === "/snapshot") return Response.json(snapshot(), { headers: { "Cache-Control": "no-store" } });
    if (url.pathname !== "/events") return new Response("Not found", { status: 404 });

    const selected = url.searchParams.getAll("channel");
    const requested = selected.length ? selected : ["System", "Application"];
    if (requested.length > 3 || requested.some((channel) => !channels.has(channel))) {
      return Response.json({ error: "channels autorisés: System, Application, Security (3 maximum)" }, { status: 400 });
    }
    const client = server.upgrade(request, { data: { channels: requested } });
    return client ? undefined : new Response("WebSocket upgrade required", { status: 426 });
  },
  websocket: {
    data: {} as { channels: string[] },
    open(socket) {
      socket.send(JSON.stringify({ type: "snapshot", data: snapshot() }));
      const cursors = new Map<string, number>();
      for (const channel of socket.data.channels) {
        try {
          const records = collect(channel, 0, true);
          for (const record of records) socket.send(JSON.stringify({ type: "event", channel, id: record.id, xml: record.xml }));
          cursors.set(channel, records.at(-1)?.id ?? 0);
        } catch (error) {
          socket.send(JSON.stringify({ type: "error", channel, message: String(error) }));
          cursors.set(channel, 0);
        }
      }
      const timer = setInterval(() => {
        socket.send(JSON.stringify({ type: "snapshot", data: snapshot() }));
        for (const channel of socket.data.channels) {
          try {
            const records = collect(channel, cursors.get(channel) ?? 0, false);
            for (const record of records) {
              socket.send(JSON.stringify({ type: "event", channel, id: record.id, xml: record.xml }));
              cursors.set(channel, Math.max(cursors.get(channel) ?? 0, record.id));
            }
          } catch (error) {
            socket.send(JSON.stringify({ type: "error", channel, message: String(error) }));
          }
        }
      }, 2000);
      (socket as typeof socket & { pollTimer?: ReturnType<typeof setInterval> }).pollTimer = timer;
    },
    close(socket) {
      const timer = (socket as typeof socket & { pollTimer?: ReturnType<typeof setInterval> }).pollTimer;
      if (timer) clearInterval(timer);
    },
  },
});
