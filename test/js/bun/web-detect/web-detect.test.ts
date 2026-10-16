import { describe, expect, test } from "bun:test";

describe("Bun.WebDetect", () => {
  test("detects a Cloudflare challenge from a local fetch response", async () => {
    using server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response("<html><script>window.__cf_chl_opt={}</script><script src=/_next/static/x.js></script></html>", {
          status: 403,
          headers: { "cf-mitigated": "challenge", "cf-ray": "abc-FRA", server: "cloudflare" },
        }),
    });
    const response = await fetch(server.url);
    const report = Bun.WebDetect.detect({
      url: server.url.href,
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
    expect(report.challenge).toMatchObject({ provider: "cloudflare-turnstile", confidence: "high", recommendation: "max" });
    expect(report.httpStatus).toBe(403);
    expect(report.hostname).toBe(server.url.hostname);
    expect(report.findings.map(finding => finding.name)).toEqual(expect.arrayContaining(["Cloudflare", "Next.js"]));
  });

  test("plain response has no challenge and accepts repeated headers", () => {
    const report = Bun.WebDetect.detect({
      url: "https://example.test/",
      headers: { "set-cookie": ["a=1", "b=2"] },
      body: "<html><body>hello</body></html>",
    });
    expect(report.challenge.provider).toBe("none");
    expect(report.httpStatus).toBe(200);
  });

  test("rejects invalid input", () => {
    expect(() => Bun.WebDetect.detect({ url: "file:///etc/passwd" })).toThrow("only http and https");
    // @ts-expect-error
    expect(() => Bun.WebDetect.detect()).toThrow(TypeError);
  });

  test("isForbiddenAddress applies the browser SSRF deny-set", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.100.100.200", "::1", "[::ffff:127.0.0.1]", "fe80::1"])
      expect([ip, Bun.WebDetect.isForbiddenAddress(ip)]).toEqual([ip, true]);
    for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
      expect([ip, Bun.WebDetect.isForbiddenAddress(ip)]).toEqual([ip, false]);
    expect(() => Bun.WebDetect.isForbiddenAddress("localhost")).toThrow("Invalid IP address");
  });
});
