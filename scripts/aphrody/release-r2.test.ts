import { expect, test } from "bun:test";
import { contentType, parseSums, prune, versionOf, windowsManifest } from "./release-r2.ts";
import { tempDir } from "../../test/harness";
import { join } from "node:path";
import { mediaPublicationPlan, mintSDKUploadOptions, publishedSDKExists } from "./media-sdk-publish";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";

const sha = (c: string) => c.repeat(64);

test("SDK publication preserves existing keys only when their public bytes match", async () => {
  const bytes = new TextEncoder().encode("qualified fixture");
  const identity = { bytes: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") };
  using server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/missing") return new Response(null, { status: 404 });
      if (path === "/denied") return new Response(null, { status: 403 });
      return new Response(request.method === "HEAD" ? null : path === "/changed" ? "different bytes" : bytes);
    },
  });
  expect(await publishedSDKExists(new URL("/missing", server.url).href, identity)).toBe(false);
  expect(await publishedSDKExists(new URL("/matching", server.url).href, identity)).toBe(true);
  await expect(publishedSDKExists(new URL("/changed", server.url).href, identity)).rejects.toThrow(
    "SHA-256 or size mismatch",
  );
  await expect(publishedSDKExists(new URL("/denied", server.url).href, identity)).rejects.toThrow("HTTP 403");
});

test("SDK temporary R2 grants scope only the artifact and receipt and retain the session token", async () => {
  const account = "a".repeat(32);
  const requests: unknown[] = [];
  const client = {
    user: { tokens: { verify: async () => ({ id: "fixture-parent", status: "active" }) } },
    r2: {
      temporaryCredentials: {
        create: async (parameters: unknown) => {
          requests.push(parameters);
          return { accessKeyId: "fixture-access", secretAccessKey: "fixture-secret", sessionToken: "fixture-session" };
        },
      },
    },
  };
  const options = await mintSDKUploadOptions(client, account, "native/fixture-sdk.zip");
  expect(requests).toEqual([
    {
      account_id: account,
      bucket: "bun-lib",
      parentAccessKeyId: "fixture-parent",
      permission: "object-read-write",
      ttlSeconds: 900,
      objects: ["native/fixture-sdk.zip", "native/fixture-sdk.zip.receipt.json"],
    },
  ]);
  expect(options.sessionToken).toBe("fixture-session");
  expect(options.queueSize).toBe(1);
  expect(options.retry).toBe(0);
  expect(options.endpoint).toBe(`https://${account}.r2.cloudflarestorage.com`);
  await expect(mintSDKUploadOptions(client, account, "native/../unowned.zip")).rejects.toThrow("owned account");
  const incomplete = {
    ...client,
    r2: {
      temporaryCredentials: {
        create: async () => ({ accessKeyId: "fixture-access", secretAccessKey: "fixture-secret" }),
      },
    },
  };
  await expect(mintSDKUploadOptions(incomplete, account, "native/fixture-sdk.zip")).rejects.toThrow(
    "grant is incomplete",
  );
});

test("native SDK publication binds the archive, consumer evidence and Bun build ABI", async () => {
  using directory = tempDir("native-sdk-publication", { "consumer.log": "fixture-consumer-passed" });
  const license = "fixture license";
  const hash = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
  const receipt = {
    schema: 1,
    kind: "native-sdk",
    component: "fixture",
    version: "a".repeat(40),
    sourceRevision: "a".repeat(40),
    sourceRepository: "https://github.com/aphrody-labs/bun",
    target: "linux-x64",
    consumer: "aphrody-bun",
    source: { kind: "github-archive", repo: "aphrody-labs/bun", commit: "a".repeat(40) },
    sourceIdentity: sha("e"),
    sourceRoot: "source",
    buildABI: { os: "linux", arch: "x64", abi: "gnu", asan: true, lto: false, baseline: false, buildType: "Debug" },
    gate: {
      schema: 1,
      nativeLink: "passed",
      runtimeQualification: "native-tests-passed",
      configureSHA256: sha("b"),
      ninjaSHA256: sha("c"),
      sourceReceiptSHA256: sha("d"),
      evidence: ["fixture build gate"],
    },
    configureSHA256: sha("b"),
    ninjaSHA256: sha("c"),
    sourceReceiptSHA256: sha("d"),
    qualification: "native-tests-passed",
    includes: ["include/0"],
    libraries: ["lib/libfixture.a"],
    defines: ["FIXTURE_ASAN=1"],
    licenses: ["licenses/LICENSE"],
    files: {
      "licenses/LICENSE": hash(license),
      "include/0/fixture.h": hash("fixture header"),
      "lib/libfixture.a": hash("fixture library"),
    },
  };
  const identity = hash(JSON.stringify(receipt));
  const name = `fixture-linux-x64-${identity.slice(0, 16)}-sdk.zip`;
  const artifact = join(String(directory), name);
  await Bun.write(
    artifact,
    await new Bun.Archive(
      {
        "licenses/LICENSE": license,
        "include/0/fixture.h": "fixture header",
        "lib/libfixture.a": "fixture library",
        "bun-native-sdk.json": JSON.stringify(receipt),
      },
      { format: "zip" },
    ).blob(),
  );
  const distribution = {
    ...receipt,
    asset: {
      url: `https://bun-lib.aphrody.app/native/${name}`,
      sha256: await hashSDKFile(artifact),
      bytes: Bun.file(artifact).size,
      format: "zip",
    },
  };
  const distributionFile = join(String(directory), "distribution.json");
  const qualificationFile = join(String(directory), "qualification.json");
  const qualification = {
    schema: 1,
    component: "fixture",
    target: "linux-x64",
    artifactSha256: distribution.asset.sha256,
    status: "pass",
    checks: { libraryABI: true, nativeConsumer: true },
    evidence: [{ file: "consumer.log", sha256: hash("fixture-consumer-passed") }],
  };
  await Bun.write(distributionFile, JSON.stringify(distribution));
  await Bun.write(qualificationFile, JSON.stringify(qualification));
  const plan = await mediaPublicationPlan(distributionFile, qualificationFile);
  expect(plan.receipt.buildABI).toEqual(receipt.buildABI);
  expect(plan.receipt.includes).toEqual(receipt.includes);
  expect(plan.receipt.defines).toEqual(receipt.defines);
  expect(plan.receipt.source).toEqual(receipt.source);
  expect(plan.receipt.sourceIdentity).toBe(receipt.sourceIdentity);
  expect(plan.receipt.sourceRoot).toBe("source");
  expect(plan.receipt.nativeRuntimeABI).toBe("same-Bun-build-ABI-qualified");
  await Bun.write(qualificationFile, JSON.stringify({ ...qualification, checks: { libraryABI: true } }));
  await expect(mediaPublicationPlan(distributionFile, qualificationFile)).rejects.toThrow("consumer qualification");
  await Bun.write(qualificationFile, JSON.stringify(qualification));
  await Bun.write(join(String(directory), "consumer.log"), "changed evidence");
  await expect(mediaPublicationPlan(distributionFile, qualificationFile)).rejects.toThrow("evidence changed");
  await Bun.write(join(String(directory), "consumer.log"), "fixture-consumer-passed");
  await Bun.write(
    distributionFile,
    JSON.stringify({ ...distribution, buildABI: { ...receipt.buildABI, asan: false } }),
  );
  await expect(mediaPublicationPlan(distributionFile, qualificationFile)).rejects.toThrow("build ABI differs");
  await Bun.write(distributionFile, JSON.stringify({ ...distribution, sourceRoot: "legacy" }));
  await expect(mediaPublicationPlan(distributionFile, qualificationFile)).rejects.toThrow("exact Bun consumer");
  await Bun.write(distributionFile, JSON.stringify({ ...distribution, sourceIdentity: sha("f") }));
  await expect(mediaPublicationPlan(distributionFile, qualificationFile)).rejects.toThrow("build ABI differs");
});

test("parseSums reads sha256sum output and rejects anything else", () => {
  const sums = parseSums(`${sha("A")}  bun-linux-x64.zip\n${sha("b")} *bun-windows-x64.zip\n\n`);
  expect([...sums]).toEqual([
    ["bun-linux-x64.zip", sha("a")],
    ["bun-windows-x64.zip", sha("b")],
  ]);
  expect(() => parseSums(`${sha("a")}  ../escape.zip`)).toThrow("unexpected line");
  expect(() => parseSums(`${sha("a")}  x.zip\n${sha("b")}  x.zip`)).toThrow("listed twice");
});

test("windowsManifest points the product setup at the versioned archive", () => {
  const latest = {
    tag: "aphrody-v1.4.3-aphrody.4",
    version: versionOf("aphrody-v1.4.3-aphrody.4"),
    published: "2026-10-09T17:23:58Z",
    base: "https://dist.aphrody.app/bun/aphrody-v1.4.3-aphrody.4",
    assets: [{ name: "bun-windows-x64.zip", sha256: sha("c"), size: 1 }],
  };
  expect(windowsManifest(latest)).toMatchObject({
    version: "1.4.3-aphrody.4",
    path: "aphrody-v1.4.3-aphrody.4",
    archive: "bun-windows-x64.zip",
    sha256: sha("c"),
  });
  expect(windowsManifest({ ...latest, assets: [] })).toBeNull();
  expect(versionOf("bun-v1.4.4")).toBe("1.4.4");
});

test("prune keeps the current tag and the newest others", () => {
  const mirrored = [
    { tag: "a", uploaded: 1 },
    { tag: "b", uploaded: 2 },
    { tag: "c", uploaded: 3 },
    { tag: "d", uploaded: 4 },
  ];
  expect(prune(mirrored, "a", 2)).toEqual(["c", "b"]);
  expect(prune(mirrored, "d", 5)).toEqual([]);
  expect(contentType("bun.zip")).toBe("application/zip");
  expect(contentType("SHA256SUMS.txt")).toBe("text/plain; charset=utf-8");
});
