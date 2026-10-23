#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Writes src/server/api-families.json: the module inventory of bun-video as of this checkout. A deployment without
 * the bun-video sources serves it from /api/capabilities (marked `source: "snapshot"`), so the tools page still
 * lists every module. Run after the inventory changes (packages/bun-video/src/video-api.ts) and commit the result.
 */
import { resolve } from "node:path";
import { describeVideoAPIs } from "../../../packages/bun-video/src/video-api";

const apiFamilies = describeVideoAPIs().map(({ id, module, description, scope }) => ({ id, module, description, scope }));
const output = resolve(import.meta.dir, "../src/server/api-families.json");
await Bun.write(output, `${JSON.stringify({ schema: "bun-video/api-snapshot/v1", apiFamilies }, null, 2)}\n`);
console.log(`${apiFamilies.length} modules written to ${output}`);
