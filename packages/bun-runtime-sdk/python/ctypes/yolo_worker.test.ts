import { expect, test } from "bun:test";
import { applyYoloEnvelope, readYoloEnvelope, yoloErrorEnvelope } from "./yolo_worker";

const protocol = "bun.yolo/1";
test("stdio envelope delegates descriptors, providers and primitive conversion without Python policy", async () => {
  const calls: unknown[] = [];
  const api = {
    inspect: async (...args: unknown[]) => {
      calls.push(args);
      return { model: "fixture", answers: {}, usage: null };
    },
    decide: async (...args: unknown[]) => {
      calls.push(args);
      return { flag: false, route: "docs", score: 1.25 };
    },
    value: (...args: unknown[]) => {
      calls.push(args);
      return false;
    },
    jev: (options: unknown) => ({ systemOne: async () => options }),
    code: (evaluate: (...args: any[]) => unknown) => ({ systemOne: async (...args: any[]) => evaluate(...args) }),
  } as unknown as Parameters<typeof applyYoloEnvelope>[1];
  const request = {
    state: { public: false },
    questions: { flag: { type: "noul", instructions: null, criteria: { true: { nested: "entry" }, false: null } } },
  };
  expect(await applyYoloEnvelope({ protocol, operation: "decide", request, options: { threshold: 0.9 } }, api)).toEqual(
    { flag: false, route: "docs", score: 1.25 },
  );
  expect(calls[0]).toEqual([request, { threshold: 0.9 }]);
  expect(
    await applyYoloEnvelope(
      { protocol, operation: "value", answer: { type: "noul", noul: 0.5 }, question: request.questions.flag },
      api,
    ),
  ).toBe(false);
  expect(calls[1]).toEqual([{ type: "noul", noul: 0.5 }, request.questions.flag, undefined]);
  await expect(applyYoloEnvelope({ protocol: "other", operation: "decide" }, api)).rejects.toThrow("bridge operation");
});

test("private stdio is byte bounded and native diagnostics never reveal state or provider messages", async () => {
  const payload = { protocol, operation: "value" };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  expect(
    await readYoloEnvelope(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 4));
          controller.enqueue(bytes.subarray(4));
          controller.close();
        },
      }),
    ),
  ).toEqual(payload);
  await expect(
    readYoloEnvelope(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1048577));
          controller.close();
        },
      }),
    ),
  ).rejects.toThrow("byte budget");
  await expect(
    readYoloEnvelope(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([255]));
          controller.close();
        },
      }),
    ),
  ).rejects.toThrow();
  expect(
    yoloErrorEnvelope(Object.assign(new Error("fixture-private-state"), { code: "ERR_INVALID_ARG_VALUE" })),
  ).toEqual({ protocol, ok: false, error: { name: "Error", code: "ERR_INVALID_ARG_VALUE" } });
  expect(
    JSON.stringify(yoloErrorEnvelope({ name: "fixture-private-state", message: "fixture-key", code: "fixture-key" })),
  ).not.toContain("fixture-key");
});

test.skipIf(!process.env.BUN_YOLO_NATIVE_GATE)(
  "native Yolo owns all three primitives and rejects invalid provider answers",
  async () => {
    const request = {
      state: "synthetic fixture",
      questions: {
        flag: { type: "noul", instructions: "Is this a false fixture?" },
        route: { type: "choice", instructions: "Which source?", criteria: { docs: "Docs", graph: "Graph" } },
        amount: { type: "score", instructions: "Support?", criteria: ["None", "Some", "Complete"] },
      },
    };
    const response = {
      model: "fixture",
      answers: {
        flag: { type: "noul", noul: 0.5 },
        route: { type: "choice", choice: "docs", confidence: 0.9, probabilities: { docs: 0.9, graph: 0.1 } },
        amount: {
          type: "score",
          score: 1.25,
          confidence: 0.8,
          legend: { "0": "None", "1": "Some", "2": "Complete" },
          probabilities: { "0": 0.1, "1": 0.55, "2": 0.35 },
        },
      },
      usage: null,
    } as const;
    const envelope = { protocol, operation: "decide", request, provider: { kind: "code", response } };
    expect(await applyYoloEnvelope(envelope)).toEqual({ flag: false, route: "docs", amount: 1.25 });
    expect(await applyYoloEnvelope({ ...envelope, operation: "inspect" })).toEqual(response);
    await expect(
      applyYoloEnvelope({
        ...envelope,
        provider: {
          kind: "code",
          response: { ...response, answers: { ...response.answers, flag: { type: "noul", noul: 2 } } },
        },
      }),
    ).rejects.toThrow();
  },
);
