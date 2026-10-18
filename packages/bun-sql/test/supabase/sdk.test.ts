import { expect, test } from "bun:test";
import { createClient, SupabaseClient } from "../../src/supabase";
import { createClient as officialCreateClient } from "@supabase/supabase-js";
import { createSupabaseSQL, resolveSupabaseConnection } from "../../src/supabase/sql";

test("Supabase exports the official SDK and executes its PostgREST, Auth and Storage transports", async () => {
  const seen: { path: string; authorization: string | null; apiKey: string | null }[] = [];
  using server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      seen.push({ path: url.pathname + url.search, authorization: request.headers.get("authorization"), apiKey: request.headers.get("apikey") });
      if (url.pathname === "/auth/v1/user") return Response.json({ id: "fixture-user", email: "fixture@example.test" });
      if (url.pathname === "/storage/v1/bucket") return Response.json([{ id: "fixture", name: "fixture" }]);
      return Response.json([{ id: 7 }]);
    },
  });
  expect(createClient).toBe(officialCreateClient);
  const client = createClient(server.url.href, "fixture-public-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  expect(client).toBeInstanceOf(SupabaseClient);
  const result = await client.from("widgets").select("id").eq("id", 7);
  expect(result.error).toBeNull();
  expect(result.data).toEqual([{ id: 7 }]);
  const user = await client.auth.getUser("fixture-access-token");
  expect(user.error).toBeNull();
  expect(user.data.user?.id).toBe("fixture-user");
  const buckets = await client.storage.listBuckets();
  expect(buckets.error).toBeNull();
  expect(buckets.data?.[0]?.name).toBe("fixture");
  expect(seen.map(({ path }) => path)).toEqual(["/rest/v1/widgets?select=id&id=eq.7", "/auth/v1/user", "/storage/v1/bucket"]);
  expect(seen[0]!.apiKey).toBe("fixture-public-key");
  expect(seen[1]!.authorization).toBe("Bearer fixture-access-token");
  await client.removeAllChannels();
});

test("Supabase SQL creates the real native SQL client and keeps pooler TLS constraints", async () => {
  expect(() => createSupabaseSQL({ connectionString: "https://project.supabase.co" })).toThrow("PostgreSQL URL");
  expect(() => createSupabaseSQL({ connectionString: "postgres://fixture:fixture@db.test/db?sslmode=disable" })).toThrow("verify-full");
  expect(() => createSupabaseSQL({ connectionString: "postgres://fixture:fixture@aws.pooler.supabase.com/db", prepare: true })).toThrow("Prepared statements");
  const sql = createSupabaseSQL({ connectionString: "postgres://fixture:fixture@db.test/db", max: 2 });
  expect(sql).toBeInstanceOf(Bun.SQL);
  expect(resolveSupabaseConnection("postgres://fixture:fixture@db.test/db").url.searchParams.get("sslmode")).toBe("verify-full");
  await sql.close();
});
