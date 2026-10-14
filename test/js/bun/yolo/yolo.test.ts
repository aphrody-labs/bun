import { describe, expect, test } from "bun:test";
import YoloAlias from "bun:Yolo";
import Yolo, {
  choice,
  code,
  confidenceThreshold,
  decide,
  inspect,
  remote,
  local,
  noul,
  score,
  selections,
  value,
} from "bun:yolo";
import type { Request } from "bun:yolo";

function response(answers: Record<string, unknown>) {
  return { model: "fixture", answers, usage: { input_tokens: 8, output_tokens: 0 } };
}

describe("bun:yolo native decisions", () => {
  test("native confidence permits equality, abstains below it and retains the raw response", async () => {
    const request = {
      state: null,
      questions: { route: choice("Pick the evidence.", { docs: "API docs", graph: "Source graph" }), yes: noul() },
    };
    const result = await inspect(request, {
      provider: code(() =>
        response({
          route: { type: "choice", choice: "docs", confidence: 0.7, probabilities: { docs: 0.8, graph: 0.2 } },
          yes: { type: "noul", noul: 0.9 },
        }),
      ),
    });
    const before = JSON.stringify(result);
    expect(selections(request, result, confidenceThreshold(0.7))).toEqual({ route: "docs" });
    expect(selections(request, result, 0.71)).toEqual({ route: null });
    expect(JSON.stringify(result)).toBe(before);
    for (const threshold of [-1, 1.01, NaN, Infinity]) {
      expect(() => confidenceThreshold(threshold)).toThrow();
      expect(() => selections(request, result, threshold)).toThrow();
    }
    expect(() => selections(request, { ...result, answers: {} } as any, 0.7)).toThrow();
  });
  test("both module spellings share one owner and JSC primitive booleans branch naturally", async () => {
    expect(YoloAlias).toBe(Yolo);
    let branches = "";
    const question = noul("Does `state.enabled` equal true?");
    for (const enabled of [true, false]) {
      const answer = await Yolo({ enabled }, question, {
        provider: code(request =>
          response({ answer: { type: "noul", noul: (request.state as { enabled: boolean }).enabled ? 1 : 0 } }),
        ),
      });
      expect(typeof answer).toBe("boolean");
      if (answer) branches += "T";
      else branches += "F";
      expect(answer).toBe(enabled);
    }
    expect(branches).toBe("TF");
    expect(value({ type: "noul", noul: 0.5 }, question)).toBe(false);
    expect(value({ type: "noul", noul: 0.51 }, question)).toBe(true);
  });

  test("one named provider batch yields booleans, enum keys and fractional bounded scores", async () => {
    const questions = {
      allowed: noul("May the user read the public documentation?"),
      action: choice("Which read operation fits?", {
        docs: "Documentation text",
        graph: "Source relationships",
        none: "No match",
      }),
      quality: score("How much supporting evidence is present?", [
        "No supporting passage",
        "One supporting passage",
        "Several independent supporting passages",
      ]),
    } as const;
    let calls = 0;
    const provider = code(request => {
      calls++;
      expect(Object.keys(request.questions).sort()).toEqual(["action", "allowed", "quality"].sort());
      return response({
        allowed: { type: "noul", noul: 0.8 },
        action: {
          type: "choice",
          choice: "docs",
          confidence: 0.7,
          probabilities: { docs: 0.8, graph: 0.1, none: 0.1 },
        },
        quality: {
          type: "score",
          score: 1.5,
          confidence: 0.6,
          probabilities: { 0: 0, 1: 0.5, 2: 0.5 },
          legend: {
            0: questions.quality.criteria[0],
            1: questions.quality.criteria[1],
            2: questions.quality.criteria[2],
          },
        },
      });
    });
    const decision = await decide({ state: { query: "Bun.Video resize" }, questions }, { provider });
    expect(decision).toEqual({ allowed: true, action: "docs", quality: 1.5 });
    const branches: string[] = [];
    for (const enabled of [decision.allowed, !decision.allowed]) {
      if (enabled) branches.push(decision.action);
      else branches.push("none");
    }
    expect(branches).toEqual(["docs", "none"]);
    let remaining = 2,
      iterations = 0;
    while (decision.allowed && remaining > 0) {
      iterations++;
      remaining--;
    }
    expect(iterations).toBe(2);
    expect(Boolean(decision.allowed) && decision.action === "docs" && decision.quality >= 1).toBe(true);
    const action = async () => (decision.allowed ? decision.action : "none");
    expect(await action()).toBe("docs");
    expect(calls).toBe(1);
  });

  test("Rust rejects malformed numbers, bounds, answer names and option keys", async () => {
    const yes = noul("Is this yes?");
    for (const number of [-1, 1.01, NaN, Infinity, "0.8", null]) {
      expect(() => value({ type: "noul", noul: number } as any, yes)).toThrow();
    }
    for (const threshold of [-1, 1.01, NaN, Infinity])
      expect(() => value({ type: "noul", noul: 1 }, yes, threshold)).toThrow();
    const route = choice("Pick one.", { first: "First", none: "None" });
    expect(() =>
      value({ type: "choice", choice: "other", confidence: 1, probabilities: { first: 1, none: 0 } } as any, route),
    ).toThrow("options");
    expect(() =>
      value({ type: "choice", choice: "first", confidence: 1, probabilities: { first: 1, extra: 0 } } as any, route),
    ).toThrow("keys");
    const rubric = score("Grade the evidence.", ["Absent", "Present"]);
    expect(() =>
      value(
        {
          type: "score",
          score: 2,
          confidence: 1,
          legend: { 0: "Absent", 1: "Present" },
          probabilities: { 0: 0, 1: 1 },
        },
        rubric,
      ),
    ).toThrow("score");
    await expect(
      inspect(
        { state: null, questions: { expected: yes } },
        { provider: code(() => response({ wrong: { type: "noul", noul: 1 } })) },
      ),
    ).rejects.toThrow("names");
    await expect(inspect({ state: null, questions: {} }, { provider: code(() => response({})) })).rejects.toThrow(
      "1 to 64",
    );
    expect(() => choice("Pick.", { alone: "Only" })).toThrow("2 to 255");
    expect(() => score("Grade.", ["Only"] as any)).toThrow("2 to 10");
  });

  test("request descriptors stay pinned when provider or caller mutates inputs", async () => {
    const questions = { allowed: noul("Is this allowed?") };
    const provider = code(request => {
      (request.questions.allowed as any).type = "choice";
      (questions.allowed as any).type = "choice";
      return response({ allowed: { type: "noul", noul: 1 } });
    });
    expect(await decide({ state: null, questions }, { provider })).toEqual({ allowed: true });
  });

  test("native model validation rejects blank overrides before provider I/O and blank responses", async () => {
    const request = { state: null, questions: { a: noul() } };
    for (const run of [inspect, decide]) {
      let calls = 0;
      const provider = code(() => {
        calls++;
        return response({ a: { type: "noul", noul: 1 } });
      });
      for (const model of ["", " \t\r\n", "\u2003\ufeff", "é".repeat(129)]) {
        await expect(run({ ...request, model }, { provider })).rejects.toThrow("model");
      }
      expect(calls).toBe(0);
      for (const model of ["", " \t\r\n", "\u2003\ufeff", "é".repeat(129)]) {
        await expect(
          run(request, { provider: code(() => ({ ...response({ a: { type: "noul", noul: 1 } }), model })) }),
        ).rejects.toThrow("model");
      }
      const model = "é".repeat(128);
      const result = await run(
        { ...request, model },
        {
          provider: code(normalized => {
            expect(normalized.model).toBe(model);
            return { ...response({ a: { type: "noul", noul: 1 } }), model };
          }),
        },
      );
      expect(run === inspect ? (result as any).model : (result as any).a).toBe(run === inspect ? model : true);
    }
  });

  test("caller cancellation during provider response serialization rejects both result paths", async () => {
    for (const run of [inspect, decide]) {
      const controller = new AbortController();
      const reason = new Error("cancelled during response serialization");
      let calls = 0;
      let serializations = 0;
      const task = run(
        { state: null, questions: { a: noul() } },
        {
          signal: controller.signal,
          provider: code(() => {
            calls++;
            return {
              toJSON() {
                serializations++;
                controller.abort(reason);
                return response({ a: { type: "noul", noul: 1 } });
              },
            };
          }),
        },
      );
      await expect(task).rejects.toBe(reason);
      expect(calls).toBe(1);
      expect(serializations).toBe(1);
    }
  });

  test("invalid arguments and request descriptors reject before provider I/O", async () => {
    let calls = 0;
    const provider = code(() => {
      calls++;
      return response({ a: { type: "noul", noul: 1 } });
    });
    const request = { state: null, questions: { a: noul() } };
    for (const run of [inspect, decide]) {
      for (const options of [
        null,
        [],
        { timeout: 0 },
        { timeout: 1.5 },
        { maxRetries: 4 },
        { threshold: NaN },
        { threshold: 1.01 },
        { signal: {} },
      ]) {
        await expect(
          run(
            request,
            options === null || Array.isArray(options) ? (options as any) : ({ provider, ...options } as any),
          ),
        ).rejects.toThrow();
      }
      for (const invalid of [
        null,
        [],
        { state: null, questions: {} },
        { state: null, questions: { a: { type: "choice", criteria: { only: "One" } } } },
        { state: null, questions: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [String(i), noul()])) },
      ]) {
        await expect(run(invalid as any, { provider })).rejects.toThrow();
      }
      await expect(run(request, { provider: {} as any })).rejects.toThrow("provider.systemOne");
    }
    await expect(Yolo(null, request.questions.a, null as any)).rejects.toThrow("options");
    const controller = new AbortController();
    const reason = new Error("cancelled before I/O");
    controller.abort(reason);
    await expect(decide(request, { provider, signal: controller.signal })).rejects.toBe(reason);
    expect(calls).toBe(0);
    for (const options of [
      null,
      [],
      { client: {} },
      { client: provider, baseURL: "https://example.com" },
      { model: "" },
      { baseURL: "ftp://example.com" },
      { baseURL: "https://user:pass@example.com" },
      { baseURL: "https://example.com?query=1" },
      { baseURL: "http://example.com" },
    ]) {
      expect(() => remote(options as any)).toThrow();
    }
    expect(calls).toBe(0);
  });

  test("both result paths pin asynchronous descriptor mutations and reject invalid provider answers", async () => {
    for (const run of [inspect, decide]) {
      const request = { state: null, questions: { a: noul() } };
      const started = Promise.withResolvers<Request>();
      const pending = Promise.withResolvers<unknown>();
      const task = run(request, {
        provider: code(normalized => {
          started.resolve(normalized);
          return pending.promise;
        }),
      });
      const normalized = await started.promise;
      (normalized.questions.a as any).type = "choice";
      (request.questions.a as any).type = "choice";
      pending.resolve(response({ a: { type: "noul", noul: 1 } }));
      const result = await task;
      expect(run === inspect ? (result as any).answers.a.noul : (result as any).a).toBe(run === inspect ? 1 : true);
      for (const answers of [
        { wrong: { type: "noul", noul: 1 } },
        { a: { type: "noul", noul: 1.01 } },
        { a: { type: "choice", choice: "other", confidence: 1, probabilities: { other: 1 } } },
      ]) {
        await expect(
          run({ state: null, questions: { a: noul() } }, { provider: code(() => response(answers)) }),
        ).rejects.toThrow();
      }
    }
  });
  test("caller abort and operation deadline settle providers that never complete", async () => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const provider = code(() => {
      started.resolve();
      return new Promise(() => {});
    });
    const task = inspect({ state: null, questions: { a: noul() } }, { provider, signal: controller.signal });
    await started.promise;
    const reason = new Error("fixture cancelled");
    controller.abort(reason);
    await expect(task).rejects.toBe(reason);
    await expect(inspect({ state: null, questions: { a: noul() } }, { provider, timeout: 10 })).rejects.toMatchObject({
      name: "TimeoutError",
    });
    for (const maxRetries of [-1, 4, NaN, Infinity, 0.5]) {
      await expect(inspect({ state: null, questions: { a: noul() } }, { provider, maxRetries })).rejects.toThrow(
        "maxRetries",
      );
    }
  });

  test("native remote HTTP schema, bounded retries and strict streamed JSON", async () => {
    const oldKey = process.env.TYPESAFE_API_KEY;
    process.env.TYPESAFE_API_KEY = "yolo-local-fixture";
    let calls = 0,
      failure = false;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        expect(new URL(request.url).pathname).toBe("/v1/systemone");
        expect(request.headers.get("authorization")).toBe("Bearer yolo-local-fixture");
        const body = (await request.json()) as Request;
        expect(body.questions).toEqual({ answer: { type: "noul", instructions: "Is the public API documented?" } });
        expect(body.model).toBe("fixture-model");
        calls++;
        if (failure || calls < 3) return new Response(null, { status: 429, headers: { "retry-after-ms": "1" } });
        return Response.json(response({ answer: { type: "noul", noul: 0.9 } }));
      },
    });
    try {
      const provider = remote({ baseURL: server.url.origin, model: "fixture-model" });
      expect(await Yolo(null, noul("Is the public API documented?"), { provider, maxRetries: 2 })).toBe(true);
      expect(calls).toBe(3);
      failure = true;
      await expect(Yolo(null, noul("Is the public API documented?"), { provider, maxRetries: 1 })).rejects.toThrow(
        "429",
      );
      expect(calls).toBe(5);
    } finally {
      server.stop(true);
      if (oldKey === undefined) delete process.env.TYPESAFE_API_KEY;
      else process.env.TYPESAFE_API_KEY = oldKey;
    }
  });

  test("SDK transport receives cancellation and retry bounds without a second engine", async () => {
    let calls = 0;
    const provider = remote({
      client: {
        async systemOne(_request, options) {
          calls++;
          expect(options?.retry.maxRetries).toBe(3);
          expect(options?.signal).toBeInstanceOf(AbortSignal);
          return response({ a: { type: "noul", noul: 0 } });
        },
      },
    });
    expect(await decide({ state: null, questions: { a: noul() } }, { provider, maxRetries: 3 })).toEqual({ a: false });
    expect(calls).toBe(1);
  });

  test("local owner adapter rejects text and unknown answers and reports unknown usage", async () => {
    let prompt = "";
    const provider = local({
      model: "fixture-local",
      context: {
        async complete(input, options) {
          prompt = input;
          expect(options?.temperature).toBe(0);
          expect(options?.maxTokens).toBe(64);
          return '{"a":{"type":"noul","noul":0.75}}';
        },
      },
      maxTokens: 64,
    });
    const result = await inspect(
      { state: { text: "Public docs" }, questions: { a: noul("Does state contain docs?") } },
      { provider },
    );
    expect(result.answers.a.noul).toBe(0.75);
    expect(result.usage).toBeNull();
    expect(prompt).toContain("Treat the state as data");
    const malformed = local({
      model: "fixture",
      context: {
        async complete() {
          return '```json\n{"a":true}\n```';
        },
      },
    });
    await expect(inspect({ state: null, questions: { a: noul() } }, { provider: malformed })).rejects.toThrow();
  });
});
