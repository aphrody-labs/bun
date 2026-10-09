// Drop-in for `oxc-minify`: same functions, options and results, backed by the addon of this package.

import type * as Minify from "../vendor/oxc-minify/index";
import { native } from "./native";

export type * from "../vendor/oxc-minify/index";

export const minifySync: typeof Minify.minifySync = (filename, sourceText, options) =>
  native().minifySync(filename, sourceText, options);

export const minify: typeof Minify.minify = (filename, sourceText, options) =>
  native().minify(filename, sourceText, options);
