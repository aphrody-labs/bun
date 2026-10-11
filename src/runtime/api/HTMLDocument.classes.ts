import { define } from "../../codegen/class-definitions.ts";

export default [
  define({
    name: "HTMLDocument",
    rustPath: "crate::api::html_object::HTMLDocument",
    sharedThis: true,
    construct: true,
    noConstructor: true,
    finalize: true,
    configurable: false,
    JSType: "0b11101110",
    klass: {},
    proto: {
      select: { fn: "select", length: 1 },
      html: { fn: "html", length: 1 },
      text: { fn: "text", length: 1 },
      attribute: { fn: "attribute", length: 2 },
      setAttribute: { fn: "set_attribute", length: 3 },
    },
  }),
];
