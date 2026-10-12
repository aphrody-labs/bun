import { expect, test } from "bun:test";
import { createGoogleServices } from "../src/index.ts";

test("Drive pagination, exports and Docs revision guard use authenticated native fetch", async () => {
  const requests: { path: string; body: unknown; auth: string | null }[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      requests.push({
        path: url.pathname,
        body: request.method === "POST" ? await request.json() : null,
        auth: request.headers.get("authorization"),
      });
      if (url.pathname === "/drive/files")
        return Response.json(
          url.searchParams.get("pageToken") === "second"
            ? { files: [{ id: "2" }] }
            : { files: [{ id: "1" }], nextPageToken: "second" },
        );
      if (url.pathname.endsWith("/export")) return new Response("document text");
      return Response.json({ documentId: "doc", revisionId: "r1" });
    },
  });
  try {
    const api = createGoogleServices({
      credentialProvider: () => "fixture-token",
      endpoints: {
        drive: `${server.url}drive/`,
        docs: `${server.url}docs/`,
        gemini: `${server.url}gemini/`,
      },
    });
    const files = [];
    for await (const file of api.drive.files()) files.push(file.id);
    expect(files).toEqual(["1", "2"]);
    expect(await (await api.drive.exportFile("1", "text/plain")).text()).toBe("document text");
    const doc = await api.docs.get("doc");
    expect(doc.revisionId).toBe("r1");
    await expect(api.docs.batchUpdate("doc", [], "")).rejects.toThrow("reviewed revision ID");
    const before = requests.length;
    await api.docs.batchUpdate("doc", [{ insertText: { text: "hello" } }], doc.revisionId!);
    expect(requests.length).toBe(before + 1);
    expect(requests.at(-1)).toEqual({
      path: "/docs/documents/doc:batchUpdate",
      body: {
        requests: [{ insertText: { text: "hello" } }],
        writeControl: { requiredRevisionId: "r1" },
      },
      auth: "Bearer fixture-token",
    });
  } finally {
    await server.stop(true);
  }
});

test("Drive bounded pagination rejects cycles and hidden pagination fields", async () => {
  let count = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      count++;
      return Response.json({ files: [], nextPageToken: "repeat" });
    },
  });
  try {
    const api = createGoogleServices({
      credentialProvider: () => "fixture-token",
      endpoints: { drive: String(server.url) },
    });
    const iterate = async (options?: { maxPages: number }) => {
      for await (const _ of api.drive.files({}, options)) {
      }
    };
    await expect(iterate()).rejects.toThrow("repeated page token");
    expect(count).toBe(2);
    await expect(iterate({ maxPages: 1 })).rejects.toThrow("exceeded maxPages");
    expect(count).toBe(3);
    await expect(api.drive.listFiles({ pageSize: 1001 })).rejects.toThrow("pageSize");
    const fields = async () => {
      for await (const _ of api.drive.files({ fields: "files(id)" })) {
      }
    };
    await expect(fields()).rejects.toThrow("nextPageToken");
    expect(count).toBe(3);
  } finally {
    await server.stop(true);
  }
});

test("Drive and Docs reject malformed resource envelopes without echoing response data", async () => {
  let body: unknown;
  const server = Bun.serve({
    port: 0,
    fetch() {
      return Response.json(body);
    },
  });
  try {
    const api = createGoogleServices({
      credentialProvider: () => "fixture-token",
      endpoints: { drive: String(server.url), docs: String(server.url) },
    });
    body = { files: [{ id: "file-1", name: 42, secret: "do not expose" }] };
    await expect(api.drive.listFiles()).rejects.toThrow("Google Drive file response is invalid");
    body = { documentId: ["private"] };
    await expect(api.docs.get("doc")).rejects.toThrow("Google Docs document response is invalid");
    body = "private response body";
    await expect(api.drive.listFiles()).rejects.toThrow("Google Drive list response is invalid");
  } finally {
    await server.stop(true);
  }
});

test("Gemini JSON and SSE retain request body and signal", async () => {
  const bodies: unknown[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      bodies.push(await request.json());
      return request.url.includes("streamGenerateContent")
        ? new Response('data: {"text":"hello"}\n\n', {
            headers: { "content-type": "text/event-stream" },
          })
        : Response.json({ candidates: [] });
    },
  });
  try {
    const api = createGoogleServices({
      credentialProvider: () => "fixture-token",
      endpoints: { gemini: String(server.url) },
    });
    const body = { contents: [{ parts: [{ text: "hello" }] }] };
    expect(await api.gemini.generate("gemini-test", body)).toEqual({ candidates: [] });
    expect(await (await api.gemini.stream("gemini-test", body)).text()).toBe('data: {"text":"hello"}\n\n');
    expect(bodies).toEqual([body, body]);
    await expect(api.gemini.generate("gemini-test", body, AbortSignal.abort())).rejects.toThrow();
    expect(bodies.length).toBe(2);
  } finally {
    await server.stop(true);
  }
});
