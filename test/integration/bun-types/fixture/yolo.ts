import Yolo, { choice, code, decide, inspect, noul, score, type Provider } from "bun:yolo";
import YoloAlias from "bun:Yolo";
import { expectTypeOf } from "bun:test";

const questions = {
  allowed: noul("May the user read these public docs?"),
  route: choice("Which read-only route fits?", { docs: "Documentation", graph: "Source graph", none: "No route" }),
  quality: score("What supporting evidence is present?", ["No evidence", "One passage", "Several passages"]),
};
const provider = code(() => ({ model: "rules", answers: {}, usage: null }));
const result = await decide({ state: { query: "Bun.Video" }, questions }, { provider });
expectTypeOf(result.allowed).toEqualTypeOf<boolean>();
expectTypeOf(result.route).toEqualTypeOf<"docs" | "graph" | "none">();
expectTypeOf(result.quality).toEqualTypeOf<number>();
expectTypeOf(await Yolo(null, questions.allowed, { provider })).toEqualTypeOf<boolean>();
expectTypeOf(YoloAlias).toEqualTypeOf<typeof Yolo>();
const inspected = await inspect({ state: null, questions }, { provider });
expectTypeOf(inspected.answers.route.choice).toEqualTypeOf<"docs" | "graph" | "none">();
// @ts-expect-error choice keys remain the declared enum
const unknown: "missing" = result.route;
// @ts-expect-error score requires at least two ordered criteria
score("Grade.", ["Only"]);
// @ts-expect-error noul produces a boolean, not a truthy answer object
const boxed: { noul: number } = result.allowed;

declare const client: {
  systemOne<Q extends import("bun:yolo").Questions>(
    request: import("bun:yolo").Request<Q>,
    options?: { signal?: AbortSignal; timeout?: number; retry?: { maxRetries?: number } },
  ): Promise<import("bun:yolo").Result<Q>>;
};
const sdk: Provider = client;
void [unknown, boxed, sdk];
