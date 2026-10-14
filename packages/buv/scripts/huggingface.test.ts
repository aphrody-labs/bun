// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  downloadFile,
  hfChildEnv,
  readToken,
  repoFolder,
  resolveHf,
  verifyDownload,
  type HfFetcher,
} from "./huggingface.ts";

let scratch = "";
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "buv-hf-"));
});
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

test("defaults follow huggingface_hub: HF_HOME, XDG, ~/.cache/huggingface", () => {
  expect(resolveHf({}, "/h").hubCache).toBe(resolve("/h", ".cache/huggingface/hub"));
  expect(resolveHf({ XDG_CACHE_HOME: "/x" }, "/h").home).toBe(join("/x", "huggingface"));
  expect(resolveHf({ HF_HOME: "/data/hf" }, "/h").hubCache).toBe(resolve("/data/hf", "hub"));
  expect(resolveHf({ HF_HUB_CACHE: "/c" }, "/h").hubCache).toBe(resolve("/c"));
  expect(resolveHf({ HF_ENDPOINT: "https://mirror.example/" }, "/h").endpoint).toBe("https://mirror.example");
});

test("token precedence and it is never in the report", () => {
  const home = join(scratch, "home");
  mkdirSync(join(home, ".cache/huggingface"), { recursive: true });
  writeFileSync(join(home, ".cache/huggingface/token"), "hf_file\n");
  expect(readToken({}, home)).toEqual({ value: "hf_file", source: "file" });
  expect(readToken({ HF_TOKEN: "hf_env" }, home)?.source).toBe("HF_TOKEN");
  const report = JSON.stringify(resolveHf({ HF_TOKEN: "hf_secret" }, home));
  expect(report).not.toContain("hf_secret");
  expect(JSON.parse(report).token).toEqual({ present: true, source: "HF_TOKEN" });
});

test("child environment pins cache and endpoint", () => {
  expect(hfChildEnv({ HF_HOME: "/d" }, "/h")).toEqual({
    HF_HOME: resolve("/d"),
    HF_HUB_CACHE: resolve("/d", "hub"),
    HF_ENDPOINT: "https://huggingface.co",
  });
});

test("repository ids are validated", () => {
  expect(repoFolder("org/name")).toBe("models--org--name");
  expect(() => repoFolder("../etc/passwd")).toThrow("invalid repository id");
});

const COMMIT = "a".repeat(40);
const fakeFetch = (calls: { url: string; auth: string | null }[]): HfFetcher =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    return new Response("weights", {
      headers: { "x-repo-commit": COMMIT, "x-linked-etag": '"deadbeef01"' },
    });
  }) as HfFetcher;

test("download writes the hub layout, sends the token, and a second call hits the cache", async () => {
  const env = { HF_HOME: join(scratch, "hf"), HF_TOKEN: "hf_secret" };
  const calls: { url: string; auth: string | null }[] = [];
  const first = await downloadFile("org/model", "dir/config.json", {
    env,
    fetcher: fakeFetch(calls),
  });
  expect(first.cached).toBe(false);
  expect(calls[0]?.url).toBe("https://huggingface.co/org/model/resolve/main/dir/config.json");
  expect(calls[0]?.auth).toBe("Bearer hf_secret");
  const folder = join(scratch, "hf/hub/models--org--model");
  expect(readFileSync(join(folder, "refs/main"), "utf8")).toBe(COMMIT);
  expect(readFileSync(join(folder, "blobs/deadbeef01"), "utf8")).toBe("weights");
  expect(lstatSync(first.path).isSymbolicLink()).toBe(true);
  expect(readlinkSync(first.path)).toBe(
    relative(join(folder, "snapshots", COMMIT, "dir"), join(folder, "blobs", "deadbeef01")),
  );
  expect(readFileSync(first.path, "utf8")).toBe("weights");
  const second = await downloadFile("org/model", "dir/config.json", {
    env,
    fetcher: fakeFetch(calls),
  });
  expect(second.cached).toBe(true);
  expect(calls.length).toBe(1);
});

test("offline mode refuses to fetch", async () => {
  const env = { HF_HOME: join(scratch, "hf"), HF_HUB_OFFLINE: "1" };
  await expect(downloadFile("org/model", "x", { env, fetcher: fakeFetch([]) })).rejects.toThrow("HF_HUB_OFFLINE");
});

const payload = new TextEncoder().encode("pinned public model");
const expected = { bytes: payload.byteLength, sha256: new Bun.CryptoHasher("sha256").update(payload).digest("hex") };
const publicEnv = () => ({ HF_HOME: join(scratch, "hf"), HF_TOKEN: "hf_not_to_send" });

function streamedFetch(body = payload, commit = COMMIT): HfFetcher {
  return (async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(body.subarray(0, 5));
          controller.enqueue(body.subarray(5));
          controller.close();
        },
      }),
      { headers: { "x-repo-commit": commit } },
    );
    response.arrayBuffer = () => {
      throw new Error("Buffering the whole file is forbidden");
    };
    return response;
  }) as HfFetcher;
}

test("pinned public acquisition streams, verifies complete bytes, and caches an exact commit", async () => {
  const env = publicEnv();
  const progress: number[] = [];
  let calls = 0;
  const base = streamedFetch();
  const fetcher = (async (url, init) => {
    calls++;
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    return base(url, init);
  }) as HfFetcher;
  const options = {
    revision: COMMIT,
    expected,
    publicOnly: true,
    env,
    fetcher,
    onProgress: (bytes: number) => progress.push(bytes),
  };
  const first = await downloadFile("org/model", "model.safetensors", options);
  expect(first.cached).toBe(false);
  expect(await verifyDownload(first.path, expected)).toBe(expected.sha256);
  expect(progress).toEqual([5, payload.byteLength]);
  const second = await downloadFile("org/model", "model.safetensors", options);
  expect(second.cached).toBe(true);
  expect(calls).toBe(1);
  expect(resolveHf(env, scratch, true).token).toEqual({ present: false, source: null });
});

test.each([
  { ...expected, bytes: expected.bytes + 1 },
  { ...expected, bytes: expected.bytes - 1 },
  { ...expected, sha256: "0".repeat(64) },
])("integrity failure never publishes a blob, snapshot or ref", async metadata => {
  await expect(
    downloadFile("org/model", "model.safetensors", {
      env: publicEnv(),
      revision: COMMIT,
      expected: metadata,
      publicOnly: true,
      fetcher: streamedFetch(),
    }),
  ).rejects.toThrow("Download");
  const folder = join(scratch, "hf/hub/models--org--model");
  expect(existsSync(join(folder, "blobs", metadata.sha256))).toBe(false);
  expect(existsSync(join(folder, "blobs", `${metadata.sha256}.incomplete`))).toBe(false);
  expect(existsSync(join(folder, "snapshots", COMMIT, "model.safetensors"))).toBe(false);
  expect(existsSync(join(folder, "refs", COMMIT))).toBe(false);
});

test("Git source bytes match their original Git blob identity before publication", async () => {
  const blob = new Bun.CryptoHasher("sha1").update(`blob ${payload.byteLength}\0`).update(payload).digest("hex");
  const result = await downloadFile("org/model", "joint_schema_model.py", {
    env: publicEnv(),
    revision: COMMIT,
    expected: { bytes: payload.byteLength, gitBlobSHA1: blob },
    publicOnly: true,
    fetcher: streamedFetch(),
  });
  expect(readFileSync(result.path)).toEqual(Buffer.from(payload));
  await expect(
    downloadFile("org/model", "other.py", {
      env: publicEnv(),
      revision: COMMIT,
      expected: { bytes: payload.byteLength, gitBlobSHA1: "0".repeat(40) },
      publicOnly: true,
      fetcher: streamedFetch(),
    }),
  ).rejects.toThrow("Git blob");
});

test("cached bytes are re-hashed and corruption fails before any fetch", async () => {
  const options = { env: publicEnv(), revision: COMMIT, expected, publicOnly: true, fetcher: streamedFetch() };
  const result = await downloadFile("org/model", "model.safetensors", options);
  writeFileSync(result.path, Buffer.alloc(payload.byteLength, 42));
  await expect(
    downloadFile("org/model", "model.safetensors", {
      ...options,
      fetcher: (async () => {
        throw new Error("Network must not run");
      }) as HfFetcher,
    }),
  ).rejects.toThrow("SHA256");
});

test("an existing verified blob is reused without another weight copy", async () => {
  const blob = join(scratch, "hf/hub/models--org--model/blobs", expected.sha256);
  mkdirSync(join(blob, ".."), { recursive: true });
  writeFileSync(blob, payload);
  const result = await downloadFile("org/model", "model.safetensors", {
    env: publicEnv(),
    revision: COMMIT,
    expected,
    publicOnly: true,
    fetcher: streamedFetch(),
  });
  expect(lstatSync(result.path).isSymbolicLink()).toBe(true);
  expect(await verifyDownload(result.path, expected)).toBe(expected.sha256);
  expect(existsSync(`${blob}.incomplete`)).toBe(false);
});

test("a concurrent partial transfer is preserved", async () => {
  const partial = join(scratch, "hf/hub/models--org--model/blobs", `${expected.sha256}.incomplete`);
  mkdirSync(join(partial, ".."), { recursive: true });
  writeFileSync(partial, "other transfer");
  await expect(
    downloadFile("org/model", "model.safetensors", {
      env: publicEnv(),
      revision: COMMIT,
      expected,
      publicOnly: true,
      fetcher: streamedFetch(),
    }),
  ).rejects.toThrow();
  expect(readFileSync(partial, "utf8")).toBe("other transfer");
});

test("foreign commits, unsafe paths and invalid bounds fail closed", async () => {
  const options = {
    env: publicEnv(),
    revision: COMMIT,
    expected,
    publicOnly: true,
    fetcher: streamedFetch(payload, "b".repeat(40)),
  };
  await expect(downloadFile("org/model", "model.safetensors", options)).rejects.toThrow("commit");
  for (const file of ["../outside", "/outside", "dir/../outside", "dir\\outside"]) {
    await expect(downloadFile("org/model", file, options)).rejects.toThrow("Invalid repository");
  }
  for (const bytes of [-1, 1.1, Infinity, NaN]) {
    await expect(downloadFile("org/model", "x", { ...options, expected: { ...expected, bytes } })).rejects.toThrow(
      "integrity",
    );
  }
  await expect(downloadFile("org/model", "x", { ...options, timeoutMs: 0 })).rejects.toThrow("timeout");
});
