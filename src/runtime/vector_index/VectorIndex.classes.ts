import { define } from "../../codegen/class-definitions.ts";

export default [
  define({
    name: "VectorIndex",
    construct: true,
    finalize: true,
    klass: { available: { getter: "getAvailable" } },
    proto: {
      add: { fn: "add", length: 2 },
      search: { fn: "search", length: 2 },
      remove: { fn: "remove", length: 1 },
      save: { fn: "save", length: 0 },
      close: { fn: "close", length: 0 },
      count: { getter: "getCount" },
      dimensions: { getter: "getDimensions" },
    },
  }),
];
