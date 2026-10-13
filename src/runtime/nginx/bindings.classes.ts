import { define } from "../../codegen/class-definitions.ts";

export default [
  define({
    name: "NginxHandle",
    rustPath: "crate::nginx::bindings::NginxHandle",
    noConstructor: true,
    construct: false,
    finalize: true,
    configurable: false,
    JSType: "0b11101110",
    klass: {},
    proto: {},
  }),
];
