import { define } from "../../codegen/class-definitions.ts";

export default [
  define({
    name: "FetchSession",
    construct: true,
    constructNeedsThis: true,
    finalize: true,
    estimatedSize: true,
    configurable: false,
    klass: {},
    JSType: "0b11101110",
    values: ["checkServerIdentity"],
    proto: {
      exportHAR: { fn: "export_har", length: 0 },
      clearHAR: { fn: "clear_har", length: 0 },
      fetch: {
        getter: "getFetch",
        cache: true,
        this: true,
      },
      close: {
        fn: "close",
        length: 0,
      },
      "@@dispose": {
        fn: "close",
        length: 0,
      },
    },
  }),
];
