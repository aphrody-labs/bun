import { expect, test } from "bun:test";
import { yoloAPI, type YoloAPIContext } from "../src/yolo-api";

const source = "a".repeat(40);
const environment: Parameters<typeof yoloAPI>[1] = {
  YOLO_ENABLED: "false",
  YOLO_QUOTA_QUALIFIED: "false",
  YOLO_ORIGIN_URL: "",
  YOLO_NATIVE_SOURCE: "",
  YOLO_MODEL: "clef",
  YOLO_API_TOKEN: "",
  YOLO_ORIGIN_TOKEN: "",
  YOLO_LIMITER: { limit: async () => ({ success: true }) },
  get AI(): never {
    throw new Error("Public MCP must not invoke a model");
  },
};
function request(body: unknown, origin?: string) {
  return new Request("https://bun.aphrody.app/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
}

test("disabled inference does not require private provider secrets for public MCP deployment", async () => {
  const config = await Bun.file(new URL("../wrangler.jsonc", import.meta.url)).text();
  expect(config).toContain('"YOLO_ENABLED": "false"');
  const required = JSON.parse(
    /"secrets":\s*\{\s*"required":\s*(\[[^\]]*\])/.exec(config.replace(/\/\/[^\n]*/g, ""))![1]!,
  );
  expect(required).toEqual(["APP_SECRET", "NEON_DATABASE_URL", "TYPESAFE_API_KEY"]);
  const missingCredentials = Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(environment),
  ) as typeof environment;
  Reflect.deleteProperty(missingCredentials, "YOLO_API_TOKEN");
  Reflect.deleteProperty(missingCredentials, "YOLO_ORIGIN_TOKEN");
  const context: YoloAPIContext = {
    authorized: async () => {
      throw new Error("Public reads must not require private credentials");
    },
    originFetch: async () => {
      throw new Error("Public reads must not invoke a native origin");
    },
    siteRead: async () => Response.json({ source }),
  };
  const response = await yoloAPI(request({ jsonrpc: "2.0", id: 1, method: "tools/list" }), missingCredentials, context);
  expect(response?.status).toBe(200);
  const listed = JSON.parse(await response!.text());
  expect(listed.result.tools).toHaveLength(4);
  expect(
    listed.result.tools.every((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint),
  ).toBe(true);
});

test("public MCP exposes only source reads with inference disabled and no private authorization", async () => {
  let reads = 0;
  const context: YoloAPIContext = {
    authorized: async () => {
      throw new Error("Public reads must not require private credentials");
    },
    originFetch: async () => {
      throw new Error("Public reads must not invoke a native origin");
    },
    siteRead: async request => {
      reads++;
      expect(new URL(request.url).pathname).toBe("/api/site/docs");
      expect(new URL(request.url).searchParams.get("q")).toBe("Bun.Video");
      return Response.json({ snapshot: { source }, results: [{ path: "docs/runtime/video.mdx" }] });
    },
  };
  const listResponse = await yoloAPI(request({ jsonrpc: "2.0", id: 1, method: "tools/list" }), environment, context);
  expect(listResponse?.status).toBe(200);
  const list = JSON.parse(await listResponse!.text());
  expect(list.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
    "bun_site_snapshot",
    "bun_site_docs_search",
    "bun_site_graph",
    "bun_site_releases",
  ]);
  expect(
    list.result.tools.every(
      (tool: { annotations: { readOnlyHint: boolean; destructiveHint: boolean } }) =>
        tool.annotations.readOnlyHint && !tool.annotations.destructiveHint,
    ),
  ).toBe(true);
  const called = await yoloAPI(
    request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "bun_site_docs_search",
        arguments: { q: "Bun.Video", limit: 2 },
      },
    }),
    environment,
    context,
  );
  const result = JSON.parse(await called!.text());
  expect(JSON.parse(result.result.content[0].text).snapshot.source).toBe(source);
  for (const params of [
    { name: "shell", arguments: { command: "whoami" } },
    { name: "bun_site_docs_search", arguments: { q: "Bun.Video", command: "whoami" } },
  ]) {
    const rejected = await yoloAPI(
      request({ jsonrpc: "2.0", id: 3, method: "tools/call", params }),
      environment,
      context,
    );
    expect(JSON.parse(await rejected!.text()).error.code).toBe(-32602);
  }
  expect(reads).toBe(1);
  const foreign = await yoloAPI(
    request({ jsonrpc: "2.0", id: 4, method: "tools/list" }, "https://foreign.invalid"),
    environment,
    context,
  );
  expect(foreign?.status).toBe(403);
});
