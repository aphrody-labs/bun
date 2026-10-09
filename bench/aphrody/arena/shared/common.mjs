// Shared by every arena workload, byte for byte identical under Bun and Deno.
// A workload prints one JSON line on stdout: { workload, lane, runtime, checksum,
// checksums, cold, samples, hwm, hwmSource, info }. Only performance.now() and
// ECMAScript run between two timestamps; I/O, module loading and runtime
// detection stay outside the timed region (METHOD C9).

import { readFileSync } from "node:fs";
import process from "node:process";

export const runtime = typeof Deno !== "undefined" ? "deno" : typeof Bun !== "undefined" ? "bun" : "node";
export const warmup = Math.max(1, Number(process.env.ARENA_WARMUP ?? 10));
export const iters = Math.max(1, Number(process.env.ARENA_ITERS ?? 15));
export const env = name => process.env[name];

export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mix(h, v) {
  return Math.imul((h ^ v) >>> 0, 16777619) >>> 0;
}

export function hashString(h, s) {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export function hashBytes(h, bytes) {
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return h;
}

/** Peak RSS of this process, read by the process itself (METHOD C10). */
export function peakRss() {
  try {
    const m = /VmHWM:\s+(\d+)\s+kB/.exec(readFileSync("/proc/self/status", "utf8"));
    if (m) return { hwm: Number(m[1]) * 1024, hwmSource: "VmHWM" };
  } catch {}
  return { hwm: process.memoryUsage().rss, hwmSource: "rss" };
}

function check(name, got, want) {
  if (got !== want) throw new Error(`${name}: checksum drift ${got} != ${want}`);
}

/** The first call is reported apart (cold); `warm` calls are dropped; `n` calls are timed. */
export function measureSync(name, fn, { warm = warmup, n = iters } = {}) {
  let t = performance.now();
  const checksum = fn();
  const cold = performance.now() - t;
  for (let i = 1; i < warm; i++) check(name, fn(), checksum);
  const samples = [];
  for (let i = 0; i < n; i++) {
    t = performance.now();
    const c = fn();
    samples.push(performance.now() - t);
    check(name, c, checksum);
  }
  return { cold, samples, checksum };
}

export async function measureAsync(name, fn, { warm = warmup, n = iters } = {}) {
  let t = performance.now();
  const checksum = await fn();
  const cold = performance.now() - t;
  for (let i = 1; i < warm; i++) check(name, await fn(), checksum);
  const samples = [];
  for (let i = 0; i < n; i++) {
    t = performance.now();
    const c = await fn();
    samples.push(performance.now() - t);
    check(name, c, checksum);
  }
  return { cold, samples, checksum };
}

export function report(workload, lane, parts, info = {}) {
  const out = { workload, lane, runtime, checksum: "", checksums: {}, cold: {}, samples: {}, info };
  let h = 2166136261;
  for (const [k, r] of Object.entries(parts)) {
    out.cold[k] = r.cold;
    out.samples[k] = r.samples;
    out.checksums[k] = r.checksum;
    h = typeof r.checksum === "number" ? mix(h, r.checksum) : hashString(h, String(r.checksum));
  }
  out.checksum = h.toString(16).padStart(8, "0");
  Object.assign(out, peakRss());
  console.log(JSON.stringify(out));
}
