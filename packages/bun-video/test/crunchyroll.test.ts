import { describe, expect, spyOn, test } from "bun:test";
import { createCrunchyrollClient, CrunchyrollError, parseCrunchyrollWatchUrl } from "../src/crunchyroll";

const cms = {
  bucket: "/FR/M3",
  signature: "local-signature",
  policy: "local-policy",
  expires: 12345,
  key_pair_id: "local-key",
};

async function withAPI(
  run: (
    baseURL: string,
    calls: { url: URL; method: string; authorization: string | null; body: string }[],
  ) => Promise<void>,
  custom?: (request: Request) => Response | Promise<Response>,
) {
  const calls: { url: URL; method: string; authorization: string | null; body: string }[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      calls.push({
        url,
        method: request.method,
        authorization: request.headers.get("authorization"),
        body: await request.clone().text(),
      });
      if (custom) return custom(request);
      if (url.pathname === "/auth/v1/token")
        return Response.json({
          account_id: "account",
          access_token: "local-token",
          token_type: "Bearer",
        });
      if (url.pathname === "/index/v2") return Response.json({ cms });
      return Response.json({ items: ["local-fixture"], total: 1 });
    },
  });
  try {
    await run(server.url.origin, calls);
  } finally {
    await server.stop(true);
  }
}

describe("native Crunchyroll migration", () => {
  test("owner-selected French episode preserves its official content ID", () => {
    const watch = parseCrunchyrollWatchUrl("https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys");
    expect(watch).toEqual({
      url: "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys",
      locale: "fr",
      contentId: "GE00389313JAJP",
      slug: "the-god-who-destroys",
    });
    expect(() => parseCrunchyrollWatchUrl("https://crunchyroll.com.example.test/fr/watch/GE00389313JAJP")).toThrow();
    expect(() =>
      parseCrunchyrollWatchUrl("https://user:password@www.crunchyroll.com/fr/watch/GE00389313JAJP"),
    ).toThrow();
  });

  test("shared Chromium password provider supplies credentials only to the explicit login", async () => {
    await withAPI(async baseURL => {
      const api = createCrunchyrollClient({ baseURL, basicAuthorization: "Basic local-app", locale: "fr-FR" });
      const provider = {
        audit: () => ({ records: 1, supportedWebOrigins: 1, credentialsWithPassword: 1, unsupportedRecords: 0 }),
        async withCredential(
          selector: { url: string; username?: string },
          consume: (credential: {
            name: string;
            url: string;
            username: string;
            password: string;
          }) => void | Promise<void>,
        ) {
          expect(selector.url).toBe("https://www.crunchyroll.com");
          await consume({
            name: "fixture",
            url: selector.url,
            username: "local@example.test",
            password: "local-password",
          });
        },
      };
      expect((await api.loginWithBrowserPassword(provider)).client.locale).toBe("fr-FR");
    });
  });
  test("configured French locale survives default password login, search and paginated catalog calls", async () => {
    await withAPI(async (baseURL, calls) => {
      const api = createCrunchyrollClient({
        baseURL,
        basicAuthorization: "Basic local-app",
        locale: "fr-FR",
      });
      expect((await api.login("local@example.test", "local-password")).client.locale).toBe("fr-FR");
      await api.search("déesse & dieu 日本語");
      await api.getAllAnimes(20, 5);
      const search = calls.find(call => call.url.pathname.endsWith("/search"))!.url;
      const catalog = calls.find(call => call.url.pathname.endsWith("/browse"))!.url;
      expect(search.searchParams.get("locale")).toBe("fr-FR");
      expect(search.searchParams.get("q")).toBe("déesse & dieu 日本語");
      expect(catalog.searchParams.get("locale")).toBe("fr-FR");
      expect(catalog.searchParams.get("start")).toBe("20");
      expect(catalog.searchParams.get("n")).toBe("5");
      expect(calls.filter(call => call.url.pathname === "/auth/v1/token")).toHaveLength(1);
    });
  });

  test("password login uses explicit authorization, form body, private state and preserves locale", async () => {
    await withAPI(async (baseURL, calls) => {
      const api = createCrunchyrollClient({ baseURL, basicAuthorization: "Basic local-app" });
      const result = await api.login("local@example.test", "local-password", "fr-FR");
      expect(result).toEqual({
        success: true,
        message: "Login successful",
        client: { id: "account", locale: "fr-FR", time: expect.any(Number), authenticated: true },
      });
      expect(calls[0]!.method).toBe("POST");
      expect(calls[0]!.authorization).toBe("Basic local-app");
      expect(new URLSearchParams(calls[0]!.body).get("grant_type")).toBe("password");
      expect(new URLSearchParams(calls[0]!.body).get("username")).toBe("local@example.test");
      expect(new URLSearchParams(calls[0]!.body).get("password")).toBe("local-password");
      expect(new URLSearchParams(calls[0]!.body).get("scope")).toBe("offline_access");
      expect(calls[1]!.url.pathname).toBe("/index/v2");
      expect(calls[1]!.authorization).toBe("Bearer local-token");
      expect(JSON.stringify(api.client)).not.toContain("local-password");
      expect(JSON.stringify(api.client)).not.toContain("local-token");
    });
  });

  test("all ten content operations preserve routes, query signatures and pagination", async () => {
    await withAPI(async (baseURL, calls) => {
      const api = createCrunchyrollClient({
        baseURL,
        accessToken: "local-token",
        accountId: "account",
        locale: "fr-FR",
      });
      expect((await api.loginWithAccessToken()).success).toBe(true);
      const operations: [() => Promise<unknown>, string, Record<string, string>, boolean][] = [
        [() => api.getProfile(), "/accounts/v1/me/profile", {}, false],
        [() => api.getAnime("A/B"), "/cms/v2/FR/M3/series/A%2FB", {}, true],
        [() => api.getSeasons("series & id"), "/cms/v2/FR/M3/seasons", { series_id: "series & id" }, true],
        [() => api.getEpisodes("season"), "/cms/v2/FR/M3/episodes", { season_id: "season" }, true],
        [() => api.getCategories("series"), "/content/v1/tenant_categories", { guid: "series" }, true],
        [() => api.getRate("series"), "/content-reviews/v2/user/account/rating/series/series", {}, false],
        [() => api.getSimilar("series"), "/content/v1/similar_to", { guid: "series", n: "10" }, true],
        [() => api.search("dragon & ball 日本語"), "/content/v1/search", { q: "dragon & ball 日本語" }, true],
        [() => api.getAllAnimes(), "/content/v1/browse", { start: "0", n: "10", sort_by: "alphabetical" }, true],
        [() => api.getNewsFeed(), "/content/v1/news_feed", {}, true],
      ];
      for (const [operation, path, query, signed] of operations) {
        expect(await operation()).toEqual({ items: ["local-fixture"], total: 1 });
        const call = calls.at(-1)!;
        expect(call.url.pathname).toBe(path);
        expect(call.method).toBe("GET");
        expect(call.body).toBe("");
        expect(call.authorization).toBe("Bearer local-token");
        for (const [key, value] of Object.entries(query)) expect(call.url.searchParams.get(key)).toBe(value);
        expect(call.url.searchParams.get("Signature")).toBe(signed ? cms.signature : null);
        if (signed) {
          expect(call.url.searchParams.get("Policy")).toBe(cms.policy);
          expect(call.url.searchParams.get("Expires")).toBe("12345");
          expect(call.url.searchParams.get("Key-Pair-Id")).toBe(cms.key_pair_id);
          expect(call.url.searchParams.get("locale")).toBe("fr-FR");
        }
      }
      await api.getAllAnimes(20, 5, "newly_added");
      expect(calls.at(-1)!.url.searchParams.get("start")).toBe("20");
      expect(calls.at(-1)!.url.searchParams.get("n")).toBe("5");
      expect(calls.at(-1)!.url.searchParams.get("sort_by")).toBe("newly_added");
      await api.getSimilar("series", 3);
      expect(calls.at(-1)!.url.searchParams.get("n")).toBe("3");
    });
  });

  test("client credentials and locale remain isolated; an anonymous client cannot make requests", async () => {
    await withAPI(async (baseURL, calls) => {
      const first = createCrunchyrollClient({ baseURL, accessToken: "first", locale: "fr-FR" });
      const second = createCrunchyrollClient({ baseURL, accessToken: "second", locale: "en-US" });
      await first.loginWithAccessToken();
      await second.loginWithAccessToken();
      await first.search("first");
      await second.search("second");
      expect(calls.at(-2)!.authorization).toBe("Bearer first");
      expect(calls.at(-2)!.url.searchParams.get("locale")).toBe("fr-FR");
      expect(calls.at(-1)!.authorization).toBe("Bearer second");
      expect(calls.at(-1)!.url.searchParams.get("locale")).toBe("en-US");
      const count = calls.length;
      await expect(createCrunchyrollClient({ baseURL }).getProfile()).rejects.toThrow("You must login first");
      expect(calls.length).toBe(count);
      await expect(first.getRate("series")).rejects.toThrow("An accountId is required");
    });
  });

  test("refresh at four minutes deduplicates concurrent requests and retains locale", async () => {
    await withAPI(async (baseURL, calls) => {
      const api = createCrunchyrollClient({ baseURL, basicAuthorization: "Basic local" });
      await api.login("local@example.test", "local", "fr-FR");
      const now = Date.now();
      const clock = spyOn(Date, "now").mockReturnValue(now + 240_001);
      try {
        await Promise.all([api.getAnime("series"), api.getSeasons("series")]);
        expect(calls.filter(call => call.url.pathname === "/auth/v1/token")).toHaveLength(2);
        expect(calls.filter(call => call.url.pathname === "/index/v2")).toHaveLength(2);
        expect(calls.at(-1)!.url.searchParams.get("locale")).toBe("fr-FR");
      } finally {
        clock.mockRestore();
      }
    });
  });

  test("missing application authorization fails locally and clears failed login state", async () => {
    await withAPI(async (baseURL, calls) => {
      const api = createCrunchyrollClient({ baseURL });
      expect((await api.login("local@example.test", "local")).success).toBe(false);
      expect(api.client.authenticated).toBe(false);
      expect(calls).toHaveLength(0);
      expect((await api.login("", "")).message).toBe("Email and password are required");
    });
  });

  test("HTTP, API and malformed JSON errors do not expose server payloads", async () => {
    for (const response of [
      new Response("private-response", { status: 401 }),
      Response.json({ __class__: "error", message: "private-response" }),
      new Response("private-response"),
    ]) {
      await withAPI(
        async baseURL => {
          const api = createCrunchyrollClient({ baseURL, accessToken: "local" });
          const result = await api.loginWithAccessToken();
          expect(result.success).toBe(false);
          expect(result.message).not.toContain("private-response");
        },
        () => response.clone(),
      );
    }
  });

  test("cross-origin redirect never forwards authorization", async () => {
    let destinationCalls = 0;
    const destination = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        destinationCalls++;
        return Response.json({ cms });
      },
    });
    try {
      await withAPI(
        async baseURL => {
          const api = createCrunchyrollClient({ baseURL, accessToken: "local" });
          const result = await api.loginWithAccessToken();
          expect(result.success).toBe(false);
          expect(result.message).toContain("redirects are refused");
          expect(destinationCalls).toBe(0);
        },
        () => Response.redirect(destination.url),
      );
    } finally {
      await destination.stop(true);
    }
  });

  test("caller cancellation and deadline abort the request", async () => {
    await withAPI(async (baseURL, calls) => {
      const api = createCrunchyrollClient({
        baseURL,
        accessToken: "local",
        signal: AbortSignal.abort(),
      });
      expect((await api.loginWithAccessToken()).success).toBe(false);
      expect(calls).toHaveLength(0);
    });
    await withAPI(
      async baseURL => {
        const api = createCrunchyrollClient({ baseURL, accessToken: "local", timeoutMs: 10 });
        expect((await api.loginWithAccessToken()).success).toBe(false);
      },
      () => new Promise<Response>(() => {}),
    );
    expect(() => createCrunchyrollClient({ timeoutMs: 0 })).toThrow(CrunchyrollError);
    expect(() => createCrunchyrollClient({ baseURL: "http://example.test" })).toThrow("requires HTTPS");
  });
});
