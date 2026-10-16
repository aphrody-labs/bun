import { define } from "../../codegen/class-definitions.ts";
export default [
  define({
    name: "WebDetect",
    construct: true,
    finalize: true,
    klass: {
      detect: { fn: "detect", length: 1 },
      isForbiddenAddress: { fn: "isForbiddenAddress", length: 1 },
    },
    proto: {},
  }),
];
