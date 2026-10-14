// Auto-generated code, DO NOT EDIT DIRECTLY!
// To edit this generated file you have to edit `tasks/ast_tools/src/generators/raw_transfer.rs`.

import type * as ESTree from "../../../../adapters/types_npm/types.d.ts";

type BufferWithArrays = Uint8Array & {
  int32: Int32Array;
  float64: Float64Array;
};

export declare function deserialize(
  buffer: BufferWithArrays,
  sourceText: string,
  sourceByteLen: number,
): ESTree.Program;

export declare function resetBuffer(): void;
