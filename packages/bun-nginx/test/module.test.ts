import { expect, test } from "bun:test";
import type { Nginx } from "bun:nginx";
import { readModuleInfo } from "../src/module";

const information = {
  schema: 1,
  module: "ngx_http_bun_module",
  nginxVersion: 1031006,
  nginxSourceRevision: "0a5db852e18d1c22c62a5ede1412ac3f416111a0",
  ngxRustRevision: "cf58b5270dc5e9b855dab765e9f13ba2a12c7709",
  configurationSha256: "a".repeat(64),
  moduleSignature: "8,4,8,0011111111010111011111111111111111",
  eventLoop: "nginx-worker",
  allocationOwner: "request-pool",
  delayMilliseconds: 0,
  workerPID: 43,
  masterPID: 42,
  pendingTimers: 0,
};

// This fixture validates the SDK transport/schema only; it is not a native engine gate.
function owner(pid: number | null = 42, running = true): Nginx {
  return { status: async () => ({ running, pid }) } as unknown as Nginx;
}

async function endpoint(response: () => Response, action: (url: string) => Promise<void>) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      const result = response();
      // Each fixture closes its listener; prevent a pooled connection from outliving it.
      result.headers.set("Connection", "close");
      return result;
    },
  });
  try {
    await action(`http://127.0.0.1:${server.port}/info`);
  } finally {
    server.stop(true);
  }
}

test("module SDK checks the owned master and selected build digest", async () => {
  await endpoint(
    () => Response.json(information),
    async url => {
      const result = await readModuleInfo(owner(), url, {
        expectedConfigurationSha256: information.configurationSha256,
      });
      expect(result).toEqual(information);
      await expect(readModuleInfo(owner(), url, { expectedConfigurationSha256: "b".repeat(64) })).rejects.toThrow(
        "selected build receipt",
      );
      await expect(readModuleInfo(owner(44), url)).rejects.toThrow("different NGINX master");
      // master_process off: the owned process itself is the worker.
      expect((await readModuleInfo(owner(43), url)).workerPID).toBe(43);
    },
  );
});

test.each([
  "https://127.0.0.1/info",
  "http://example.com/info",
  "http://localhost/info",
  "http://user@127.0.0.1/info",
  "http://127.0.0.1/info#fragment",
])("module SDK rejects unsafe endpoint %s before native status", async url => {
  let statusCalls = 0;
  const fixture = { status: () => statusCalls++ } as unknown as Nginx;
  await expect(readModuleInfo(fixture, url)).rejects.toThrow("loopback HTTP");
  expect(statusCalls).toBe(0);
});

test.each([0, 30_001, 1.5, Number.NaN])("module SDK rejects timeout %s", async timeoutMs => {
  await expect(readModuleInfo(owner(), "http://127.0.0.1/info", { timeoutMs })).rejects.toThrow("timeoutMs");
});

test("module SDK rejects a malformed selected digest before I/O", async () => {
  await expect(readModuleInfo(owner(), "http://127.0.0.1/info", { expectedConfigurationSha256: "" })).rejects.toThrow(
    "SHA256 digest",
  );
});

test("module SDK refuses a stopped owner before HTTP", async () => {
  let requests = 0;
  await endpoint(
    () => {
      requests++;
      return Response.json(information);
    },
    async url => {
      await expect(readModuleInfo(owner(null, false), url)).rejects.toThrow("not running");
      expect(requests).toBe(0);
    },
  );
});

test.each([
  { schema: 2 },
  { nginxVersion: -1 },
  { nginxSourceRevision: "unknown" },
  { eventLoop: "bun" },
  { delayMilliseconds: 1001 },
  { pendingTimers: -1 },
  { workerPID: 0 },
  { moduleSignature: "x".repeat(129) },
])("module SDK rejects incompatible metadata %j", async overrides => {
  await endpoint(
    () => Response.json({ ...information, ...overrides }),
    async url => {
      await expect(readModuleInfo(owner(), url)).rejects.toThrow("incompatible with schema 1");
    },
  );
});

test("module SDK bounds response bytes and refuses redirects", async () => {
  await endpoint(
    () => new Response("x".repeat(4097)),
    async url => {
      await expect(readModuleInfo(owner(), url)).rejects.toThrow("4096 bytes");
    },
  );
  await endpoint(
    () => Response.redirect("http://example.com/", 302),
    async url => {
      await expect(readModuleInfo(owner(), url)).rejects.toThrow();
    },
  );
});

test("module SDK propagates caller cancellation", async () => {
  const abort = new AbortController();
  abort.abort(new Error("caller cancelled"));
  await endpoint(
    () => Response.json(information),
    async url => {
      await expect(readModuleInfo(owner(), url, { signal: abort.signal })).rejects.toThrow("caller cancelled");
    },
  );
});
