import { expect, test } from "bun:test";
import { createGooglePublicSearch } from "../src/search.ts";

test("Anonymous search uses the qualified Rust owner with SafeSearch and no browser fallback", async () => {
  const search = createGooglePublicSearch({
    run: async (args, signal) => {
      expect(args).toEqual([
        "web",
        "search",
        "--json",
        "--no-auth",
        "--safe",
        "--transport",
        "fetch",
        "--domain",
        "google.com",
        "--hl",
        "fr",
        "--gl",
        "US",
        "--num",
        "3",
        "--start",
        "10",
        "--",
        "Bun & M3",
      ]);
      expect(signal).toBeInstanceOf(AbortSignal);
      return JSON.stringify({
        query: "Bun & M3",
        organic: [{ title: "Real fixture", url: "https://example.test", snippet: "Source fixture" }],
        authenticated: false,
      });
    },
  });
  expect(await search({ query: " Bun & M3 ", hl: "fr", num: 3, start: 10 })).toEqual({
    query: "Bun & M3",
    organic: [{ title: "Real fixture", url: "https://example.test/", snippet: "Source fixture" }],
    authenticated: false,
  });
});

test("Search refuses invalid bounds before owner execution and redacts malformed or authenticated output", async () => {
  let called = 0;
  const search = createGooglePublicSearch({
    run: async () => {
      called++;
      return "secret-body";
    },
  });
  for (const request of [
    { query: "" },
    { query: "x", start: -1 },
    { query: "x", num: 21 },
    { query: "x", hl: "en --cookies" },
  ])
    await expect(search(request)).rejects.toThrow();
  expect(called).toBe(0);
  await expect(search({ query: "x" })).rejects.toThrow("Google anonymous search unavailable");
  const authenticated = createGooglePublicSearch({
    run: async () => JSON.stringify({ query: "x", organic: [], authenticated: true }),
  });
  await expect(authenticated({ query: "x" })).rejects.toThrow("unavailable");
  const huge = createGooglePublicSearch({ run: async () => "x".repeat(1024 * 1024 + 1) });
  await expect(huge({ query: "x" })).rejects.toThrow("unavailable");
});

test("Search caps concurrent owner jobs and honors cancellation", async () => {
  const releases: (() => void)[] = [];
  const search = createGooglePublicSearch({
    run: async () => {
      await new Promise<void>(resolve => releases.push(resolve));
      return JSON.stringify({ query: "x", organic: [] });
    },
  });
  const pending = Array.from({ length: 4 }, () => search({ query: "x" }));
  await expect(search({ query: "x" })).rejects.toThrow("capacity");
  releases.forEach(release => release());
  await Promise.all(pending);
  const abort = new AbortController();
  abort.abort(new Error("cancelled"));
  await expect(search({ query: "x" }, abort.signal)).rejects.toThrow("cancelled");
});
