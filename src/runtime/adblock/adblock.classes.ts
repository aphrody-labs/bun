import { define } from "../../codegen/class-definitions.ts";

export default [
  define({
    name: "AdblockEngine",
    rustPath: "crate::adblock::AdblockEngine",
    construct: true,
    finalize: true,
    configurable: false,
    JSType: "0b11101110",
    klass: {
      deserialize: { fn: "deserialize", length: 1 },
    },
    proto: {
      check: { fn: "check", length: 3 },
      urlCosmeticResources: { fn: "urlCosmeticResources", length: 1 },
      hiddenClassIdSelectors: { fn: "hiddenClassIdSelectors", length: 3 },
      serialize: { fn: "serialize", length: 0 },
    },
  }),
];
