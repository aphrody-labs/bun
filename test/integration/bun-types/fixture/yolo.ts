import Yolo, {
  choice,
  code,
  confidenceThreshold,
  decide,
  inspect,
  noul,
  remote,
  score,
  selections,
  type Provider,
  type RemoteOptions,
} from "bun:yolo";
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
const selected = selections({ state: null, questions }, inspected, confidenceThreshold(0.7));
expectTypeOf(selected.route).toEqualTypeOf<"docs" | "graph" | "none" | null>();
// @ts-expect-error selections contains only Choice questions
selected.allowed;
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

const transportOptions: RemoteOptions = { client: sdk, model: "application-model" };
expectTypeOf(remote(transportOptions)).toEqualTypeOf<Provider>();
expectTypeOf(Yolo.remote).toEqualTypeOf<typeof remote>();
expectTypeOf(Yolo.ask).toEqualTypeOf<typeof import("bun:yolo").ask>();
if (result.allowed) {
  expectTypeOf(result.route).toEqualTypeOf<"docs" | "graph" | "none">();
} else {
  expectTypeOf(result.allowed).toEqualTypeOf<false>();
}
for (const allowed of [result.allowed, !result.allowed]) {
  expectTypeOf(allowed).toEqualTypeOf<boolean>();
}
let remaining = 2;
while (result.allowed && remaining > 0) remaining--;
const chooseAsync = async () => (result.allowed ? result.route : "none");
expectTypeOf(await chooseAsync()).toEqualTypeOf<"docs" | "graph" | "none">();
expectTypeOf(Boolean(result.allowed) && result.route === "docs").toEqualTypeOf<boolean>();
// @ts-expect-error provider transports must implement systemOne
remote({ client: {} });
// @ts-expect-error remote model identifiers are strings
remote({ model: 7 });
// @ts-expect-error Noul answers cannot be used as response objects
result.allowed.noul;
