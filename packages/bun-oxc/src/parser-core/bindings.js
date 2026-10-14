// Parser functions come from the Bun package addon. Upstream notices are in ../../LICENSE.
import { native } from "../native.ts";

const binding = native();

export const {
  Severity,
  ParseResult,
  ExportExportNameKind,
  ExportImportNameKind,
  ExportLocalNameKind,
  ImportNameKind,
  parse,
  parseSync,
  rawTransferSupported,
  getBufferOffset,
  parseRaw,
  parseRawSync,
} = binding;
export const __napiBindingTarget = "native";
