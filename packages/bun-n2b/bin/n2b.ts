#!/usr/bin/env bun
// `bunx @aphrody/bun-plugin-n2b <args>`: the n2b CLI (same arguments as `aphrody n2b`).
import { native } from "../src/native";

process.env.BUN_EXE ??= process.execPath;
process.exitCode = native().runCli(process.argv.slice(2));
