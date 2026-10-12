import { expect, spyOn, test } from "bun:test";
import { createAntigravityServices } from "../src/antigravity.ts";
import { createAntigravityCredentialProvider } from "../src/credentials.ts";
import {
  googleGenerate,
  googleGenerateStream,
  googleLogin,
  googleModels,
} from "../aphrody/packages/google/src/auth.ts";

const runtime = {
  project: "rgfr" as const,
  location: "europe-west9",
  home: "fixture",
  auth: "fixture",
};

async function collect(stream: ReadableStream<string>): Promise<string> {
  let result = "";
  for await (const chunk of stream) result += chunk;
  return result;
}

test("legacy models, Vertex generation and Cloud Code streaming retain exact native REST contracts", async () => {
  const received: {
    path: string;
    query: string;
    body: unknown;
    ua: string | null;
    accept: string | null;
  }[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      received.push({
        path: url.pathname,
        query: url.search,
        body: await request.json(),
        ua: request.headers.get("user-agent"),
        accept: request.headers.get("accept"),
      });
      expect(request.headers.get("authorization")).toBe("Bearer fixture-token");
      if (url.pathname.endsWith("fetchAvailableModels"))
        return Response.json({
          models: { zeta: { displayName: "Z" }, alpha: { name: "explicit" } },
        });
      if (url.pathname.endsWith("loadCodeAssist")) return Response.json({ cloudaicompanionProject: "account-project" });
      if (url.pathname.endsWith("streamGenerateContent"))
        return new Response(
          'data: {"response":{"candidates":[{"content":{"parts":[{"text":"Bonjour "},{"text":"été"}]}}]}}\r\n\r\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      return Response.json({ candidates: [{ content: { parts: [{ text: "reply" }] } }] });
    },
  });
  const spawn = spyOn(Bun, "spawn").mockImplementation(() => {
    throw new Error("subprocess forbidden in native adapters");
  });
  try {
    const options = {
      credentialProvider: () => "fixture-token",
      baseURL: server.url,
      runtime,
      authMethod: "enterprise",
    };
    expect(await googleModels(options)).toEqual([{ name: "explicit" }, { displayName: "Z", name: "zeta" }]);
    expect(await googleGenerate("prompt", "gemini-fixture", options)).toEqual({
      candidates: [{ content: { parts: [{ text: "reply" }] } }],
    });
    expect(await collect(googleGenerateStream("stream prompt", "gemini-fixture", undefined, options))).toBe(
      "Bonjour été",
    );
    expect(received.map(item => [item.path, item.query, item.body])).toEqual([
      ["/v1internal:fetchAvailableModels", "", {}],
      [
        "/v1/projects/rgfr/locations/europe-west9/publishers/google/models/gemini-fixture:generateContent",
        "",
        { contents: [{ role: "user", parts: [{ text: "prompt" }] }] },
      ],
      ["/v1internal:loadCodeAssist", "", { metadata: { ideType: "ANTIGRAVITY" } }],
      [
        "/v1internal:streamGenerateContent",
        "?alt=sse",
        {
          model: "gemini-fixture",
          project: "account-project",
          request: { contents: [{ role: "user", parts: [{ text: "stream prompt" }] }] },
        },
      ],
    ]);
    for (const item of received)
      expect(item.ua).toMatch(
        /^antigravity\/cli\/1\.1\.27 \(aidev_client; os_type=\w+; arch=\w+; auth_method=enterprise\)$/,
      );
    expect(received.at(-1)?.accept).toBe("text/event-stream");
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    spawn.mockRestore();
    await server.stop(true);
  }
});

test("interactive login remains an explicit CLI adapter and accepts its success marker", async () => {
  const configured = Bun.env.APHRODY_GOOGLE_BIN;
  Bun.env.APHRODY_GOOGLE_BIN = "fixture-google-cli";
  const spawn = spyOn(Bun, "spawn").mockReturnValue({
    stdout: new Blob(["APHRODY_GOOGLE_LOGIN=PASS\n"]).stream(),
    stderr: new Blob([]).stream(),
    exited: Promise.resolve(0),
  } as unknown as ReturnType<typeof Bun.spawn>);
  try {
    expect(await googleLogin()).toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(["fixture-google-cli", "login"], {
      windowsHide: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } finally {
    spawn.mockRestore();
    if (configured === undefined) delete Bun.env.APHRODY_GOOGLE_BIN;
    else Bun.env.APHRODY_GOOGLE_BIN = configured;
  }
});

test("production defaults route model listing to Prod, generation to regional Vertex, streaming to Daily", async () => {
  const urls: string[] = [];
  const service = createAntigravityServices({
    credentialProvider: () => "fixture",
    runtime,
    fetch: async input => {
      const url = String(input);
      urls.push(url);
      if (url.includes("loadCodeAssist")) return Response.json({});
      if (url.includes("streamGenerateContent"))
        return new Response('data: {"candidates":[{"content":{"parts":[{"text":"fallback"}]}}]}\n\n');
      return Response.json({ models: [] });
    },
  });
  expect(await service.models()).toEqual([]);
  await service.generate("prompt");
  expect(await collect(service.stream("prompt"))).toBe("fallback");
  expect(urls).toEqual([
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://europe-west9-aiplatform.googleapis.com/v1/projects/rgfr/locations/europe-west9/publishers/google/models/gemini-2.5-flash:generateContent",
    "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
  ]);
});

test("native provider preserves public auth_method metadata for the original desktop User-Agent", async () => {
  const get = spyOn(Bun.secrets, "get").mockResolvedValue(
    '{"token":{"access_token":"fixture-token"},"auth_method":"enterprise"}',
  );
  try {
    const provider = createAntigravityCredentialProvider({ target: "gemini:antigravity" });
    const service = createAntigravityServices({
      credentialProvider: provider,
      fetch: async (_input, init) => {
        expect(new Headers(init?.headers).get("user-agent")).toContain("auth_method=enterprise");
        return Response.json({ models: [] });
      },
    });
    await service.models();
    expect(provider.authMethod).toBe("enterprise");
  } finally {
    get.mockRestore();
  }
});

test("Cloud Code retries 429 with server RetryInfo, capped backoff and a three-attempt budget", async () => {
  let attempts = 0;
  const waits: number[] = [];
  const service = createAntigravityServices({
    credentialProvider: () => "fixture",
    wait: async milliseconds => {
      waits.push(milliseconds);
    },
    fetch: async () => {
      attempts++;
      return attempts < 3
        ? Response.json(
            {
              error: {
                details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "99.5s" }],
              },
            },
            { status: 429 },
          )
        : Response.json({ models: [] });
    },
  });
  expect(await service.models()).toEqual([]);
  expect(attempts).toBe(3);
  expect(waits).toEqual([65000, 65000]);
  attempts = 0;
  const denied = createAntigravityServices({
    credentialProvider: () => "fixture",
    wait: async () => {},
    fetch: async () => {
      attempts++;
      return new Response("private quota message", { status: 429 });
    },
  });
  await expect(denied.models()).rejects.toThrow("HTTP 429");
  expect(attempts).toBe(3);
});

test("stream decoder handles split UTF8, split frames, CRLF, comments and a final unterminated frame", async () => {
  const bytes = new TextEncoder().encode(
    ': keepalive\r\n\r\ndata: {"response":{"candidates":[{"content":{"parts":[{"text":"été"}]}}]}}\r\n\r\ndata: {"candidates":[{"content":{"parts":[{"text":"完"}]}}]}',
  );
  let offset = 0;
  const service = createAntigravityServices({
    credentialProvider: () => "fixture",
    fetch: async input =>
      String(input).includes("loadCodeAssist")
        ? Response.json({})
        : new Response(
            new ReadableStream<Uint8Array>({
              pull(controller) {
                if (offset === bytes.length) {
                  controller.close();
                  return;
                }
                controller.enqueue(bytes.slice(offset, ++offset));
              },
            }),
          ),
  });
  expect(await collect(service.stream("prompt"))).toBe("été完");
});

test("stream cancellation aborts the HTTP request and releases the underlying reader", async () => {
  let requestSignal: AbortSignal | null | undefined;
  let cancelled = false;
  const service = createAntigravityServices({
    credentialProvider: () => "fixture",
    fetch: async (input, init) => {
      if (String(input).includes("loadCodeAssist")) return Response.json({});
      requestSignal = init?.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"first"}]}}]}\n\n'),
            );
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    },
  });
  const reader = service.stream("prompt").getReader();
  expect((await reader.read()).value).toBe("first");
  await reader.cancel("fixture-stop");
  expect(requestSignal?.aborted).toBe(true);
  expect(cancelled).toBe(true);
});

test("pre-aborted requests avoid credentials/HTTP and malformed streams fail without leaking payloads", async () => {
  let calls = 0;
  const service = createAntigravityServices({
    credentialProvider: () => {
      calls++;
      return "fixture";
    },
    fetch: async input =>
      String(input).includes("loadCodeAssist") ? Response.json({}) : new Response("data: private-secret-payload\n\n"),
  });
  await expect(service.models(AbortSignal.abort())).rejects.toThrow();
  await expect(collect(service.stream("prompt", undefined, AbortSignal.abort()))).rejects.toThrow();
  expect(calls).toBe(0);
  await expect(collect(service.stream("prompt"))).rejects.toThrow("Google stream decoding failed");
});
