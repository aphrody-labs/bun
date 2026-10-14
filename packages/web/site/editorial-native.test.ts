import { expect, test } from "bun:test";
import { APIPromise, noul, TypeSafeClient } from "@aphrody/typesafe-sdk";
import { withNativeEditorialValidation } from "./editorial-native";

function clientFixture() {
  const calls: Record<string, any>[] = [];
  const client = new TypeSafeClient({
    apiKey: "native-editorial-local-fixture",
    retry: { maxRetries: 0 },
    logLevel: "off",
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return Response.json({
        model: "Jev-fixture",
        answers: Object.fromEntries(Object.keys(body.questions).map(name => [name, { type: "noul", noul: 0.95 }])),
        usage: { input_tokens: 3, output_tokens: 1 },
      });
    },
  });
  return { client, calls };
}

test("native editorial transport retains structured Jev output through Rust validation without provider replacement", async () => {
  const fixture = clientFixture();
  const native = await withNativeEditorialValidation(fixture.client);
  const result = await native.systemOne({
    state: { passage: "Public docs fixture" },
    questions: { grounded: noul("Is the passage supported?") },
  });
  expect(result.model).toBe("Jev-fixture");
  expect(result.answers.grounded).toEqual({ type: "noul", noul: 0.95 });
  expect(result.usage).toEqual({ input_tokens: 3, output_tokens: 1 });
  expect(fixture.calls).toHaveLength(1);
  expect(Object.keys(fixture.calls[0]!.questions)).toEqual(["grounded"]);
});

test("Rust rejects malformed provider probabilities even if a borrowed SDK method supplies raw output", async () => {
  const fixture = clientFixture();
  Object.defineProperty(fixture.client, "systemOne", {
    configurable: true,
    value: () =>
      new APIPromise(Promise.resolve(Response.json({})), async () => ({
        model: "Jev-fixture",
        answers: { grounded: { type: "noul", noul: 1.4 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      })),
  });
  const native = await withNativeEditorialValidation(fixture.client);
  await expect(
    native.systemOne({ state: "fixture", questions: { grounded: noul("Supported?") } }).then(value => value),
  ).rejects.toThrow("Yolo noul must be finite and between 0 and 1");
  expect(fixture.calls).toHaveLength(0);
});

test("caller cancellation reaches the native owner before any provider call", async () => {
  const fixture = clientFixture(),
    native = await withNativeEditorialValidation(fixture.client);
  await expect(
    native
      .systemOne(
        { state: "fixture", questions: { grounded: noul("Supported?") } },
        { signal: AbortSignal.abort(Error("cancel native editorial")) },
      )
      .then(value => value),
  ).rejects.toThrow();
  expect(fixture.calls).toHaveLength(0);
});
