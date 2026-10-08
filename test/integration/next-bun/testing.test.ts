// `@aphrody/next-bun/testing`: Next.js instant navigation testing (port of @next/playwright's instant()).
import { expect, test } from "bun:test";
import {
  adaptPage,
  CdpCookieContext,
  INSTANT_COOKIE,
  instant,
  setStepReporter,
  step,
  type CdpSend,
  type PwCookie,
} from "../../../packages/bun-next/testing/index.ts";

/** An in-memory CDP cookie jar answering the Network.* commands the adapter sends. */
function fakeCdp() {
  let jar: PwCookie[] = [];
  const calls: string[] = [];
  const send: CdpSend = {
    async _send(method, params) {
      calls.push(method);
      switch (method) {
        case "Network.setCookies":
          for (const c of params.cookies as PwCookie[]) {
            jar = jar.filter(x => !(x.name === c.name && x.domain === c.domain && x.path === c.path));
            jar.push({ name: c.name, value: c.value, domain: c.domain, path: c.path });
          }
          return {};
        case "Network.getCookies":
          return { cookies: jar.map(c => ({ ...c })) };
        case "Network.deleteCookies":
          jar = jar.filter(
            c =>
              c.name !== params.name ||
              (params.domain !== undefined && c.domain !== params.domain) ||
              (params.path !== undefined && c.path !== params.path),
          );
          return {};
        case "Network.clearBrowserCookies":
          jar = [];
          return {};
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  return { send, calls, jar: () => jar };
}

const has = (cookies: PwCookie[]) => cookies.some(c => c.name === INSTANT_COOKIE);

test("the cookie name matches Next.js", () => {
  expect(INSTANT_COOKIE).toBe("next-instant-navigation-testing");
});

test("acquires the cookie inside the scope, scoped to the host, and releases it after", async () => {
  const cdp = fakeCdp();
  const page = { url: () => "http://localhost:3000/", _cdp: cdp.send };
  let inside: PwCookie | undefined;
  const result = await instant(page, async () => {
    inside = cdp.jar().find(c => c.name === INSTANT_COOKIE);
    return 42;
  });
  expect(result).toBe(42);
  expect(inside?.domain).toBe("localhost");
  expect(inside?.path).toBe("/");
  const value = JSON.parse(inside!.value);
  expect(value[0]).toBe(0);
  expect(String(value[1]).startsWith("p")).toBe(true);
  expect(has(cdp.jar())).toBe(false);
});

test("releasing deletes only the instant cookie", async () => {
  const cdp = fakeCdp();
  const page = adaptPage({ url: () => "http://localhost:3000/", _cdp: cdp.send });
  await page.context().addCookies([{ name: "session", value: "1", domain: "localhost", path: "/" }]);
  await instant(page, async () => {});
  expect(cdp.jar().map(c => c.name)).toEqual(["session"]);
  expect(cdp.calls).not.toContain("Network.clearBrowserCookies");
});

test("a stale cookie from a finished scope does not block the next one", async () => {
  const cdp = fakeCdp();
  const page = adaptPage({ url: () => "http://localhost:3000/", _send: cdp.send._send });
  await page.context().addCookies([{ name: INSTANT_COOKIE, value: "[1,null]", domain: "localhost", path: "/" }]);
  expect(await instant(page, async () => "ok")).toBe("ok");
  expect(has(cdp.jar())).toBe(false);
});

test("releases the cookie when the body throws", async () => {
  const cdp = fakeCdp();
  const page = { url: () => "http://localhost:3000/", _cdp: cdp.send };
  await expect(
    instant(page, async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(has(cdp.jar())).toBe(false);
});

test("rejects nested scopes on the same page, even through the raw page", async () => {
  const cdp = fakeCdp();
  const raw = { url: () => "http://localhost:3000/", _cdp: cdp.send };
  await instant(raw, async () => {
    await expect(instant(raw, async () => undefined)).rejects.toThrow("An instant() scope is already active");
  });
  expect(has(cdp.jar())).toBe(false);
  expect(await instant(raw, async () => "again")).toBe("again");
});

test("uses baseURL on a fresh page and explains when it is missing", async () => {
  const cdp = fakeCdp();
  const page = { url: () => "about:blank", _cdp: cdp.send };
  let domain: string | undefined;
  await instant(page, async () => void (domain = cdp.jar()[0]?.domain), { baseURL: "https://example.test/app" });
  expect(domain).toBe("example.test");
  const calls = cdp.calls.length;
  await expect(instant(page, async () => undefined)).rejects.toThrow("Could not infer the base URL");
  expect(cdp.calls.length).toBe(calls);
});

test("a page without a CDP seam is rejected", () => {
  expect(() => adaptPage({ url: () => "http://localhost/" })).toThrow("neither `_cdp` nor `_send`");
});

test("clearCookies by name, by scope and all", async () => {
  const cdp = fakeCdp();
  const ctx = new CdpCookieContext(cdp.send);
  await ctx.addCookies([
    { name: "keep", value: "1", domain: "localhost", path: "/" },
    { name: "drop", value: "x", domain: "localhost", path: "/" },
    { name: "other", value: "y", domain: "example.test", path: "/" },
  ]);
  await ctx.clearCookies({ name: "drop" });
  expect((await ctx.cookies()).map(c => c.name)).toEqual(["keep", "other"]);
  await ctx.clearCookies({ domain: "example.test" });
  expect((await ctx.cookies()).map(c => c.name)).toEqual(["keep"]);
  await ctx.clearCookies();
  expect(await ctx.cookies()).toEqual([]);
});

test("step reporters see the acquire and release steps and can be restored", async () => {
  const cdp = fakeCdp();
  const log: string[] = [];
  const prev = setStepReporter(async (title, body) => {
    log.push(title);
    return await body();
  });
  try {
    await instant({ url: () => "http://localhost/", _cdp: cdp.send }, async () => {});
    expect(await step("Sample", async () => 7)).toBe(7);
  } finally {
    setStepReporter(prev);
  }
  expect(log).toEqual(["Acquire Instant Lock", "Release Instant Lock", "Sample"]);
  expect(await step("after restore", async () => 1)).toBe(1);
  expect(log).toHaveLength(3);
});
