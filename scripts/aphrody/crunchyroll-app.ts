#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
export * from "../../packages/bun-video/labs/crunchyroll-app";
import { crunchyrollAppMain } from "../../packages/bun-video/labs/crunchyroll-app";
if (import.meta.main) await crunchyrollAppMain();
