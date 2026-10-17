import { expect, test } from "bun:test";
import { fetchNeonConnectionUri } from "../src/api";

test("reads the connection URI with the bearer key and explicit database and role", async () => {
  const seen: { auth: string | null; path: string; query: string }[] = [];
  using server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      seen.push({ auth: req.headers.get("authorization"), path: url.pathname, query: url.search });
      return Response.json({ uri: "postgres://u:p@ep-x.neon.tech/db?sslmode=require" });
    },
  });
  const uri = await fetchNeonConnectionUri({
    apiKey: "k",
    projectId: "proj-1",
    database: "db",
    role: "u",
    baseUrl: `http://localhost:${server.port}/api/v2/`,
  });
  expect(uri).toBe("postgres://u:p@ep-x.neon.tech/db?sslmode=require");
  expect(seen).toEqual([
    { auth: "Bearer k", path: "/api/v2/projects/proj-1/connection_uri", query: "?database_name=db&role_name=u&pooled=false" },
  ]);
});

test("fails closed on a missing key or a refused request", async () => {
  await expect(fetchNeonConnectionUri({ projectId: "p", database: "d", role: "r", apiKey: "" })).rejects.toThrow(
    "NEON_API_KEY is required",
  );
  using server = Bun.serve({ port: 0, fetch: () => new Response("no", { status: 403 }) });
  await expect(
    fetchNeonConnectionUri({ apiKey: "k", projectId: "p", database: "d", role: "r", baseUrl: `http://localhost:${server.port}/api/v2/` }),
  ).rejects.toThrow("Neon API returned 403");
});
