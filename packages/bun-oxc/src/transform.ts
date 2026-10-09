// Drop-in for `oxc-transform`: same functions, options and results, backed by the addon of this package.

import type * as Transform from "../vendor/oxc-transform/index";
import { native } from "./native";

export type * from "../vendor/oxc-transform/index";

export const transformSync: typeof Transform.transformSync = (filename, sourceText, options) =>
  native().transformSync(filename, sourceText, options);

export const transform: typeof Transform.transform = (filename, sourceText, options) =>
  native().transform(filename, sourceText, options);

export const isolatedDeclarationSync: typeof Transform.isolatedDeclarationSync = (filename, sourceText, options) =>
  native().isolatedDeclarationSync(filename, sourceText, options);

export const isolatedDeclaration: typeof Transform.isolatedDeclaration = (filename, sourceText, options) =>
  native().isolatedDeclaration(filename, sourceText, options);

/** @deprecated Only works for Vite (as in `oxc-transform`). */
export const moduleRunnerTransformSync: typeof Transform.moduleRunnerTransformSync = (filename, sourceText, options) =>
  native().moduleRunnerTransformSync(filename, sourceText, options);

/** @deprecated Only works for Vite (as in `oxc-transform`). */
export const moduleRunnerTransform: typeof Transform.moduleRunnerTransform = (filename, sourceText, options) =>
  native().moduleRunnerTransform(filename, sourceText, options);
