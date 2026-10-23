/** HTTP envelopes only. Bun's Rust Yolo owner validates requests, probabilities and primitive values. */
import { PUBLIC_BUN_TOOLS, publicBunToolRequest } from "../../site/public-tools.ts";
import webManifest from "../../package.json";

type YoloKey =
  | "YOLO_ENABLED"
  | "YOLO_QUOTA_QUALIFIED"
  | "YOLO_ORIGIN_URL"
  | "YOLO_NATIVE_SOURCE"
  | "YOLO_MODEL"
  | "YOLO_API_TOKEN"
  | "YOLO_ORIGIN_TOKEN"
  | "YOLO_LIMITER"
  | "AI";
type YoloEnv = { [K in YoloKey]: Env[K] extends string ? string : Env[K] };
type OriginFetch = (url: string, options: RequestInit) => Promise<Response>;
export type YoloAPIContext = {
  authorized(request: Request, secret: string): Promise<boolean>;
  siteRead(request: Request): Promise<Response>;
  originFetch?: OriginFetch;
};
const MAX_BYTES = 1024 * 1024;
const DEADLINE_MS = 10000;
const MODELS = { clef: "@cf/cloudflare/clef", "clef-flash": "@cf/cloudflare/clef-flash" } as const;
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const json = (value: unknown, status = 200, mediaType = "application/json") =>
  new Response(JSON.stringify(value), { status, headers: { ...headers, "content-type": mediaType } });
class APIError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new APIError(400, "invalid_request", "Expected a JSON object");
  return value as Record<string, unknown>;
}
async function boundedJSON(input: Request | Response, signal: AbortSignal): Promise<unknown> {
  const length = input.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
    throw new APIError(413, "body_limit", "JSON exceeds 1 MiB");
  if (!input.body) throw new APIError(400, "invalid_json", "Expected a JSON body");
  const reader = input.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      size += part.value.length;
      if (size > MAX_BYTES) throw new APIError(413, "body_limit", "JSON exceeds 1 MiB");
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    } catch {
      throw new APIError(400, "invalid_json", "Expected UTF-8 JSON");
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function origin(env: YoloEnv): URL | null {
  if (
    env.YOLO_ENABLED !== "true" ||
    env.YOLO_QUOTA_QUALIFIED !== "true" ||
    !/^[a-f0-9]{40}$/.test(env.YOLO_NATIVE_SOURCE) ||
    !env.YOLO_ORIGIN_TOKEN
  )
    return null;
  try {
    const url = new URL(env.YOLO_ORIGIN_URL);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/"
      ? url
      : null;
  } catch {
    return null;
  }
}
export function yoloCapabilities(env: YoloEnv) {
  return {
    kind: "typed-decision",
    nativeValidation: "bun:yolo",
    inferenceEnabled: origin(env) !== null,
    trainedForkWeights: false,
    streaming: false,
    persistentTasks: false,
    trainingDatasetQualified: false,
  };
}
async function rateLimit(env: YoloEnv, key: string) {
  if (!(await env.YOLO_LIMITER.limit({ key })).success)
    throw new APIError(429, "rate_limit", "Decision rate limit reached");
}
async function inspect(
  request: Request,
  env: YoloEnv,
  context: YoloAPIContext,
  decision: unknown,
  minimumConfidence: unknown,
  signal: AbortSignal,
) {
  if (!env.YOLO_API_TOKEN)
    throw new APIError(503, "authentication_unconfigured", "Decision authentication is not configured");
  if (!(await context.authorized(request, env.YOLO_API_TOKEN)))
    throw new APIError(401, "unauthorized", "Authentication required");
  const endpoint = origin(env);
  if (!endpoint) throw new APIError(503, "native_origin_unqualified", "The Bun decision origin is not qualified");
  // Per-location limiter complements the origin's authenticated global quota; it is not a global budget.
  await rateLimit(env, "client:" + (request.headers.get("CF-Connecting-IP") ?? "unknown"));
  const response = await (context.originFetch ?? fetch)(new URL("/v1/systemone", endpoint).href, {
    method: "POST",
    redirect: "error",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + env.YOLO_ORIGIN_TOKEN,
      "x-bun-yolo-source": env.YOLO_NATIVE_SOURCE,
    },
    body: JSON.stringify({ request: decision, ...(minimumConfidence === undefined ? {} : { minimumConfidence }) }),
  });
  if (response.headers.get("x-bun-yolo-source") !== env.YOLO_NATIVE_SOURCE) {
    await response.body?.cancel();
    throw new APIError(503, "native_origin_mismatch", "The decision origin identity differs");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new APIError(
      response.status === 400 ? 400 : response.status === 429 ? 429 : 503,
      "native_decision_rejected",
      "The native decision origin rejected the request",
    );
  }
  return object(await boundedJSON(response, signal));
}
function structuredInput(value: unknown) {
  if (typeof value !== "string") return object(value);
  try {
    return object(JSON.parse(value));
  } catch {
    throw new APIError(400, "structured_decision_required", "Supply a JSON decision request with state and questions");
  }
}
function requestForEnvelope(body: Record<string, unknown>, path: string) {
  if (body.stream === true || body.tools !== undefined || body.functions !== undefined)
    throw new APIError(400, "unsupported_generation", "Only non-streaming structured decisions are supported");
  if (body.bun_yolo !== undefined) {
    const extension = object(body.bun_yolo);
    return { decision: structuredInput(extension.request), minimumConfidence: extension.minimum_confidence };
  }
  if (path === "/v1/responses")
    return { decision: structuredInput(body.input), minimumConfidence: body.minimum_confidence };
  if (!Array.isArray(body.messages) || body.messages.length !== 1)
    throw new APIError(
      400,
      "structured_decision_required",
      "Supply exactly one user message containing a JSON decision request",
    );
  const message = object(body.messages[0]);
  if (message.role !== "user")
    throw new APIError(400, "structured_decision_required", "Expected a user decision request");
  return { decision: structuredInput(message.content), minimumConfidence: body.minimum_confidence };
}
function envelope(native: Record<string, unknown>, path: string) {
  const result = object(native.result);
  const content = JSON.stringify(native);
  const id = crypto.randomUUID();
  const model = result.model;
  const boundary = {
    mode: "structured-decision",
    nativeValidation: "bun:yolo",
    generatedConversation: false,
    trainedForkWeights: false,
    usage: result.usage ?? null,
  };
  if (path === "/v1/responses")
    return {
      id: "resp_" + id,
      object: "response",
      status: "completed",
      created_at: Math.floor(Date.now() / 1000),
      model,
      output: [
        {
          type: "message",
          id: "msg_" + id,
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: content, annotations: [] }],
        },
      ],
      x_bun: boundary,
    };
  return {
    id: "chatcmpl-" + id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    x_bun: boundary,
  };
}
function a2aDecision(body: Record<string, unknown>) {
  const message = object(body.message);
  const configuration = body.configuration === undefined ? {} : object(body.configuration);
  if (
    message.taskId !== undefined ||
    configuration.returnImmediately === true ||
    configuration.taskPushNotificationConfig !== undefined
  )
    throw new APIError(400, "unsupported_operation", "This interface returns stateless messages only");
  if (
    message.role !== "ROLE_USER" ||
    typeof message.messageId !== "string" ||
    !message.messageId ||
    message.messageId.length > 1024 ||
    !Array.isArray(message.parts) ||
    message.parts.length !== 1
  )
    throw new APIError(400, "invalid_request", "Expected one structured A2A 1.0 user message");
  const part = object(message.parts[0]);
  if (Object.keys(part).some(key => !["data", "mediaType", "metadata"].includes(key)) || !part.data)
    throw new APIError(400, "structured_decision_required", "Only a JSON data part is supported");
  if (message.contextId !== undefined && (typeof message.contextId !== "string" || message.contextId.length > 1024))
    throw new APIError(400, "invalid_request", "Invalid context identifier");
  return {
    decision: object(part.data),
    contextId: message.contextId ?? crypto.randomUUID(),
    minimumConfidence: object(body.metadata ?? {}).minimum_confidence,
  };
}
async function mcp(body: Record<string, unknown>, context: YoloAPIContext, request: Request, signal: AbortSignal) {
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string")
    throw new APIError(400, "invalid_request", "Expected a JSON-RPC 2.0 request");
  const id = body.id ?? null;
  const reply = (result: unknown) => json({ jsonrpc: "2.0", id, result });
  const failure = (code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });
  if (body.method === "notifications/initialized" && body.id === undefined) return new Response(null, { status: 202 });
  if (body.id === undefined || !["string", "number"].includes(typeof body.id))
    return failure(-32600, "Expected a request id");
  if (body.method === "initialize")
    return reply({
      protocolVersion: "2025-11-25",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "aphrody-bun-public", version: webManifest.version },
      instructions:
        "Read-only public Bun snapshot, documentation, graph and releases; no shell, files, training or inference.",
    });
  if (body.method === "ping") return reply({});
  if (body.method === "tools/list")
    return reply({
      tools: PUBLIC_BUN_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: "object",
          properties: tool.properties,
          required: tool.required,
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      })),
    });
  if (body.method !== "tools/call") return failure(-32601, "Method not found");
  const params = object(body.params);
  let query: Request;
  try {
    query = publicBunToolRequest(String(params.name), params.arguments ?? {}, request.url);
  } catch {
    return failure(-32602, "Invalid public tool request");
  }
  const result = await context.siteRead(new Request(query, { signal }));
  const value = await boundedJSON(result, signal);
  return reply({ content: [{ type: "text", text: JSON.stringify(value) }], isError: !result.ok });
}

export async function yoloAPI(request: Request, env: YoloEnv, context: YoloAPIContext): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  // Decision routes exist only once the native origin is qualified; until then the site does not offer them at all
  // and they fall through to 404. The read-only MCP server does not depend on it.
  const decisions = origin(env)
    ? [
        "/v1/models",
        "/v1/systemone",
        "/v1/chat/completions",
        "/v1/responses",
        "/a2a",
        "/message:send",
        "/api/yolo/provider",
      ]
    : [];
  if (path !== "/mcp" && !decisions.includes(path)) return null;
  if (path === "/v1/models") {
    if (request.method !== "GET") return json({ error: { code: "method_not_allowed" } }, 405);
    return json({
      object: "list",
      data: [{ id: env.YOLO_MODEL, object: "model", owned_by: "cloudflare", x_bun: yoloCapabilities(env) }],
    });
  }
  if (request.method !== "POST") return json({ error: { code: "method_not_allowed" } }, 405);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(DEADLINE_MS)]);
  let rpcId: unknown;
  try {
    if (!/\bapplication\/(?:json|a2a\+json)\b/i.test(request.headers.get("content-type") ?? ""))
      throw new APIError(415, "content_type", "Expected JSON");
    const body = object(await boundedJSON(request, signal));
    if (path === "/mcp") {
      const originHeader = request.headers.get("origin");
      if (originHeader && originHeader !== new URL(request.url).origin && originHeader !== "https://bun.aphrody.app")
        throw new APIError(403, "invalid_origin", "MCP origin is not allowed");
      await rateLimit(env, "mcp:" + (request.headers.get("CF-Connecting-IP") ?? "unknown"));
      return await mcp(body, context, request, signal);
    }
    if (path === "/api/yolo/provider") {
      if (!origin(env))
        throw new APIError(503, "native_origin_unqualified", "The Bun decision origin is not qualified");
      if (
        request.headers.get("x-bun-yolo-source") !== env.YOLO_NATIVE_SOURCE ||
        !(await context.authorized(request, env.YOLO_ORIGIN_TOKEN))
      )
        throw new APIError(401, "unauthorized", "Native provider authentication required");
      await rateLimit(env, "provider:" + env.YOLO_NATIVE_SOURCE);
      const model = env.YOLO_MODEL === "clef-flash" ? MODELS["clef-flash"] : MODELS.clef;
      const raw = await env.AI.run(model, body, { signal });
      if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > MAX_BYTES)
        throw new APIError(502, "provider_limit", "Provider response exceeds the native bound");
      // Raw probabilities return only to the authenticated native validator, never through a public shortcut.
      return json(raw);
    }
    if (path === "/a2a" || path === "/message:send") {
      if ((request.headers.get("A2A-Version") ?? new URL(request.url).searchParams.get("A2A-Version")) !== "1.0")
        return json(
          {
            type: "https://a2a-protocol.org/errors/version-not-supported",
            title: "Protocol Version Not Supported",
            status: 400,
            supportedVersions: ["1.0"],
          },
          400,
          "application/problem+json",
        );
      const rpc = path === "/a2a";
      if (rpc) {
        rpcId = body.id;
        if (body.jsonrpc !== "2.0" || !["string", "number"].includes(typeof rpcId) || body.method !== "SendMessage")
          return json({
            jsonrpc: "2.0",
            id: rpcId ?? null,
            error: { code: -32601, message: "Only stateless SendMessage is supported" },
          });
      }
      const input = a2aDecision(rpc ? object(body.params) : body);
      const native = await inspect(request, env, context, input.decision, input.minimumConfidence, signal);
      const response = {
        message: {
          messageId: crypto.randomUUID(),
          contextId: input.contextId,
          role: "ROLE_AGENT",
          parts: [{ data: native, mediaType: "application/json" }],
        },
      };
      return rpc ? json({ jsonrpc: "2.0", id: rpcId, result: response }) : json(response, 200, "application/a2a+json");
    }
    if (path === "/v1/systemone") {
      const native = await inspect(request, env, context, body, undefined, signal);
      return json(object(native.result));
    }
    const input = requestForEnvelope(body, path);
    return json(envelope(await inspect(request, env, context, input.decision, input.minimumConfidence, signal), path));
  } catch (error) {
    const failure =
      error instanceof APIError
        ? error
        : new APIError(
            signal.aborted ? 504 : 503,
            signal.aborted ? "deadline" : "service_unavailable",
            signal.aborted ? "Decision deadline reached" : "Decision service unavailable",
          );
    if (path === "/a2a" && rpcId !== undefined)
      return json(
        {
          jsonrpc: "2.0",
          id: rpcId,
          error: { code: failure.status === 400 ? -32602 : -32603, message: failure.message },
        },
        failure.status,
      );
    return json({ error: { code: failure.code, message: failure.message } }, failure.status);
  }
}
