#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
export * from "../../packages/bun-video/src/apps/crunchyroll-shortcuts";
import { crunchyrollShortcutsMain } from "../../packages/bun-video/src/apps/crunchyroll-shortcuts";
if (import.meta.main) await crunchyrollShortcutsMain();
