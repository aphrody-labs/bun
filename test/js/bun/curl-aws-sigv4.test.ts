import { describe, expect, test } from "bun:test";
import { authenticate, type AuthenticationInput } from "../../packages/s3-server/src/signature";

const credential = {
  accessKeyId: "fixture-access",
  secretAccessKey: "fixture-secret",
  sessionToken: "fixture-session",
  owner: { id: "a".repeat(64), displayName: "fixture" },
};

test("Curl AWS signing qualification requires the native provider when requested", () => {
  if (Bun.env.BUN_TEST_REQUIRE_CURL === "1") expect(Bun.Curl?.available).toBe(true);
});

describe.skipIf(!Bun.Curl?.available)("native Curl AWS SigV4", () => {
  test("binary bodies snapshot view offsets before later getters and worker handoff", async () => {
    const observed: number[][] = [];
    using server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        observed.push([...new Uint8Array(await request.arrayBuffer())]);
        return new Response("ok");
      },
    });
    let bodyReads = 0,
      headerReads = 0,
      signalReads = 0;
    const storage = new Uint8Array([99, 0, 255, 128, 1, 99]);
    const signal = new AbortController().signal;
    const result = await Bun.Curl.request(server.url.href, {
      method: "PUT",
      get body() {
        bodyReads++;
        return storage.subarray(1, 5);
      },
      get headers() {
        headerReads++;
        storage.fill(42);
        Bun.gc(true);
        return [];
      },
      get signal() {
        signalReads++;
        return signal;
      },
      timeout: 5000,
      maxBytes: 4096,
    });
    expect(result.status).toBe(200);
    expect(observed).toEqual([[0, 255, 128, 1]]);
    expect([bodyReads, headerReads, signalReads]).toEqual([1, 1, 1]);
    for (const body of [
      new Uint8Array([0, 255]).buffer,
      new DataView(new Uint8Array([33, 0, 254, 44]).buffer, 1, 2),
      new Uint8Array(),
    ]) {
      expect(
        (await Bun.Curl.request(server.url.href, { method: "PUT", body, timeout: 5000, maxBytes: 4096 })).status,
      ).toBe(200);
    }
    expect(observed.slice(1)).toEqual([[0, 255], [0, 254], []]);
    const detached = new ArrayBuffer(2);
    structuredClone(detached, { transfer: [detached] });
    expect(() => Bun.Curl.request(server.url.href, { method: "PUT", body: detached })).toThrow();
  });
  test("signs metadata, checksum, temporary credentials and conditional copies using the existing native signer", async () => {
    const verified: { method: string; headers: Headers; body: string }[] = [];
    const failures: unknown[] = [];
    using server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        try {
          const url = new URL(request.url);
          const input: AuthenticationInput = {
            method: request.method,
            path: url.pathname,
            query: [],
            headers: request.headers,
            now: new Date(),
            region: "auto",
            findCredential(key) {
              return key === credential.accessKeyId ? credential : undefined;
            },
          };
          const authentication = authenticate(input);
          expect(authentication.type).toBe("header");
          if (authentication.type !== "header") throw Error("Unsigned request");
          expect(authentication.signedHeaders).toContain("x-amz-security-token");
          expect(request.headers.get("x-amz-security-token")).toBe(credential.sessionToken);
          const body = await request.text();
          if (!request.headers.has("x-amz-copy-source") && request.method === "PUT") {
            const sha256 = new Bun.CryptoHasher("sha256").update(body).digest("hex");
            expect(request.headers.get("x-amz-meta-sha256")).toBe(sha256);
            expect(request.headers.get("x-amz-checksum-sha256")).toBe(Buffer.from(sha256, "hex").toString("base64"));
            expect(authentication.signedHeaders).toContain("x-amz-meta-sha256");
            expect(authentication.signedHeaders).toContain("x-amz-checksum-sha256");
            expect(authentication.signedHeaders).toContain("cache-control");
            const tampered = new Headers(request.headers);
            tampered.set("x-amz-meta-sha256", "0".repeat(64));
            expect(() => authenticate({ ...input, headers: tampered })).toThrow();
          }
          verified.push({ method: request.method, headers: new Headers(request.headers), body });
          return new Response(
            request.method === "HEAD" ? null : "<CopyObjectResult><ETag>fixture</ETag></CopyObjectResult>",
            { headers: { "x-amz-meta-sha256": "a".repeat(64), "content-type": "application/xml" } },
          );
        } catch (error) {
          failures.push(error);
          return new Response("fixture verification failed", { status: 403 });
        }
      },
    });
    const options = {
      AWS_SIGV4: "aws:amz:auto:s3",
      USERPWD: credential.accessKeyId + ":" + credential.secretAccessKey,
    };
    const body = "public JSON 日本語 \u0000 fixture",
      sha256 = new Bun.CryptoHasher("sha256").update(body).digest("hex");
    const upload = await Bun.Curl.request(server.url + "bucket/_objects/fixture", {
      method: "PUT",
      body,
      options,
      maxBytes: 4096,
      timeout: 5000,
      headers: [
        "x-amz-security-token: " + credential.sessionToken,
        "x-amz-meta-sha256: " + sha256,
        "x-amz-checksum-sha256: " + Buffer.from(sha256, "hex").toString("base64"),
        "Content-Type: application/json",
        "Cache-Control: public, max-age=31536000, immutable",
      ],
    });
    expect(failures).toEqual([]);
    expect(upload.status).toBe(200);
    const copy = await Bun.Curl.request(server.url + "bucket/_objects/fixture", {
      method: "PUT",
      options,
      maxBytes: 4096,
      timeout: 5000,
      headers: [
        "x-amz-security-token: " + credential.sessionToken,
        "x-amz-copy-source: /bucket/_objects/fixture",
        "x-amz-copy-source-if-match: fixture",
        "cf-copy-destination-if-match: fixture",
        "x-amz-metadata-directive: MERGE",
        "x-amz-meta-sha256: " + sha256,
        "Content-Type: application/json",
        "Cache-Control: public, max-age=31536000, immutable",
      ],
    });
    expect(failures).toEqual([]);
    expect(copy.status).toBe(200);
    const head = await Bun.Curl.request(server.url + "bucket/_objects/fixture", {
      method: "HEAD",
      options,
      maxBytes: 4096,
      timeout: 5000,
      headers: ["x-amz-security-token: " + credential.sessionToken],
    });
    expect(failures).toEqual([]);
    expect(head.status).toBe(200);
    expect(verified.map(row => row.method)).toEqual(["PUT", "PUT", "HEAD"]);
    expect(verified[0]!.body).toBe(body);
    expect(verified[1]!.headers.get("x-amz-copy-source-if-match")).toBe("fixture");
    expect(verified[1]!.headers.get("cf-copy-destination-if-match")).toBe("fixture");
    expect(verified[1]!.headers.get("x-amz-metadata-directive")).toBe("MERGE");
    expect(head.headers.toLowerCase()).toContain("x-amz-meta-sha256:");
  });
});
