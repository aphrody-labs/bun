import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";

describe("Bun.Cookie validation tests", () => {
  describe("expires validation", () => {
    test("accepts valid Date for expires", () => {
      const futureDate = new Date(Date.now() + 86400000); // 1 day in the future
      const cookie = new Bun.Cookie("name", "value", { expires: futureDate });
      expect(cookie.expires).toBeDefined();
      expect(cookie.expires).toBeDate();
      expect(cookie.expires).toEqual(futureDate);
    });

    test("accepts valid number for expires", () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 1 day in the future (in seconds)
      const cookie = new Bun.Cookie("name", "value", { expires: futureTimestamp });
      expect(cookie.expires).toEqual(new Date(futureTimestamp * 1000));
    });

    test("throws for NaN Date", () => {
      const invalidDate = new Date("invalid date"); // Creates a Date with NaN value
      expect(() => {
        new Bun.Cookie("name", "value", { expires: invalidDate });
      }).toThrow("expires must be a valid Date (or Number)");
    });

    test("throws for NaN number", () => {
      expect(() => {
        new Bun.Cookie("name", "value", { expires: NaN });
      }).toThrow("expires must be a valid Number");
    });

    test("throws for non-finite number (Infinity)", () => {
      expect(() => {
        new Bun.Cookie("name", "value", { expires: Infinity });
      }).toThrow("expires must be a valid Number");
    });

    test("does not throw for negative number", () => {
      expect(() => {
        new Bun.Cookie("name", "value", { expires: -1 });
      }).not.toThrow();

      expect(new Bun.Cookie("name", "value", { expires: -1 }).expires).toEqual(new Date(-1 * 1000));
    });

    test("handles undefined expires correctly", () => {
      const cookie = new Bun.Cookie("name", "value", { expires: undefined });
      expect(cookie.expires).toBeUndefined();
    });

    test("handles null expires correctly", () => {
      // @ts-expect-error
      const cookie = new Bun.Cookie("name", "value", { expires: null });
      expect(cookie.expires).toBeUndefined();
    });
  });

  describe("Cookie.from validation", () => {
    test("throws for NaN Date in Cookie.from", () => {
      const invalidDate = new Date("invalid date");
      expect(() => {
        Bun.Cookie.from("name", "value", { expires: invalidDate });
      }).toThrow("expires must be a valid Date (or Number)");
    });

    test("throws for NaN number in Cookie.from", () => {
      expect(() => {
        Bun.Cookie.from("name", "value", { expires: NaN });
      }).toThrow("expires must be a valid Number");
    });

    test("throws for non-finite number in Cookie.from", () => {
      expect(() => {
        Bun.Cookie.from("name", "value", { expires: Infinity });
      }).toThrow("expires must be a valid Number");
    });
  });

  describe("CookieInit validation", () => {
    test("throws with invalid expires when creating with options object", () => {
      expect(() => {
        new Bun.Cookie({
          name: "test",
          value: "value",
          expires: NaN,
        });
      }).toThrow("expires must be a valid Number");
    });

    test("accepts valid expires when creating with options object", () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;
      const cookie = new Bun.Cookie({
        name: "test",
        value: "value",
        expires: futureTimestamp,
      });
      expect(cookie.expires).toEqual(new Date(futureTimestamp * 1000));
    });
  });
});

describe("Expires serialization", () => {
  // RFC 6265 expects an IMF-fixdate: "Wdy, DD Mon YYYY HH:MM:SS GMT".
  // Date.prototype.toUTCString() produces exactly that, so the two must agree.
  test("Expires is an IMF-fixdate matching Date.toUTCString() for every weekday", () => {
    // 7 consecutive UTC days covers every weekday; the 9th keeps the day zero-padded.
    for (let i = 0; i < 7; i++) {
      const date = new Date(Date.UTC(2031, 5, 9 + i, 4, 5, 6));
      const cookie = new Bun.Cookie("a", "b", { expires: date });
      expect(cookie.toString()).toBe(`a=b; Path=/; Expires=${date.toUTCString()}; SameSite=Lax`);
    }
  });

  test("Expires=0 serializes the epoch, not the day after", () => {
    const cookie = new Bun.Cookie("a", "b", { expires: new Date(0) });
    expect(cookie.toString()).toBe("a=b; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax");
  });

  test("CookieMap.delete emits an IMF-fixdate epoch", () => {
    const map = new Bun.CookieMap();
    map.delete("gone");
    expect(map.toSetCookieHeaders()).toEqual(["gone=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax"]);
  });
});

console.log("describe Bun.serve() cookies");
describe("Bun.serve() cookies", () => {
  const server = Bun.serve({
    port: 0,
    routes: {
      "/tester": {
        POST: async req => {
          const body = (await req.json()) as [string, string | null, { domain?: string; path?: string } | undefined][];
          for (const [key, value, options] of body) {
            if (value == null) {
              req.cookies.delete({
                name: key,
                ...options,
              });
            } else {
              req.cookies.set(key, value, options);
            }
          }
          return new Response(JSON.stringify(req.cookies), {
            headers: {
              "Content-Type": "application/json",
            },
          });
        },
      },
    },
  });
  afterAll(() => {
    server.stop();
  });

  test("set-cookie", async () => {
    const res = await fetch(server.url + "/tester", {
      method: "POST",
      body: JSON.stringify([["test", "test"]]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchInlineSnapshot(`
      {
        "test": "test",
      }
    `);
    expect(res.headers.getAll("Set-Cookie")).toMatchInlineSnapshot(`
      [
        "test=test; Path=/; SameSite=Lax",
      ]
    `);
  });
  test("set two cookies", async () => {
    const res = await fetch(server.url + "/tester", {
      method: "POST",
      body: JSON.stringify([
        ["test", "test"],
        ["test2", "test2"],
      ]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchInlineSnapshot(`
      {
        "test": "test",
        "test2": "test2",
      }
    `);
    expect(res.headers.getAll("Set-Cookie")).toMatchInlineSnapshot(`
      [
        "test=test; Path=/; SameSite=Lax",
        "test2=test2; Path=/; SameSite=Lax",
      ]
    `);
  });
  test("delete cookie", async () => {
    const res = await fetch(server.url + "/tester", {
      method: "POST",
      body: JSON.stringify([["test", null]]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchInlineSnapshot(`{}`);
    expect(res.headers.getAll("Set-Cookie")).toMatchInlineSnapshot(`
      [
        "test=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      ]
    `);
  });
  test("request with cookies", async () => {
    const res = await fetch(server.url + "/tester", {
      method: "POST",
      body: JSON.stringify([
        ["do_modify", "c"],
        ["add_cookie", "d"],
      ]),
      headers: {
        "Cookie": "dont_modify=a;do_modify=b",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchInlineSnapshot(`
      {
        "add_cookie": "d",
        "do_modify": "c",
        "dont_modify": "a",
      }
    `);
    expect(res.headers.getAll("Set-Cookie")).toMatchInlineSnapshot(`
      [
        "do_modify=c; Path=/; SameSite=Lax",
        "add_cookie=d; Path=/; SameSite=Lax",
      ]
    `);
  });
  test("request that doesn't modify cookies doesn't set cookies", async () => {
    const res = await fetch(server.url + "/tester", {
      method: "POST",
      body: JSON.stringify([]),
      headers: {
        "Cookie": "dont_modify=a;another_cookie=b",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchInlineSnapshot(`
      {
        "another_cookie": "b",
        "dont_modify": "a",
      }
    `);
    expect(res.headers.getAll("Set-Cookie")).toMatchInlineSnapshot(`[]`);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });
  test("getAllChanges", () => {
    const map = new Bun.CookieMap("dont_modify=ONE; do_modify=TWO; do_delete=THREE");
    map.set("do_modify", "FOUR");
    map.delete("do_delete");
    map.set("do_modify", "FIVE");
    expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`
      [
        "do_delete=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
        "do_modify=FIVE; Path=/; SameSite=Lax",
      ]
    `);
    expect(map.toJSON()).toMatchInlineSnapshot(`
      {
        "do_modify": "FIVE",
        "dont_modify": "ONE",
      }
    `);
  });
});

describe("Bun.serve() cookies 2", () => {
  const server = Bun.serve({
    port: 0,
    routes: {
      "/": req => {
        // Access request cookies
        const cookies = req.cookies;

        // Get a specific cookie
        const sessionCookie = cookies.get("session");
        if (sessionCookie != null) {
          // console.log(sessionCookie);
        }

        // Check if a cookie exists
        if (cookies.has("theme")) {
          // ...
        }

        // Set a cookie, it will be automatically applied to the response
        cookies.set("visited", "true");

        console.log(cookies.toSetCookieHeaders());

        return new Response("Hello");
      },
      "/redirect": req => {
        req.cookies.set("redirected", "true");
        return Response.redirect("/redirect-target");
      },
    },
  });
  afterAll(() => {
    server.stop();
  });

  test("server sets cookie", async () => {
    const response = await fetch(server.url, {
      headers: {
        "Cookie": "abc=def; ghi=jkl",
      },
    });
    expect(response.headers.getAll("Set-Cookie")).toMatchInlineSnapshot(`
      [
        "visited=true; Path=/; SameSite=Lax",
      ]
    `);
  });
  test("server sets cookie on redirect", async () => {
    const response = await fetch(server.url + "/redirect", {
      headers: {
        "Cookie": "abc=def; ghi=jkl",
      },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/redirect-target");
    expect(response.headers.getAll("Set-Cookie")).toMatchInlineSnapshot(`
      [
        "redirected=true; Path=/; SameSite=Lax",
      ]
    `);
  });
});

describe("cookie path option", () => {
  const server = Bun.serve({
    port: 0,
    routes: {
      "/x/y": {
        GET(r) {
          r.cookies.set("user", "a", { maxAge: 3600, path: "/" });
          const cookie = r.cookies.toSetCookieHeaders().at(0)!;
          return new Response("ok", {
            headers: { "set-cookie": cookie },
          });
        },
      },
    },
  });
  afterAll(() => server.stop());

  test("cookie path option", async () => {
    const response = await fetch(server.url + "/x/y");
    expect(response.status).toBe(200);
    expect(response.headers.getAll("Set-Cookie")).toMatchInlineSnapshot(`
      [
        "user=a; Path=/; Max-Age=3600; SameSite=Lax",
        "user=a; Path=/; Max-Age=3600; SameSite=Lax",
      ]
    `);
  });
});
test("delete cookie path option", () => {
  const map = new Bun.CookieMap();
  map.delete("a", { path: "/b" });
  map.delete("b", { path: "" });
  map.delete("c", {});
  map.delete("d", { path: "/" });
  expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`
    [
      "a=; Path=/b; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      "b=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      "c=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      "d=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    ]
  `);
});
test("delete cookie invalid path option", () => {
  const map = new Bun.CookieMap();
  expect(() => map.delete("a", { path: "\n" })).toThrowErrorMatchingInlineSnapshot(
    `"Invalid cookie path: contains invalid characters"`,
  );
  expect(() => map.delete("a", { domain: "\n" })).toThrowErrorMatchingInlineSnapshot(
    `"Invalid cookie domain: contains invalid characters"`,
  );
  expect(() => map.delete("\n", {})).toThrowErrorMatchingInlineSnapshot(
    `"Invalid cookie name: contains invalid characters"`,
  );
});

describe("Bun.CookieMap constructor", () => {
  test("throws for invalid array", () => {
    expect(() => new Bun.CookieMap([["abc defg =fhaingj809读写汉字学中文"]])).toThrowErrorMatchingInlineSnapshot(
      `"Expected arrays of exactly two strings"`,
    );
  });
  test("accepts unicode cookie value in object", () => {
    const map = new Bun.CookieMap({
      "cookie key": "读写汉字学中文",
    });
    expect(map.get("cookie key")).toBe("读写汉字学中文");
  });
  test("accepts unicode cookie value in array", () => {
    const map = new Bun.CookieMap([["cookie key", "读写汉字学中文"]]);
    expect(map.get("cookie key")).toBe("读写汉字学中文");
  });
  test("accepts unicode cookie value in string", () => {
    const map = new Bun.CookieMap("cookie key=读写汉字学中文");
    expect(map.get("cookie key")).toBe("读写汉字学中文");
  });
  test("serializes unicode cookie value", () => {
    const map = new Bun.CookieMap();
    map.set("cookiekey", "读写汉字学中文");
    expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`
      [
        "cookiekey=%E8%AF%BB%E5%86%99%E6%B1%89%E5%AD%97%E5%AD%A6%E4%B8%AD%E6%96%87; Path=/; SameSite=Lax",
      ]
    `);
    // re-parse
    const reparsed = new Bun.CookieMap(map.toSetCookieHeaders()[0].split(";")[0]!);
    expect(reparsed.get("cookiekey")).toBe("读写汉字学中文");
  });
  test("doesn't parse percent encoded value in object or array", () => {
    const map = new Bun.CookieMap({
      "cookiekey": "%E8%AF%BB%E5%86%99%E6%B1%89%E5%AD%97%E5%AD%A6%E4%B8%AD%E6%96%87",
    });
    const map2 = new Bun.CookieMap([["cookiekey", "%E8%AF%BB%E5%86%99%E6%B1%89%E5%AD%97%E5%AD%A6%E4%B8%AD%E6%96%87"]]);
    expect(map.get("cookiekey")).toBe("%E8%AF%BB%E5%86%99%E6%B1%89%E5%AD%97%E5%AD%A6%E4%B8%AD%E6%96%87");
    expect(map2.get("cookiekey")).toBe("%E8%AF%BB%E5%86%99%E6%B1%89%E5%AD%97%E5%AD%A6%E4%B8%AD%E6%96%87");
  });
});

describe("cookie name parsing from Cookie header", () => {
  test("does not percent-decode cookie names when parsing a Cookie header string", () => {
    // A cookie literally named "__%48ost-session" must not alias "__Host-session":
    // browsers enforce __Host-/__Secure- prefix rules on the literal, un-decoded name,
    // so decoding the name would let an unprotected cookie shadow a protected one.
    const map = new Bun.CookieMap("__%48ost-session=attacker; __Host-session=legit");
    expect(map.get("__Host-session")).toBe("legit");
    expect(map.get("__%48ost-session")).toBe("attacker");

    // A lone encoded name must not surface under the decoded name at all.
    const only = new Bun.CookieMap("__%48ost-session=attacker");
    expect(only.get("__Host-session")).toBeNull();
    expect(only.get("__%48ost-session")).toBe("attacker");

    // Values are still percent-decoded.
    expect(new Bun.CookieMap("plain=%E8%AF%BB").get("plain")).toBe("读");
  });

  test("request cookie lookup matches names literally", async () => {
    using server = Bun.serve({
      port: 0,
      routes: {
        "/": req =>
          Response.json({
            host: req.cookies.get("__Host-session"),
            raw: req.cookies.get("__%48ost-session"),
          }),
      },
    });
    const res = await fetch(server.url, {
      headers: { "Cookie": "__%48ost-session=attacker" },
    });
    expect(await res.json()).toEqual({ host: null, raw: "attacker" });
    expect(res.status).toBe(200);
  });
});

describe("bun cookie", () => {
  async function bunCookie(cwd: string, args: string[], stdin?: string) {
    await using proc = Bun.spawn({
      cmd: [bunExe(), "cookie", ...args],
      cwd,
      env: { ...bunEnv, BUN_COOKIE_DIR: undefined },
      stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    return { stdout, stderr, exitCode };
  }

  const devtoolsExport = JSON.stringify([
    {
      name: "sid",
      value: "top-secret",
      domain: ".example.com",
      path: "/",
      expirationDate: 4102444800,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    },
    { name: "theme", value: "dark", domain: "example.com", path: "/", session: true, sameSite: "no_restriction" },
    { name: "other", value: "x", domain: ".other.org", path: "/" },
  ]);

  test.concurrent("imports a DevTools export, never prints values, and builds the Cookie header", async () => {
    using dir = tempDir("bun-cookie-json", { "export.json": devtoolsExport });
    const cwd = String(dir);
    const base = ["--name", "site", "--dir", "jars"];

    let result = await bunCookie(cwd, ["import", "export.json", "--domain", "example.com", ...base]);
    expect(result.stderr).toBe("");
    expect(result.stdout).toStartWith("imported 2 cookies into jar site (2 total): ");
    expect(result.exitCode).toBe(0);

    const jarFile = path.join(cwd, "jars", "site.json");
    expect(JSON.parse(await Bun.file(jarFile).text())).toEqual([
      {
        name: "sid",
        value: "top-secret",
        domain: ".example.com",
        path: "/",
        expires: 4102444800,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
      {
        name: "theme",
        value: "dark",
        domain: "example.com",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "None",
      },
    ]);
    if (!isWindows) {
      expect(fs.statSync(jarFile).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(cwd, "jars")).mode & 0o777).toBe(0o700);
    }

    result = await bunCookie(cwd, ["list", ...base]);
    expect(result.stdout).not.toContain("top-secret");
    expect(result.stdout).toContain("********");
    expect(result.stdout).toContain("2100-01-01T00:00:00Z");
    expect(result.stdout).toContain("session");

    result = await bunCookie(cwd, ["header", "https://www.example.com/home", ...base]);
    expect(result.stdout).toBe("Cookie: sid=********\n");

    result = await bunCookie(cwd, ["header", "example.com", "--reveal", ...base]);
    expect(result.stdout).toBe("Cookie: sid=top-secret; theme=dark\n");

    // a bare host is https; --insecure drops the Secure cookie
    result = await bunCookie(cwd, ["header", "example.com", "--insecure", "--reveal", "--value-only", ...base]);
    expect(result.stdout).toBe("theme=dark\n");

    result = await bunCookie(cwd, ["header", "nope.org", ...base]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("no cookie in jar site applies to nope.org");

    result = await bunCookie(cwd, ["get", "sid", "--reveal", ...base]);
    expect(result.stdout).toBe("top-secret\n");
  });

  test.concurrent("the header it builds is the one Bun.CookieMap reads", async () => {
    using dir = tempDir("bun-cookie-roundtrip", { "export.json": devtoolsExport });
    const cwd = String(dir);
    const base = ["--name", "site", "--dir", "jars"];
    await bunCookie(cwd, ["import", "export.json", ...base]);
    const { stdout } = await bunCookie(cwd, ["header", "example.com", "--reveal", "--value-only", ...base]);
    expect(new Bun.CookieMap(stdout.trim()).toJSON()).toEqual({ sid: "top-secret", theme: "dark" });
  });

  test.concurrent("imports Netscape cookies.txt and a header string", async () => {
    using dir = tempDir("bun-cookie-formats", {
      "cookies.txt":
        "# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t4102444800\tsid\tabc\n#HttpOnly_www.example.com\tFALSE\t/app\tFALSE\t0\ttoken\txyz\n",
    });
    const cwd = String(dir);
    const base = ["--name", "n", "--dir", "jars"];

    let result = await bunCookie(cwd, ["import", "cookies.txt", ...base]);
    expect(result.stdout).toStartWith("imported 2 cookies into jar n (2 total)");
    const saved = JSON.parse(await Bun.file(path.join(cwd, "jars", "n.json")).text());
    expect(saved[1]).toMatchObject({
      name: "token",
      domain: "www.example.com",
      path: "/app",
      httpOnly: true,
      expires: -1,
    });

    // a header string needs a domain
    result = await bunCookie(cwd, ["import", "a=1; b=2", ...base]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--domain");

    result = await bunCookie(cwd, ["import", "a=1; sid=new", "--domain", "example.com", ...base]);
    expect(result.stdout).toStartWith("imported 2 cookies into jar n (3 total)");

    result = await bunCookie(cwd, ["import", "-", "--domain", "stdin.test", "--replace", ...base], "Cookie: z=9");
    expect(result.stdout).toStartWith("imported 1 cookies into jar n (1 total)");
  });

  test.concurrent("rm and check", async () => {
    using dir = tempDir("bun-cookie-rm", {
      "export.json": JSON.stringify([
        {
          name: "good",
          value: "1",
          domain: "example.com",
          path: "/",
          expires: 4102444800,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
        { name: "old", value: "2", domain: "example.com", path: "/", expires: 1000, httpOnly: true, secure: true },
        { name: "bad", value: "3", domain: "example.com", path: "/", httpOnly: true, secure: false, sameSite: "None" },
        { name: "__Host-id", value: "4", domain: ".example.com", path: "/app", httpOnly: true, secure: true },
      ]),
    });
    const cwd = String(dir);
    const base = ["--name", "j", "--dir", "jars"];
    await bunCookie(cwd, ["import", "export.json", ...base]);

    let result = await bunCookie(cwd, ["check", "--json", ...base]);
    const report = JSON.parse(result.stdout);
    expect(result.exitCode).toBe(1);
    expect(report).toMatchObject({ cookies: 4, passed: false });
    const codes = Object.fromEntries(report.report.map((r: any) => [r.name, r.issues.map((i: any) => i.code)]));
    expect(codes).toEqual({
      good: [],
      old: ["expired"],
      bad: ["samesite-none-insecure", "not-secure"],
      "__Host-id": ["prefix-host", "prefix-host"],
    });
    expect(result.stdout).not.toContain('"value"');

    result = await bunCookie(cwd, ["rm", "--expired", ...base]);
    expect(result.stdout).toBe("removed 1 cookies from jar j (3 left)\n");
    result = await bunCookie(cwd, ["rm", "bad", ...base]);
    expect(result.stdout).toBe("removed 1 cookies from jar j (2 left)\n");
    result = await bunCookie(cwd, ["rm", "bad", ...base]);
    expect(result.exitCode).toBe(1);

    result = await bunCookie(cwd, ["jars", "--dir", "jars"]);
    expect(result.stdout).toBe("j  (2 cookies)\n");
    result = await bunCookie(cwd, ["rm", "--all", ...base]);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(cwd, "jars", "j.json"))).toBe(false);
  });

  test.concurrent("BUN_COOKIE_DIR chooses the jar directory and bad usage exits with 2", async () => {
    using dir = tempDir("bun-cookie-dir", {});
    const cwd = String(dir);
    await using proc = Bun.spawn({
      cmd: [bunExe(), "cookie", "import", "a=1", "--domain", "example.com"],
      cwd,
      env: { ...bunEnv, BUN_COOKIE_DIR: path.join(cwd, "env-jars") },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);
    expect(fs.existsSync(path.join(cwd, "env-jars", "default.json"))).toBe(true);

    expect((await bunCookie(cwd, ["frobnicate"])).exitCode).toBe(2);
    expect((await bunCookie(cwd, ["list", "--name", "../x", "--dir", "jars"])).exitCode).toBe(2);
    const help = await bunCookie(cwd, ["--help"]);
    expect(help.stdout).toStartWith("bun cookie: keep browser cookies in jars");
    expect(help.exitCode).toBe(0);
  });
});
