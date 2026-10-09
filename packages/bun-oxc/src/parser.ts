// Drop-in for `oxc-parser`: same functions, options and results, backed by the addon of this package.
// Raw transfer (`experimentalRawTransfer`, `experimentalLazy`) needs ArrayBuffers above 4 GiB, which
// JavaScriptCore does not allow: `rawTransferSupported()` is false on Bun.

export {
  ExportExportNameKind,
  ExportImportNameKind,
  ExportLocalNameKind,
  ImportNameKind,
  ParseResult,
  Severity,
  Visitor,
  parse,
  parseSync,
  rawTransferSupported,
  visitorKeys,
} from "../vendor/oxc-parser/index.js";
export type * from "../vendor/oxc-parser/index";
