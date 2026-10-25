import * as b from "../../../codegen/bindgen-lib.ts";

const js = { capability: "js", throws: true } as const;

export const FetchSession = b.class({
  rustPath: "crate::webcore::fetch::FetchSession",
  refCounted: true,
  finalize: true,
  estimatedSize: true,
  construct: { args: { init: b.any }, ...js, passStructure: true, length: 0 },
  internalFields: ["checkServerIdentity"],
  proto: {
    close: {},
    /** The recorded requests as HAR 1.2 JSON; throws when the session records none. */
    exportHAR: { returns: b.any.returning("string"), ...js, rustName: "export_har" },
    clearHAR: { rustName: "clear_har" },
    fetch: { getter: b.any.returning("object"), cache: true, passThis: true, ...js },
    "@@dispose": { rustName: "close" },
  },
});
