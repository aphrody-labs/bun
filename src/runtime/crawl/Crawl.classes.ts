import { define } from "../../codegen/class-definitions.ts";
export default [
  define({
    name: "Crawl",
    construct: true,
    finalize: true,
    klass: { available: { getter: "getAvailable" }, run: { fn: "run", length: 1, async: true } },
    proto: {},
  }),
];
