import { DurableObject } from "cloudflare:workers";

export type Message = { id: number; body: string; at: number };

/** A chat room: SQLite-backed history and hibernatable WebSockets, one instance per room name. */
export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, at INTEGER NOT NULL)",
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  history(limit = 50): Message[] {
    return this.ctx.storage.sql
      .exec<Message>("SELECT id, body, at FROM messages ORDER BY id DESC LIMIT ?", Math.min(limit, 200))
      .toArray()
      .reverse();
  }

  post(body: string): Message {
    const text = body.slice(0, 2000);
    const message = this.ctx.storage.sql
      .exec<Message>("INSERT INTO messages (body, at) VALUES (?, ?) RETURNING id, body, at", text, Date.now())
      .one();
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) socket.send(payload);
    return message;
  }

  async webSocketClose(socket: WebSocket, code: number) {
    socket.close(code, "closing");
  }
}
