import { define } from "../../codegen/class-definitions.ts";
export default [
  define({
    name: "Curl",
    construct: true,
    finalize: true,
    klass: {
      available: { getter: "getAvailable" },
      capabilities: { fn: "capabilities", length: 0 },
      request: { fn: "request", length: 2, async: true },
      run: { builtin: "curlRunCodeGenerator", length: 2 },
    },
    proto: {},
  }),
];
