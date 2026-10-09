// SPDX-License-Identifier: Apache-2.0
type GraphRequest = import("bun:graph-native").GraphRequest;
type GraphResponse<R extends GraphRequest> = import("bun:graph-native").GraphResponse<R>;
const { randomUUID }: typeof import("node:crypto") = require("node:crypto");
const { Buffer }: typeof import("node:buffer") = require("node:buffer");
const JSONStringify = JSON.stringify;
const byteLength = Buffer.byteLength;
const NativeWorker = Worker;
const NativeBlob = Blob;
const NativeURL = URL;
const createObjectURL = URL.createObjectURL;
const revokeObjectURL = URL.revokeObjectURL;
const postMessage = Worker.prototype.postMessage;
const terminate = Worker.prototype.terminate;
const addEventListener = Worker.prototype.addEventListener;
const removeEventListener = Worker.prototype.removeEventListener;
const NativePromise = Promise;
const withResolvers = Promise.withResolvers;
const MAX_JSON_BYTES = 512 * 1024 * 1024;
const __nativeGraph = $newRustFunction("graph_native.rs", "jsGraphNative", 3) as (
  action: "start" | "cancel" | "release" | "execute",
  id: string,
  input: string,
) => boolean | string;
let addAbortListener: typeof import("node:events").addAbortListener;

const workerSource = `
import { __nativeGraph } from "bun:graph-native";
self.onmessage = ({ data: { id, input } }) => {
  try {
    self.postMessage({ value: JSON.parse(__nativeGraph("execute", id, input)) });
  } catch (error) {
    self.postMessage({ error });
  } finally {
    self.close();
  }
};
self.postMessage({ ready: true });
`;

async function executeGraph<R extends GraphRequest>(
  request: R,
  options: { signal?: AbortSignal } = {},
): Promise<GraphResponse<R>> {
  if (!$isObject(request) || $isJSArray(request)) throw $ERR_INVALID_ARG_TYPE("request", "object", request);
  if (!$isObject(options)) throw $ERR_INVALID_ARG_TYPE("options", "object", options);
  const signal = options.signal;
  if (signal !== undefined && !$isAbortSignal(signal))
    throw $ERR_INVALID_ARG_TYPE("options.signal", "AbortSignal", signal);
  if (signal?.aborted) throw signal.reason;
  const input = JSONStringify(request);
  if (typeof input !== "string") throw $ERR_INVALID_ARG_VALUE("request", request, "must encode as JSON");
  if (input.length > MAX_JSON_BYTES || byteLength(input, "utf8") > MAX_JSON_BYTES)
    throw $ERR_OUT_OF_RANGE("request JSON bytes", `<= ${MAX_JSON_BYTES}`, input.length);
  if (signal?.aborted) throw signal.reason;

  const id = randomUUID();
  const { promise, resolve, reject } = withResolvers.$call(NativePromise) as PromiseWithResolvers<GraphResponse<R>>;
  __nativeGraph("start", id, "");
  let worker: Worker | undefined;
  let url: string | undefined;
  let subscription: Disposable | undefined;
  let posted = false;
  let settled = false;
  let finished = false;

  function revoke() {
    const current = url;
    url = undefined;
    if (current !== undefined) revokeObjectURL.$call(NativeURL, current);
  }

  function fail(error: unknown) {
    if (settled) return;
    settled = true;
    reject(error);
  }

  function finish(error?: unknown, value?: GraphResponse<R>) {
    if (finished) return;
    finished = true;
    try {
      if (!settled) {
        if (error !== undefined) fail(error);
        else if (!$isObject(value)) fail(new Error("Native graph worker returned no result"));
        else {
          settled = true;
          resolve(value);
        }
      }
    } catch (error) {
      fail(error);
    } finally {
      subscription?.[Symbol.dispose]();
      subscription = undefined;
      revoke();
      __nativeGraph("release", id, "");
      if (worker !== undefined) {
        worker.onmessage = null;
        worker.onmessageerror = null;
        worker.onerror = null;
        removeEventListener.$call(worker, "close", closed);
        terminate.$call(worker);
        worker = undefined;
      }
    }
  }

  function abort() {
    if (finished) return;
    __nativeGraph("cancel", id, "");
    fail(signal!.reason);
    // Rust keeps the capacity slot until its cancellation check returns to the worker.
    if (!posted) finish(signal!.reason);
  }

  function message(event: MessageEvent<{ ready?: boolean; value?: GraphResponse<R>; error?: unknown }>) {
    if (finished) return;
    const reply = event.data;
    if (reply.ready === true) {
      revoke();
      if (signal?.aborted) {
        abort();
        return;
      }
      try {
        posted = true;
        postMessage.$call(worker!, { id, input });
      } catch (error) {
        finish(error);
      }
    } else finish(reply.error, reply.value);
  }

  function failed(event: ErrorEvent) {
    event.preventDefault();
    finish(event.error ?? new Error(event.message || "Native graph worker failed"));
  }

  function messageFailed() {
    finish(new Error("Native graph worker result could not be deserialized"));
  }

  function closed() {
    finish(new Error("Native graph worker closed before returning a result"));
  }

  try {
    if (signal !== undefined) {
      addAbortListener ??= require("internal/abort_listener").addAbortListener;
      subscription = addAbortListener(signal, abort);
      if (signal.aborted) abort();
    }
    if (!finished) {
      url = createObjectURL.$call(NativeURL, new NativeBlob([workerSource], { type: "text/javascript" }));
      worker = new NativeWorker(url, { name: "bun-graph-native" });
      worker.onmessage = message;
      worker.onmessageerror = messageFailed;
      worker.onerror = failed;
      addEventListener.$call(worker, "close", closed, { once: true });
    }
  } catch (error) {
    finish(error);
  }
  return await promise;
}

export default { executeGraph, __nativeGraph };
