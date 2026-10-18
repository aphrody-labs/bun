import { expect, test } from "bun:test";
import { neonConfig } from "@neondatabase/serverless";
import { createNeonHTTPClient } from "../../src/neon/http";

test("Neon HTTP executes the official serverless SDK against a local transport", async () => {
  const seen: { query: string; params: string[] }[] = [];
  using server = Bun.serve({
    port: 0,
    async fetch(request) {
      seen.push(await request.json());
      return Response.json({ fields: [{ name: "value", dataTypeID: 23 }], rows: [["42"]], rowCount: 1, command: "SELECT" });
    },
  });
  const endpoint = neonConfig.fetchEndpoint;
  neonConfig.fetchEndpoint = server.url.href;
  try {
    const client = createNeonHTTPClient({ connectionString: "postgres://fixture:fixture@ep-fixture.neon.tech/db" });
    expect(await client.query("SELECT $1::int AS value", [42])).toEqual([{ value: 42 }]);
    expect(seen).toEqual([{ query: "SELECT $1::int AS value", params: ["42"] }]);
  } finally {
    neonConfig.fetchEndpoint = endpoint;
  }
});
