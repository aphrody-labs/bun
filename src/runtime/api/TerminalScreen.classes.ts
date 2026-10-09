import { define } from "../../codegen/class-definitions.ts";

export default [
  define({
    name: "TerminalScreen",
    construct: true,
    finalize: true,
    configurable: false,
    klass: {},
    JSType: "0b11101110",
    proto: {
      write: {
        fn: "write",
        length: 1,
      },
      resize: {
        fn: "resize",
        length: 2,
      },
      reset: {
        fn: "reset",
        length: 0,
      },
      text: {
        fn: "text",
        length: 1,
      },
      cells: {
        fn: "cells",
        length: 0,
      },
      takeReplies: {
        fn: "takeReplies",
        length: 0,
      },
      cols: {
        getter: "getCols",
      },
      rows: {
        getter: "getRows",
      },
      cursor: {
        getter: "getCursor",
      },
      title: {
        getter: "getTitle",
      },
      alternateScreen: {
        getter: "getAlternateScreen",
      },
    },
  }),
];
