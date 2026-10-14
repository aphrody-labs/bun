import { join as pathJoin } from "node:path";

import { disableReusedWorkers } from "../../../../../scripts/codegen/ecma_disable_workers.mjs";

disableReusedWorkers(pathJoin(import.meta.dirname, "../playground.wasi-browser.js"));
