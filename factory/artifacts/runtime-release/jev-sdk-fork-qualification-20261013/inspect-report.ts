const response = await fetch("http://127.0.0.1:18886/report", { signal: AbortSignal.timeout(10_000) });
console.log(`REPORT_HTTP=${response.status}`);
const body = await response.text();
let value: unknown;
try { value = JSON.parse(body); }
catch { console.log(body.replace(/(?:Bearer\s+|(?:sk|ts|api)[_-])[A-Za-z0-9_.-]{16,}/gi, "[REDACTED]")); process.exit(0); }
function shape(input: unknown, depth = 0): unknown {
  if (depth > 3) return Array.isArray(input) ? `array(${input.length})` : typeof input;
  if (Array.isArray(input)) return input.slice(0, 2).map(item => shape(item, depth + 1));
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, shape(item, depth + 1)]));
  return typeof input;
}
console.log(JSON.stringify(shape(value)));
