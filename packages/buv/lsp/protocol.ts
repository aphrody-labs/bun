// SPDX-License-Identifier: Apache-2.0
export type Message = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: any };
};

export class Frames {
  #header = Buffer.alloc(0);
  #body: Buffer | null = null;
  #offset = 0;
  readonly maxBytes: number;

  constructor(maxBytes = 8 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024)
      throw new RangeError("invalid LSP message limit");
    this.maxBytes = maxBytes;
  }

  push(chunk: Uint8Array): Message[] {
    const messages: Message[] = [];
    let input = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    while (input.length) {
      if (!this.#body) {
        const before = this.#header.length;
        const take = Math.min(input.length, 8196 - before);
        this.#header = Buffer.concat([this.#header, input.subarray(0, take)]);
        const separator = this.#header.indexOf("\r\n\r\n");
        if (separator < 0) {
          if (this.#header.length >= 8196) throw new RangeError("LSP header exceeds 8192 bytes");
          input = input.subarray(take);
          continue;
        }
        if (separator > 8192) throw new RangeError("LSP header exceeds 8192 bytes");
        const headers = this.#header.subarray(0, separator).toString("ascii").split("\r\n");
        let length: number | undefined;
        for (const line of headers) {
          const colon = line.indexOf(":");
          if (colon <= 0) throw new TypeError("invalid LSP header");
          const key = line.slice(0, colon).toLowerCase();
          const value = line.slice(colon + 1).trim();
          if (key === "content-length") {
            if (length !== undefined || !/^\d+$/.test(value)) throw new TypeError("invalid LSP Content-Length");
            length = Number(value);
          } else if (key === "content-type") {
            const charset = value.match(/charset\s*=\s*([^;\s]+)/i)?.[1]?.toLowerCase();
            if (charset && charset !== "utf-8" && charset !== "utf8") throw new TypeError("LSP requires UTF-8");
          }
        }
        if (!Number.isSafeInteger(length) || length! < 1 || length! > this.maxBytes)
          throw new RangeError("invalid LSP body length");
        const consumed = separator + 4 - before;
        input = input.subarray(consumed);
        this.#header = Buffer.alloc(0);
        this.#body = Buffer.allocUnsafe(length!);
        this.#offset = 0;
      }
      const take = Math.min(input.length, this.#body.length - this.#offset);
      input.copy(this.#body, this.#offset, 0, take);
      input = input.subarray(take);
      this.#offset += take;
      if (this.#offset === this.#body.length) {
        const message = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(this.#body));
        this.#body = null;
        if (
          !message ||
          typeof message !== "object" ||
          Array.isArray(message) ||
          message.jsonrpc !== "2.0" ||
          (message.id !== undefined &&
            message.id !== null &&
            typeof message.id !== "string" &&
            typeof message.id !== "number") ||
          (message.method !== undefined && typeof message.method !== "string")
        )
          throw new TypeError("invalid JSON-RPC message");
        messages.push(message);
      }
    }
    return messages;
  }

  finish(): void {
    if (this.#body || this.#header.length) throw new Error("truncated LSP message");
  }
}

export function frame(message: Message, maxBytes = 8 * 1024 * 1024): Uint8Array {
  const body = Buffer.from(JSON.stringify(message));
  if (body.length > maxBytes) throw new RangeError("LSP body exceeds byte limit");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

export async function* readMessages(
  stream: ReadableStream<Uint8Array>,
  maxBytes?: number,
  signal?: AbortSignal,
): AsyncGenerator<Message> {
  const frames = new Frames(maxBytes);
  const reader = stream.getReader();
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const message of frames.push(value)) yield message;
    }
    if (!signal?.aborted) frames.finish();
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export function virtualURI(uri: string): string {
  const parsed = new URL(uri);
  if (parsed.protocol !== "file:") return uri;
  const extension = parsed.pathname.match(/\.(pyjs|pyts|pytsx)$/)?.[1];
  if (!extension) return uri;
  parsed.pathname += extension === "pyjs" ? ".js" : extension === "pyts" ? ".ts" : ".tsx";
  return parsed.href;
}

export function originalURI(uri: string): string {
  const parsed = new URL(uri);
  if (parsed.protocol !== "file:") return uri;
  parsed.pathname = parsed.pathname.replace(
    /\.(pyjs)\.js$|\.(pyts)\.ts$|\.(pytsx)\.tsx$/,
    (_, a, b, c) => `.${a ?? b ?? c}`,
  );
  return parsed.href;
}

export function mapURIs(value: any, mapper: (uri: string) => string, depth = 0, field = ""): any {
  if (depth > 64) throw new RangeError("JSON-RPC nesting exceeds limit");
  if (typeof value === "string")
    return value.startsWith("file:") && (/uri$/i.test(field) || field === "target") ? mapper(value) : value;
  if (Array.isArray(value)) return value.map(item => mapURIs(item, mapper, depth + 1, field));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.startsWith("file:") ? mapper(key) : key,
      mapURIs(item, mapper, depth + 1, key),
    ]),
  );
}
