import { define } from "../../codegen/class-definitions.ts";

export default [
  define({
    name: "BrowserRealm",
    rustPath: "crate::api::browser_realm::BrowserRealm",
    sharedThis: true,
    construct: true,
    noConstructor: true,
    finalize: true,
    configurable: false,
    JSType: "0b11101110",
    klass: {},
    proto: {
      evaluate: { fn: "evaluate", length: 3 },
      destroy: { fn: "destroy", length: 0 },
    },
  }),
];
