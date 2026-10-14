import { expect, test } from "bun:test";
import { PUBLIC_BUN_TOOLS, publicBunToolRequest } from "./public-tools";
import { WEBMCP_SCRIPT } from "./webmcp";

function browser(supported: boolean, transport: (request: URL, options: RequestInit) => Promise<Response>) {
  const tools: { name: string; execute(input: unknown, options: { signal: AbortSignal }): Promise<unknown> }[] = [];
  const signals: AbortSignal[] = [];
  const events = new Map<string, () => void>();
  const ready = Promise.withResolvers<void>();
  const status = {
    set textContent(_value: string) {
      ready.resolve();
    },
  };
  const document = {
    querySelector: () => status,
    ...(supported
      ? {
          modelContext: {
            async registerTool(tool: (typeof tools)[number], options: { signal: AbortSignal }) {
              tools.push(tool);
              signals.push(options.signal);
            },
          },
        }
      : {}),
  };
  const window = {
    addEventListener(name: string, callback: () => void) {
      events.set(name, callback);
    },
  };
  new Function("document", "window", "location", "fetch", WEBMCP_SCRIPT)(
    document,
    window,
    { origin: "https://bun.example" },
    transport,
  );
  return { ready: ready.promise, tools, signals, events };
}

test("public tools reject unknown parameters and keep user values inside the query", () => {
  const request = publicBunToolRequest(
    "bun_site_docs_search",
    { q: "Bun.Video & resize", limit: 8 },
    "https://bun.example",
  );
  expect(new URL(request.url).searchParams.get("q")).toBe("Bun.Video & resize");
  expect(request.method).toBe("GET");
  expect(() => publicBunToolRequest("shell", {}, "https://bun.example")).toThrow("Unknown");
  expect(() => publicBunToolRequest("bun_site_docs_search", {}, "https://bun.example")).toThrow("Missing");
  expect(() => publicBunToolRequest("bun_site_docs_search", { q: "Bun", limit: 9 }, "https://bun.example")).toThrow(
    "Invalid",
  );
  expect(() => publicBunToolRequest("bun_site_snapshot", { token: "fixture" }, "https://bun.example")).toThrow(
    "Unknown",
  );
});

test("WebMCP registers the shared read-only catalogue, returns API errors and releases registrations", async () => {
  let target: URL | undefined;
  let transportOptions: RequestInit | undefined;
  const harness = browser(true, async (url, options) => {
    target = url;
    transportOptions = options;
    return Response.json({ source: "fixture-source", truncated: true });
  });
  await harness.ready;
  expect(harness.tools.map(tool => tool.name)).toEqual(PUBLIC_BUN_TOOLS.map(tool => tool.name));
  const controller = new AbortController();
  const input = { q: "Bun.Video & resize", limit: 3 };
  expect(await harness.tools[1]!.execute(input, { signal: controller.signal })).toEqual({
    source: "fixture-source",
    truncated: true,
  });
  expect(String(target)).toBe(publicBunToolRequest(harness.tools[1]!.name, input, "https://bun.example").url);
  expect(transportOptions?.signal).toBe(controller.signal);
  expect(transportOptions?.credentials).toBe("omit");
  expect(await harness.tools[1]!.execute({ q: "Bun", secret: "fixture" }, { signal: controller.signal })).toEqual({
    error: "Unknown parameter secret",
  });
  harness.events.get("pagehide")!();
  expect(harness.signals.every(signal => signal.aborted)).toBe(true);
  const failed = browser(true, async () => Response.json({ error: "rate limited" }, { status: 429 }));
  await failed.ready;
  expect(await failed.tools[0]!.execute({}, { signal: controller.signal })).toEqual({
    error: "Public API returned 429",
    details: { error: "rate limited" },
  });
  controller.abort(Error("cancelled"));
  await expect(failed.tools[0]!.execute({}, { signal: controller.signal })).rejects.toThrow("cancelled");
});

test("unsupported browsers keep the HTTP fallback and oversized responses return a bounded failure", async () => {
  const unsupported = browser(false, async () => {
    throw Error("Unexpected call");
  });
  await unsupported.ready;
  expect(unsupported.tools).toHaveLength(0);
  const large = browser(true, async () => new Response(" ".repeat(1024 * 1024 + 1)));
  await large.ready;
  const result = await large.tools[0]!.execute({}, { signal: new AbortController().signal });
  expect(result).toMatchObject({ error: "Public Bun tool failed; retry or use its HTTP route." });
});
