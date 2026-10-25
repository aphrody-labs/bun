import * as b from "../../codegen/bindgen-lib.ts";

export default b.module({ rustPath: "crate::cli::upgrade_command::upgrade_js_bindings" });

export const upgradeTestHelpers = b.namespace({
  openTempDirWithoutSharingDelete: { length: 1 },
  closeTempDirHandle: { length: 1 },
});

/** The release asset this build downloads, including its ABI and feature flavor suffixes. */
export const zipFilename = b.value({ returns: b.string });
