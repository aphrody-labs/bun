import { expect, test } from "bun:test";
import { runGoogleCommand } from "../src/cli.ts";

test("Google config and invalid commands never acquire credentials", async () => {
  let reads = 0;
  const options = {
    credentialProvider: () => {
      reads++;
      return "fixture-token";
    },
  };
  expect(await runGoogleCommand(["config"], options)).toHaveProperty("auth");
  for (const args of [["unknown"], ["models", "--token", "private"], ["generate"], ["models", "--prompt", "x"]])
    await expect(runGoogleCommand(args, options)).rejects.toThrow();
  await expect(runGoogleCommand(["models"])).rejects.toThrow("explicit target");
  expect(reads).toBe(0);
});

test("Google authstatus returns only authentication metadata", async () => {
  await expect(runGoogleCommand(["authstatus"], { credentialProvider: () => "" })).rejects.toThrow(
    "credential unavailable",
  );
  expect(await runGoogleCommand(["authstatus"], { credentialProvider: () => "private-fixture-token" })).toEqual({
    authenticated: true,
  });
  await expect(
    runGoogleCommand(["authstatus", "--target", "explicit-fixture"], {
      credentialProvider: () => "token",
    }),
  ).rejects.toThrow();
});

test("Google CLI routes models, Vertex generation and Cloud Code streaming", async () => {
  const paths: string[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      paths.push(path);
      expect(request.headers.get("authorization")).toBe("Bearer fixture-token");
      const body = await request.json();
      if (path.endsWith("fetchAvailableModels")) return Response.json({ models: { fixture: {} } });
      if (path.endsWith("loadCodeAssist")) return Response.json({ cloudaicompanionProject: "fixture-project" });
      if (path.endsWith("streamGenerateContent")) {
        expect(body).toEqual({
          model: "fixture-model",
          project: "fixture-project",
          request: { contents: [{ role: "user", parts: [{ text: "hello" }] }] },
        });
        return new Response('data: {"response":{"candidates":[{"content":{"parts":[{"text":"streamed"}]}}]}}\n\n', {
          headers: { "content-type": "text/event-stream" },
        });
      }
      expect(body).toEqual({ contents: [{ role: "user", parts: [{ text: "hello" }] }] });
      return Response.json({ generated: true });
    },
  });
  const options = { baseURL: server.url, credentialProvider: () => "fixture-token" };
  try {
    expect(await runGoogleCommand(["models"], options)).toEqual([{ name: "fixture" }]);
    expect(await runGoogleCommand(["generate", "--model", "fixture-model", "--prompt", "hello"], options)).toEqual({
      generated: true,
    });
    const stream = (await runGoogleCommand(
      ["stream", "--model", "fixture-model", "--prompt", "hello"],
      options,
    )) as ReadableStream<string>;
    expect(await Array.fromAsync(stream)).toEqual(["streamed"]);
    expect(paths.some(path => path.includes("/publishers/google/models/fixture-model:generateContent"))).toBe(true);
  } finally {
    await server.stop(true);
  }
});
