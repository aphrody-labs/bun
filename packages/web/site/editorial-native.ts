import {
  APIPromise,
  type Questions,
  type RequestOptions,
  type SystemOneRequest,
  type SystemOneResult,
  type TypeSafeClient,
  type WithResponse,
} from "@aphrody/typesafe-sdk";
import { RAG_POLICY } from "./rag-policy";

/** Native CLI only: the protected SDK owns transport; Bun's Rust owner validates each typed response. */
export async function withNativeEditorialValidation(client: TypeSafeClient): Promise<TypeSafeClient> {
  const { inspect } = await import("bun:yolo");
  const nativeSystemOne: TypeSafeClient["systemOne"] = <const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: RequestOptions,
  ): APIPromise<SystemOneResult<Q>> => {
    // Clone the SDK's mutable JSON input once; do not cast Rust's readonly entry back into mutable SDK types.
    const immutableRequest = structuredClone(request);
    let transport: WithResponse<SystemOneResult<Q>> | undefined;
    const signal = options?.signal;
    const validation = inspect(immutableRequest, {
      provider: {
        async systemOne(_nativeRequest, nativeOptions) {
          transport = await client
            .systemOne(structuredClone(immutableRequest), {
              ...options,
              signal: nativeOptions?.signal ?? signal,
              retry: { ...options?.retry, maxRetries: 0 },
            })
            .withResponse();
          return transport.data;
        },
      },
      ...(signal ? { signal } : {}),
      timeout: RAG_POLICY.judgementTimeoutMilliseconds,
      maxRetries: 0,
    });
    return new APIPromise(
      validation.then(() => {
        if (!transport) throw Error("Native editorial validation has no transport response");
        return transport.response;
      }),
      async () => {
        if (!transport) throw Error("Native editorial validation has no transport data");
        return transport.data;
      },
    );
  };
  return new Proxy(client, {
    get(target, property) {
      if (property === "systemOne") return nativeSystemOne;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
