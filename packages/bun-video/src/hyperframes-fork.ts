import { createRequire } from "node:module";

const requireFork = createRequire(import.meta.url);

/** HyperFrames primitives loaded from the vendored fork shipped with Bun Video. */
export const loadHyperframesCore = async () => requireFork("../hyperframes/packages/core/src/index");
export const loadHyperframesEngine = async () => requireFork("../hyperframes/packages/engine/src/index");
export const { generateSpringEaseData, SPRING_PRESETS } = requireFork("../hyperframes/packages/parsers/src/gsapParser");
