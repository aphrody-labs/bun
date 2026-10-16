import { define } from "../../codegen/class-definitions.ts";

export default [define({
  name: "Video",
  construct: true,
  constructNeedsThis: true,
  finalize: true,
  values: ["image"],
  configurable: false,
  JSType: "0b11101110",
  klass: { available: { getter: "getAvailable" } },
  proto: {
    frame: { fn: "doFrame", length: 1 },
    resize: { fn: "doResize", length: 2 },
    png: { fn: "doPng", length: 0 },
    jpeg: { fn: "doJpeg", length: 1 },
    webp: { fn: "doWebp", length: 1 },
    bytes: { fn: "doBytes", length: 0, async: true },
    blob: { fn: "doBlob", length: 0, async: true },
    metadata: { fn: "doMetadata", length: 0, async: true },
    width: { getter: "getWidth" },
    height: { getter: "getHeight" },
  },
})];
