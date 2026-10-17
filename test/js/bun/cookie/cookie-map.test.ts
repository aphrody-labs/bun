import { describe, expect, test } from "bun:test";

describe("Bun.Cookie and Bun.CookieMap", () => {
  // Basic Cookie tests
  test("can create a basic Cookie", () => {
    const cookie = new Bun.Cookie("name", "value");
    expect(cookie.name).toBe("name");
    expect(cookie.value).toBe("value");
    expect(cookie.path).toBe("/");
    expect(cookie.domain).toBeNull();
    expect(cookie.secure).toBe(false);
    expect(cookie.httpOnly).toBe(false);
    expect(cookie.partitioned).toBe(false);
    expect(cookie.sameSite).toBe("lax");
  });

  test("can create a Cookie with options", () => {
    const cookie = new Bun.Cookie("name", "value", {
      domain: "example.com",
      path: "/foo",
      secure: true,
      httpOnly: true,
      partitioned: true,
      sameSite: "lax",
      maxAge: 3600,
    });

    expect(cookie.name).toBe("name");
    expect(cookie.value).toBe("value");
    expect(cookie.domain).toBe("example.com");
    expect(cookie.path).toBe("/foo");
    expect(cookie.secure).toBe(true);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.partitioned).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.maxAge).toBe(3600);
  });

  test("Cookie.toString() formats properly", () => {
    const cookie = new Bun.Cookie("name", "value", {
      domain: "example.com",
      path: "/foo",
      secure: true,
      httpOnly: true,
      partitioned: true,
      sameSite: "strict",
      maxAge: 3600,
    });

    const str = cookie.toString();
    expect(str).toInclude("name=value");
    expect(str).toInclude("Domain=example.com");
    expect(str).toInclude("Path=/foo");
    expect(str).toInclude("Max-Age=3600");
    expect(str).toInclude("Secure");
    expect(str).toInclude("HttpOnly");
    expect(str).toInclude("Partitioned");
    expect(str).toInclude("SameSite=Strict");
    expect(str).toMatchInlineSnapshot(
      `"name=value; Domain=example.com; Path=/foo; Max-Age=3600; Secure; HttpOnly; Partitioned; SameSite=Strict"`,
    );
  });

  test("can set Cookie expires as Date", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1); // tomorrow

    const cookie = new Bun.Cookie("name", "value", {
      expires: futureDate,
    });

    expect(cookie.isExpired()).toBe(false);
  });

  test("Cookie.isExpired() returns correct value", async () => {
    // Expired cookie (max-age in the past)
    const expiredCookie = new Bun.Cookie("name", "value", {
      expires: new Date(Date.now() - 1000),
    });
    expect(expiredCookie.isExpired()).toBe(true);

    // Non-expired cookie (future max-age)
    const validCookie = new Bun.Cookie("name", "value", {
      maxAge: 3600, // 1 hour
    });
    expect(validCookie.isExpired()).toBe(false);

    // Session cookie (no expiration)
    const sessionCookie = new Bun.Cookie("name", "value");
    expect(sessionCookie.isExpired()).toBe(false);
  });

  test("Cookie.isExpired() gives Max-Age precedence over Expires", () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 86_400_000);

    // Max-Age wins over Expires regardless of which one the header listed first.
    expect(new Bun.Cookie("name", "value", { maxAge: 3600, expires: past }).isExpired()).toBe(false);
    expect(new Bun.Cookie("name", "value", { maxAge: 0, expires: future }).isExpired()).toBe(true);
    expect(Bun.Cookie.parse("a=b; Max-Age=3600; Expires=Wed, 21 Oct 2015 07:28:00 GMT").isExpired()).toBe(false);
    expect(Bun.Cookie.parse("a=b; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Max-Age=3600").isExpired()).toBe(false);

    // A non-positive Max-Age is the "delete this cookie" signal.
    expect(new Bun.Cookie("name", "value", { maxAge: 0 }).isExpired()).toBe(true);
    expect(new Bun.Cookie("name", "value", { maxAge: -1 }).isExpired()).toBe(true);
  });

  test("Cookie.parse works with all attributes", () => {
    const cookieStr =
      "name=value; Domain=example.com; Expires=Thu, 13 Mar 2025 12:00:00 GMT; Path=/foo; Max-Age=3600; Secure; HttpOnly; Partitioned; SameSite=Strict";
    const cookie = Bun.Cookie.parse(cookieStr);

    expect(cookie.name).toBe("name");
    expect(cookie.value).toBe("value");
    expect(cookie.domain).toBe("example.com");
    expect(cookie.path).toBe("/foo");
    expect(cookie.maxAge).toBe(3600);
    expect(cookie.secure).toBe(true);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.expires).toEqual(new Date("Thu, 13 Mar 2025 12:00:00 GMT"));
    expect(cookie.partitioned).toBe(true);
    expect(cookie.sameSite).toBe("strict");
  });

  test("Cookie.parse keeps Expires when Max-Age comes first", () => {
    const maxAgeFirst = Bun.Cookie.parse("a=b; Max-Age=60; Expires=Wed, 01 Jan 2031 00:00:00 GMT");
    const expiresFirst = Bun.Cookie.parse("a=b; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Max-Age=60");

    expect(maxAgeFirst.toJSON()).toEqual({
      name: "a",
      value: "b",
      path: "/",
      expires: new Date("Wed, 01 Jan 2031 00:00:00 GMT"),
      maxAge: 60,
      secure: false,
      sameSite: "lax",
      httpOnly: false,
      partitioned: false,
    });
    expect(maxAgeFirst.toJSON()).toEqual(expiresFirst.toJSON());
    expect(maxAgeFirst.toString()).toBe(expiresFirst.toString());
  });

  test("Cookie.parse takes the last value of a repeated attribute", () => {
    const cookie = Bun.Cookie.parse(
      "a=b; Max-Age=10; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Max-Age=60; Expires=Thu, 02 Jan 2031 00:00:00 GMT",
    );

    expect(cookie.maxAge).toBe(60);
    expect(cookie.expires).toEqual(new Date("Thu, 02 Jan 2031 00:00:00 GMT"));
  });

  test("Cookie.parse reads every attribute in any order", () => {
    const attributes = [
      "Max-Age=3600",
      "Expires=Thu, 13 Mar 2025 12:00:00 GMT",
      "Domain=example.com",
      "Path=/foo",
      "Secure",
      "HttpOnly",
      "Partitioned",
      "SameSite=Strict",
    ];
    const expected = Bun.Cookie.parse(`name=value; ${attributes.join("; ")}`).toJSON();
    expect(expected).toHaveProperty("expires", new Date("Thu, 13 Mar 2025 12:00:00 GMT"));

    // Rotating the attributes must never change the parsed cookie.
    for (let i = 1; i < attributes.length; i++) {
      const rotated = [...attributes.slice(i), ...attributes.slice(0, i)];
      expect(Bun.Cookie.parse(`name=value; ${rotated.join("; ")}`).toJSON()).toEqual(expected);
    }
  });

  test("Cookie.serialize creates cookie string", () => {
    const cookie1 = new Bun.Cookie("foo", "bar");
    const cookie2 = new Bun.Cookie("baz", "qux");

    expect(cookie1.serialize() + "\n" + cookie2.serialize()).toMatchInlineSnapshot(`
      "foo=bar; Path=/; SameSite=Lax
      baz=qux; Path=/; SameSite=Lax"
    `);
  });

  // Basic CookieMap tests
  test("can create an empty CookieMap", () => {
    const map = new Bun.CookieMap();
    expect(map.size).toBe(0);
    expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`[]`);
  });

  test("can create CookieMap from string", () => {
    const map = new Bun.CookieMap("name=value; foo=bar");
    expect(map.size).toBe(2);

    const cookie1 = map.get("name");
    expect(cookie1).toBeDefined();
    expect(cookie1).toBe("value");

    const cookie2 = map.get("foo");
    expect(cookie2).toBeDefined();
    expect(cookie2).toBe("bar");

    expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`[]`);
  });

  test("can create CookieMap from object", () => {
    const map = new Bun.CookieMap({
      name: "value",
      foo: "bar",
    });

    expect(map.size).toBe(2);
    expect(map.get("name")).toBe("value");
    expect(map.get("foo")).toBe("bar");
    expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`[]`);
  });

  test("can create CookieMap from array pairs", () => {
    const map = new Bun.CookieMap([
      ["name", "value"],
      ["foo", "bar"],
    ]);

    expect(map.size).toBe(2);
    expect(map.get("name")).toBe("value");
    expect(map.get("foo")).toBe("bar");
    expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`[]`);
  });

  test("CookieMap methods work", () => {
    const map = new Bun.CookieMap();

    // Set a cookie with name/value
    map.set("name", "value");
    expect(map.size).toBe(1);
    expect(map.has("name")).toBe(true);

    // Set with cookie object
    map.set(
      new Bun.Cookie("foo", "bar", {
        secure: true,
        httpOnly: true,
        partitioned: true,
      }),
    );
    expect(map.size).toBe(2);
    expect(map.has("foo")).toBe(true);
    expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`
      [
        "name=value; Path=/; SameSite=Lax",
        "foo=bar; Path=/; Secure; HttpOnly; Partitioned; SameSite=Lax",
      ]
    `);

    // Delete a cookie
    map.delete("name");
    expect(map.size).toBe(1);
    expect(map.has("name")).toBe(false);
    expect(map.get("name")).toBe(null);

    // Get changes
    expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`
      [
        "foo=bar; Path=/; Secure; HttpOnly; Partitioned; SameSite=Lax",
        "name=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      ]
    `);
  });

  test("CookieMap supports iteration", () => {
    const map = new Bun.CookieMap("a=1; b=2; c=3");

    // Test keys()
    const keys = Array.from(map.keys());
    expect(keys).toEqual(["a", "b", "c"]);

    // Test entries()
    let count = 0;
    for (const [key, value] of map.entries()) {
      count++;
      expect(typeof key).toBe("string");
      expect(typeof value).toBe("string");
      expect(["1", "2", "3"]).toContain(value);
    }
    expect(count).toBe(3);

    // Test forEach
    const collected: string[] = [];
    map.forEach((value, key) => {
      collected.push(`${key}=${value}`);
    });
    expect(collected.sort()).toEqual(["a=1", "b=2", "c=3"]);
  });

  test("CookieMap.toJSON() formats properly", () => {
    const map = new Bun.CookieMap("a=1; b=2");
    expect(map.toJSON()).toMatchInlineSnapshot(`
      {
        "a": "1",
        "b": "2",
      }
    `);
  });

  test("CookieMap.toJSON() handles numeric cookie names", () => {
    const map = new Bun.CookieMap("0=first; 1=second; 42=answer");
    expect(map.toJSON()).toEqual({
      "0": "first",
      "1": "second",
      "42": "answer",
    });
  });

  test("CookieMap.toJSON() handles cookie names matching Object.prototype properties", () => {
    const map = new Bun.CookieMap("toString=hello; constructor=world; valueOf=test");
    expect(map.toJSON()).toEqual({
      "toString": "hello",
      "constructor": "world",
      "valueOf": "test",
    });
  });

  test("CookieMap works with cookies with advanced attributes", () => {
    const map = new Bun.CookieMap();

    // Add a cookie with httpOnly and partitioned flags
    map.set("session", "abc123", {
      httpOnly: true,
      secure: true,
      partitioned: true,
      maxAge: 3600,
    });

    expect(map.get("session")).toBe("abc123");
    expect(map.toSetCookieHeaders()).toMatchInlineSnapshot(`
      [
        "session=abc123; Path=/; Max-Age=3600; Secure; HttpOnly; Partitioned; SameSite=Lax",
      ]
    `);
  });
});

describe("Cookie name field is immutable", () => {
  test("can create a Cookie", () => {
    const cookie = new Bun.Cookie("name", "value");
    expect(cookie.name).toBe("name");
    // @ts-expect-error
    cookie.name = "foo";
    expect(cookie.name).toBe("name");
  });
  test("mutate cookie in map", () => {
    const cookieMap = new Bun.CookieMap();
    const cookie = new Bun.Cookie("name", "value");
    cookieMap.set(cookie);
    expect(cookieMap.get("name")).toBe("value");
    cookie.value = "value2";
    expect(cookieMap.get("name")).toBe("value2");
    expect(cookieMap.toSetCookieHeaders()).toMatchInlineSnapshot(`
      [
        "name=value2; Path=/; SameSite=Lax",
      ]
    `);
  });
});

describe("iterator", () => {
  test("delete in a loop", () => {
    const map = new Bun.CookieMap();
    for (let i = 0; i < 1000; i++) {
      map.set(`name${i}`, `value${i}`);
    }
    for (const key of map.keys()) {
      map.delete(key);
    }
    // expect(map.size).toBe(0);
    expect(map.size).toBe(500); // FormData works this way, but not Set. maybe we should work like Set.
  });
  test("delete in a loop with predefined entries", () => {
    const entries: [string, string][] = [];
    for (let i = 0; i < 1000; i++) {
      entries.push([`name${i}`, `value${i}`]);
    }
    const map = new Bun.CookieMap(entries);
    for (const key of map.keys()) {
      map.delete(key);
    }
    expect(map.size).toBe(0);
  });
  test("delete in a loop with both", () => {
    const entries: [string, string][] = [];
    for (let i = 0; i < 500; i++) {
      entries.push([`pre${i}`, `pre${i}`]);
    }
    const map = new Bun.CookieMap(entries);
    for (let i = 0; i < 1000; i++) {
      map.set(`post${i}`, `post${i}`);
    }
    for (const key of map.keys()) {
      map.delete(key);
    }
    // expect(map.size).toBe(0);
    expect(map.size).toBe(500); // FormData works this way, but not Set. maybe we should work like Set.
  });
  test("basic iterator", () => {
    const cookies = new Bun.CookieMap({ a: "b", c: "d" });
    cookies.set("e", "f");
    cookies.set("g", "h");
    expect([...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("\n")).toMatchInlineSnapshot(`
    "e=f
    g=h
    a=b
    c=d"
  `);
  });
});

describe("cookie header values with non-ASCII characters", () => {
  test("preserves a non-ASCII cookie value when another value in the header is percent-encoded", () => {
    const map = new Bun.CookieMap("a=%20; b=café");
    expect(map.get("b")).toBe("café");
    expect(map.get("a")).toBe(" ");
  });

  test("decodes a percent-encoded cookie value that also contains non-ASCII characters", () => {
    const map = new Bun.CookieMap("b=café%20au%20lait");
    expect(map.get("b")).toBe("café au lait");
  });
});

describe("delete with prefixed cookie names", () => {
  test("deleting a cookie whose name starts with __Host- emits a Secure expiring cookie", () => {
    const map = new Bun.CookieMap("__Host-id=1");
    map.delete("__Host-id");
    expect(map.toSetCookieHeaders()).toEqual([
      "__Host-id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax",
    ]);
  });

  test("deleting a cookie whose name starts with __Secure- emits a Secure expiring cookie", () => {
    const map = new Bun.CookieMap("__Secure-id=1");
    map.delete("__Secure-id");
    expect(map.toSetCookieHeaders()).toEqual([
      "__Secure-id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax",
    ]);
  });

  test("deleting a cookie without a name prefix emits an expiring cookie without Secure", () => {
    const map = new Bun.CookieMap("__Host-id=1; id=1");
    map.delete("__Host-id");
    map.delete("id");
    expect(map.toSetCookieHeaders()).toEqual([
      "__Host-id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax",
      "id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    ]);
  });
});

describe("subclassing", () => {
  class SessionCookie extends Bun.Cookie {
    pair() {
      return `${this.name}=${this.value}`;
    }
  }
  class Jar extends Bun.CookieMap {
    names() {
      return [...this.keys()];
    }
  }

  test.each([
    ["(name, value)", ["id", "1"]],
    ["(name, value, options)", ["id", "1", { path: "/app" }]],
    ["(cookieString)", ["id=1; Path=/app"]],
    ["(options)", [{ name: "id", value: "1", path: "/app" }]],
  ])("new (class extends Bun.Cookie)%s returns an instance of the subclass", (_overload, args) => {
    const cookie = new SessionCookie(...(args as any));
    expect(Object.getPrototypeOf(cookie)).toBe(SessionCookie.prototype);
    expect(cookie).toBeInstanceOf(Bun.Cookie);
    expect(cookie.pair()).toBe("id=1");
    expect(cookie.serialize()).toStartWith("id=1; Path=/");
  });

  test.each([
    ["(string)", "a=1; b=2"],
    ["(object)", { a: "1", b: "2" }],
    [
      "(pairs)",
      [
        ["a", "1"],
        ["b", "2"],
      ],
    ],
  ])("new (class extends Bun.CookieMap)%s returns an instance of the subclass", (_overload, init) => {
    const jar = new Jar(init as any);
    expect(Object.getPrototypeOf(jar)).toBe(Jar.prototype);
    expect(jar).toBeInstanceOf(Bun.CookieMap);
    expect(jar.names()).toEqual(["a", "b"]);
    jar.set("c", "3");
    expect(jar.toJSON()).toEqual({ a: "1", b: "2", c: "3" });
  });

  test("Reflect.construct takes the prototype from newTarget", () => {
    function NewTarget() {}
    const cookie = Reflect.construct(Bun.Cookie, ["id", "1"], NewTarget);
    expect(Object.getPrototypeOf(cookie)).toBe(NewTarget.prototype);
    expect(Bun.Cookie.prototype.serialize.call(cookie)).toStartWith("id=1;");

    const map = Reflect.construct(Bun.CookieMap, ["a=1"], NewTarget);
    expect(Object.getPrototypeOf(map)).toBe(NewTarget.prototype);
    expect(Bun.CookieMap.prototype.get.call(map, "a")).toBe("1");
  });

  test("the base constructors still return the base prototype", () => {
    expect(Object.getPrototypeOf(new Bun.Cookie("id", "1"))).toBe(Bun.Cookie.prototype);
    expect(Object.getPrototypeOf(new Bun.CookieMap("a=1"))).toBe(Bun.CookieMap.prototype);
  });
});

describe("invalid delete usage", () => {
  test("invalid usage does not crash", () => {
    expect(() => {
      const v1 = Bun.CookieMap;
      // @ts-ignore
      const v2 = new v1(v1, v1, Bun, v1);
      // @ts-ignore
      v2.delete(v2);
    }).toThrow("Cookie name is required");
  });
});

describe("Cookie.parse Max-Age (RFC 6265bis 5.6.2)", () => {
  test("only an optional '-' followed by digits is accepted", () => {
    expect(Bun.Cookie.parse("a=b; Max-Age=60").maxAge).toBe(60);
    expect(Bun.Cookie.parse("a=b; Max-Age=-5").maxAge).toBe(-5);
    expect(Bun.Cookie.parse("a=b; Max-Age=0").maxAge).toBe(0);
    for (const bad of ["3600abc", "+60", "1.5", "", "abc", "-", "6 0", "0x10"]) {
      expect(Bun.Cookie.parse(`a=b; Max-Age=${bad}`).maxAge).toBeUndefined();
    }
  });

  test("an invalid Max-Age leaves an earlier valid one in place", () => {
    expect(Bun.Cookie.parse("a=b; Max-Age=60; Max-Age=oops").maxAge).toBe(60);
    expect(Bun.Cookie.parse("a=b; Max-Age=60; Max-Age=90").maxAge).toBe(90);
  });

  test("values beyond int64 clamp instead of being dropped", () => {
    const huge = Bun.Cookie.parse("a=b; Max-Age=99999999999999999999999").maxAge!;
    expect(huge).toBeGreaterThan(9e18);
    expect(Bun.Cookie.parse("a=b; Max-Age=99999999999999999999999").isExpired()).toBe(false);
    expect(Bun.Cookie.parse("a=b; Max-Age=-99999999999999999999999").isExpired()).toBe(true);
  });
});

describe("Cookie domain is case-insensitive", () => {
  test("constructors store the domain lowercased", () => {
    expect(new Bun.Cookie("a", "b", { domain: "Example.COM" }).domain).toBe("example.com");
    expect(new Bun.Cookie({ name: "a", value: "b", domain: "SUB.Example.com" }).domain).toBe("sub.example.com");
    expect(Bun.Cookie.from("a", "b", { domain: "EXAMPLE.com" }).serialize()).toContain("Domain=example.com");
  });

  test("the domain setter lowercases and still validates", () => {
    const cookie = new Bun.Cookie("a", "b");
    cookie.domain = "Example.ORG";
    expect(cookie.domain).toBe("example.org");
    expect(() => {
      cookie.domain = "exa mple.com";
    }).toThrow("Invalid cookie domain");
  });

  test("CookieMap.set applies the same normalization", () => {
    const map = new Bun.CookieMap();
    map.set({ name: "a", value: "b", domain: "Example.COM" });
    expect(map.toSetCookieHeaders()[0]).toContain("Domain=example.com");
  });
});

describe("Cookie name prefixes (RFC 6265bis 4.1.3)", () => {
  test("prefix reports __Host- and __Secure- without regard to case", () => {
    expect(new Bun.Cookie("id", "1").prefix).toBeNull();
    expect(new Bun.Cookie("__Host-id", "1").prefix).toBe("__Host-");
    expect(new Bun.Cookie("__host-id", "1").prefix).toBe("__Host-");
    expect(new Bun.Cookie("__Secure-id", "1").prefix).toBe("__Secure-");
    expect(new Bun.Cookie("__SECURE-id", "1").prefix).toBe("__Secure-");
    expect(new Bun.Cookie("_Host-id", "1").prefix).toBeNull();
    expect(Bun.Cookie.parse("__Host-id=1; Secure; Path=/").prefix).toBe("__Host-");
  });

  test("hasValidPrefix checks the attribute requirements", () => {
    expect(new Bun.Cookie("id", "1").hasValidPrefix()).toBe(true);
    expect(new Bun.Cookie("__Secure-id", "1").hasValidPrefix()).toBe(false);
    expect(new Bun.Cookie("__Secure-id", "1", { secure: true }).hasValidPrefix()).toBe(true);
    expect(new Bun.Cookie("__Secure-id", "1", { secure: true, domain: "example.com" }).hasValidPrefix()).toBe(true);

    expect(new Bun.Cookie("__Host-id", "1").hasValidPrefix()).toBe(false);
    expect(new Bun.Cookie("__Host-id", "1", { secure: true }).hasValidPrefix()).toBe(true);
    expect(new Bun.Cookie("__Host-id", "1", { secure: true, path: "/app" }).hasValidPrefix()).toBe(false);
    expect(new Bun.Cookie("__Host-id", "1", { secure: true, domain: "example.com" }).hasValidPrefix()).toBe(false);
  });

  test("parse keeps the attributes, so hasValidPrefix reflects the header", () => {
    expect(Bun.Cookie.parse("__Host-id=1; Secure; Path=/; HttpOnly").hasValidPrefix()).toBe(true);
    expect(Bun.Cookie.parse("__Host-id=1; Path=/").hasValidPrefix()).toBe(false);
    expect(Bun.Cookie.parse("__Host-id=1; Secure; Path=/; Domain=example.com").hasValidPrefix()).toBe(false);
    expect(Bun.Cookie.parse("__Secure-id=1; Secure").hasValidPrefix()).toBe(true);
  });

  test("prefix is not an own property and does not appear in toJSON", () => {
    const cookie = new Bun.Cookie("__Host-id", "1", { secure: true });
    expect(Object.keys(cookie.toJSON())).not.toContain("prefix");
    expect(Object.hasOwn(cookie, "prefix")).toBe(false);
  });
});

describe("CookieMap.toCookieHeader", () => {
  test("is the inverse of the header constructor", () => {
    expect(new Bun.CookieMap("a=1; b=two").toCookieHeader()).toBe("a=1; b=two");
    expect(new Bun.CookieMap("a=b%20c; d=%E2%9C%93").toCookieHeader()).toBe("a=b%20c; d=%E2%9C%93");
    const map = new Bun.CookieMap({ q: "x y&z=1;w", plain: "ok" });
    const header = map.toCookieHeader();
    expect(header).toBe("q=x%20y%26z%3D1%3Bw; plain=ok");
    expect(new Bun.CookieMap(header).toJSON()).toEqual({ q: "x y&z=1;w", plain: "ok" });
  });

  test("is empty for an empty map", () => {
    expect(new Bun.CookieMap().toCookieHeader()).toBe("");
  });

  test("reflects set and delete", () => {
    const map = new Bun.CookieMap("a=1; b=2; c=3");
    map.set("d", "4");
    map.delete("b");
    map.set("a", "one");
    expect(map.toCookieHeader()).toBe("d=4; a=one; c=3");
    expect(map.size).toBe(3);
  });

  test("throws for a non-CookieMap receiver", () => {
    expect(() => Bun.CookieMap.prototype.toCookieHeader.call({})).toThrow();
  });
});

describe("CookieMap.fromSetCookie", () => {
  test("builds a map from Set-Cookie headers", () => {
    const map = Bun.CookieMap.fromSetCookie([
      "session=abc123; Path=/; Secure; HttpOnly; SameSite=Strict",
      "theme=dark; Max-Age=3600",
    ]);
    expect(map.toJSON()).toEqual({ session: "abc123", theme: "dark" });
    expect(map.get("session")).toBe("abc123");
    expect(map.size).toBe(2);
    expect(map.toCookieHeader()).toBe("session=abc123; theme=dark");
    expect(map.toSetCookieHeaders()).toEqual([
      "session=abc123; Path=/; Secure; HttpOnly; SameSite=Strict",
      "theme=dark; Path=/; Max-Age=3600; SameSite=Lax",
    ]);
  });

  test("accepts a single header and later headers replace earlier ones", () => {
    expect(Bun.CookieMap.fromSetCookie("a=1").toJSON()).toEqual({ a: "1" });
    expect(Bun.CookieMap.fromSetCookie(["a=1", "b=2", "a=3"]).toJSON()).toEqual({ b: "2", a: "3" });
    expect(Bun.CookieMap.fromSetCookie([]).size).toBe(0);
  });

  test("a header that expires the cookie removes it", () => {
    const map = Bun.CookieMap.fromSetCookie([
      "a=1; Path=/",
      "b=2",
      "a=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "b=gone; Max-Age=0",
    ]);
    expect(map.toJSON()).toEqual({});
    expect(map.has("a")).toBe(false);
    expect(map.toCookieHeader()).toBe("");
  });

  test("validates its argument", () => {
    // @ts-expect-error
    expect(() => Bun.CookieMap.fromSetCookie()).toThrow("Set-Cookie");
    // @ts-expect-error
    expect(() => Bun.CookieMap.fromSetCookie({})).toThrow("Set-Cookie");
    // @ts-expect-error
    expect(() => Bun.CookieMap.fromSetCookie([1])).toThrow("string");
    expect(() => Bun.CookieMap.fromSetCookie("novalue")).toThrow();
    expect(() => Bun.CookieMap.fromSetCookie("a=b\r\nInjected: 1")).toThrow();
  });

  test("works with a real Response", () => {
    const headers = new Headers();
    headers.append("Set-Cookie", "a=1; Path=/");
    headers.append("Set-Cookie", "b=2; Secure");
    const map = Bun.CookieMap.fromSetCookie(headers.getSetCookie());
    expect(map.toCookieHeader()).toBe("a=1; b=2");
  });
});
