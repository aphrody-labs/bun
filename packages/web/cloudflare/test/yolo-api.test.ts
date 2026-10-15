import { expect, test } from "bun:test";
import { code, confidenceThreshold, inspect, selections, value, type Request as DecisionRequest } from "bun:yolo";
import { yoloAPI, type YoloAPIContext } from "../src/yolo-api";

const SOURCE = "a".repeat(40);
const decision = {
  state: "A public Bun documentation fixture",
  questions: { relevant: { type: "noul", instructions: "Is this about Bun?" } },
};
const raw = { model: "clef", answers: { relevant: { type: "noul", noul: 0.73 } }, usage: null };
type Environment = Parameters<typeof yoloAPI>[1];
function environment(enabled = true): Environment {
  return {
    YOLO_ENABLED: enabled ? "true" : "false",
    YOLO_QUOTA_QUALIFIED: "true",
    YOLO_ORIGIN_URL: "https://native.example.invalid",
    YOLO_NATIVE_SOURCE: SOURCE,
    YOLO_MODEL: "clef",
    YOLO_API_TOKEN: "client-fixture",
    YOLO_ORIGIN_TOKEN: "origin-fixture",
    YOLO_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: async () => raw } as Ai,
  };
}
function request(path: string, body?: unknown, extra: Record<string, string> = {}) {
  return new Request("https://yolo.aphrody.app" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: "Bearer client-fixture", ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function context(
  originFetch: YoloAPIContext["originFetch"] = async () =>
    Response.json({ result: raw }, { headers: { "x-bun-yolo-source": SOURCE } }),
): YoloAPIContext {
  return {
    authorized: async (request, secret) => request.headers.get("authorization") === "Bearer " + secret,
    siteRead: async request => Response.json({ query: new URL(request.url).search, snapshot: { source: SOURCE } }),
    ...(originFetch ? { originFetch } : {}),
  };
}
test("unqualified defaults make models explicit and never invoke an origin", async () => {
  let calls = 0;
  const env = environment(false);
  const ctx = context(async () => {
    calls++;
    throw Error("must not run");
  });
  const models = await (await yoloAPI(request("/v1/models"), env, ctx))!.json();
  expect(models.data[0].x_bun).toMatchObject({
    inferenceEnabled: false,
    trainedForkWeights: false,
    trainingDatasetQualified: false,
  });
  expect((await yoloAPI(request("/v1/systemone", decision), env, ctx))!.status).toBe(503);
  expect(calls).toBe(0);
  const quotaPending = environment();
  quotaPending.YOLO_QUOTA_QUALIFIED = "false";
  expect((await yoloAPI(request("/v1/systemone", decision), quotaPending, ctx))!.status).toBe(503);
});
test("authentication, limiter and source identity fail before accepting a decision", async () => {
  let calls = 0;
  const ctx = context(async () => {
    calls++;
    return Response.json({ result: raw }, { headers: { "x-bun-yolo-source": "b".repeat(40) } });
  });
  expect(
    (await yoloAPI(request("/v1/systemone", decision, { authorization: "Bearer wrong" }), environment(), ctx))!.status,
  ).toBe(401);
  const limited = environment();
  limited.YOLO_LIMITER = { limit: async () => ({ success: false }) };
  expect((await yoloAPI(request("/v1/systemone", decision), limited, ctx))!.status).toBe(429);
  expect(calls).toBe(0);
  expect((await yoloAPI(request("/v1/systemone", decision), environment(), ctx))!.status).toBe(503);
  expect(calls).toBe(1);
});
test("native Yolo fixture validates the decision and HTTP preserves probabilities and null usage", async () => {
  const ctx = context(async (url, options) => {
    expect(url).toBe("https://native.example.invalid/v1/systemone");
    expect(options.redirect).toBe("error");
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer origin-fixture");
    const body = JSON.parse(String(options.body)) as { request: DecisionRequest };
    const result = await inspect(body.request, { provider: code(() => raw) });
    const values = Object.fromEntries(
      Object.entries(body.request.questions).map(([name, question]) => [name, value(result.answers[name]!, question)]),
    );
    expect(values).toEqual({ relevant: true });
    return Response.json({ result, values }, { headers: { "x-bun-yolo-source": SOURCE } });
  });
  const result = await (await yoloAPI(request("/v1/systemone", decision), environment(), ctx))!.json();
  expect(result).toEqual(raw);
  const invalid = { ...decision, questions: { bad: { type: "invented" } } };
  const rejected = await yoloAPI(
    request("/v1/systemone", invalid),
    environment(),
    context(async (_url, options) => {
      try {
        await inspect(JSON.parse(String(options.body)).request, { provider: code(() => raw) });
      } catch {
        return Response.json(
          { error: "native invalid request" },
          { status: 400, headers: { "x-bun-yolo-source": SOURCE } },
        );
      }
      throw Error("invalid descriptor accepted");
    }),
  );
  expect(rejected!.status).toBe(400);
});
test("OpenAI envelopes contain structured decisions and reject conversation or streaming", async () => {
  const chat = await (await yoloAPI(
    request("/v1/chat/completions", { messages: [{ role: "user", content: JSON.stringify(decision) }] }),
    environment(),
    context(),
  ))!.json();
  expect(JSON.parse(chat.choices[0].message.content)).toEqual({ result: raw });
  expect(chat.x_bun).toMatchObject({ generatedConversation: false, usage: null, trainedForkWeights: false });
  expect(chat.usage).toBeUndefined();
  const response = await (await yoloAPI(
    request("/v1/responses", { input: decision }),
    environment(),
    context(),
  ))!.json();
  expect(JSON.parse(response.output[0].content[0].text).result).toEqual(raw);
  for (const body of [
    { messages: [{ role: "user", content: "Write a story" }] },
    { stream: true, input: decision },
    { tools: [], input: decision },
  ]) {
    const path = "messages" in body ? "/v1/chat/completions" : "/v1/responses";
    expect((await yoloAPI(request(path, body), environment(), context()))!.status).toBe(400);
  }
});

test("confidence and abstention are delegated to Rust while raw Choice answers stay unchanged", async () => {
  const requestValue = {
    state: "Bun.Video",
    questions: { route: { type: "choice", criteria: { docs: "API documentation", graph: "Source graph" } } },
  } as const;
  const answer = {
    model: "clef",
    answers: { route: { type: "choice", choice: "docs", confidence: 0.8, probabilities: { docs: 0.8, graph: 0.2 } } },
    usage: null,
  };
  const ctx = context(async (_url, options) => {
    const body = JSON.parse(String(options.body)) as { request: typeof requestValue; minimumConfidence: number };
    const minimum = confidenceThreshold(body.minimumConfidence);
    const result = await inspect(body.request, { provider: code(() => answer) });
    return Response.json(
      { result, selections: selections(body.request, result, minimum) },
      { headers: { "x-bun-yolo-source": SOURCE } },
    );
  });
  const response = await (await yoloAPI(
    request("/v1/responses", { bun_yolo: { request: requestValue, minimum_confidence: 0.9 } }),
    environment(),
    ctx,
  ))!.json();
  const native = JSON.parse(response.output[0].content[0].text);
  expect(native.result).toEqual(answer);
  expect(native.selections).toEqual({ route: null });
});
test("A2A1.0 emits a stateless message using the current data-part representation", async () => {
  const body = {
    message: {
      messageId: "fixture-message",
      role: "ROLE_USER",
      parts: [{ data: decision, mediaType: "application/json" }],
    },
  };
  const response = (await yoloAPI(request("/message:send", body, { "A2A-Version": "1.0" }), environment(), context()))!;
  expect(response.headers.get("content-type")).toBe("application/a2a+json");
  const result = await response.json();
  expect(result.message.role).toBe("ROLE_AGENT");
  expect(result.message.contextId).toBeString();
  expect(result.message.parts).toEqual([{ data: { result: raw }, mediaType: "application/json" }]);
  expect(result.task).toBeUndefined();
  const rpc = await (await yoloAPI(
    request("/a2a", { jsonrpc: "2.0", id: 7, method: "SendMessage", params: body }, { "A2A-Version": "1.0" }),
    environment(),
    context(),
  ))!.json();
  expect(rpc.result.message.parts[0].data.result).toEqual(raw);
  expect((await yoloAPI(request("/message:send", body), environment(), context()))!.status).toBe(400);
  expect(
    (await yoloAPI(
      request("/message:send", { ...body, configuration: { returnImmediately: true } }, { "A2A-Version": "1.0" }),
      environment(),
      context(),
    ))!.status,
  ).toBe(400);
});
test("payload size, native response size and cancellation are bounded", async () => {
  const oversized = new Request("https://yolo.aphrody.app/v1/systemone", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(1024 * 1024 + 1) },
    body: "{}",
  });
  expect((await yoloAPI(oversized, environment(), context()))!.status).toBe(413);
  expect(
    (await yoloAPI(
      request("/v1/systemone", decision),
      environment(),
      context(async () => new Response("x".repeat(1024 * 1024 + 1), { headers: { "x-bun-yolo-source": SOURCE } })),
    ))!.status,
  ).toBe(413);
  const controller = new AbortController();
  controller.abort();
  const cancelled = new Request(request("/v1/systemone", decision), { signal: controller.signal });
  expect((await yoloAPI(cancelled, environment(), context()))!.status).toBe(504);
});
test("private Clef transport requires the qualified native source and preserves raw output", async () => {
  const env = environment();
  const callback = request("/api/yolo/provider", decision, {
    authorization: "Bearer origin-fixture",
    "x-bun-yolo-source": SOURCE,
  });
  const response = await yoloAPI(callback, env, context());
  expect(await response!.json()).toEqual(raw);
  expect((await yoloAPI(request("/api/yolo/provider", decision), env, context()))!.status).toBe(401);
  expect((await yoloAPI(request("/api/yolo/provider", decision), environment(false), context()))!.status).toBe(503);
});
