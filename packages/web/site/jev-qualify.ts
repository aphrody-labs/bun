import { homedir } from "node:os";
import { join } from "node:path";
import { lstatSync } from "node:fs";
import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { out: { type: "string" }, credential: { type: "string" } },
  strict: true,
});
const location = values.credential ?? join(homedir(), ".aphrody", "private", "typesafe.api-key");
const metadata = lstatSync(location);
if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 4096)
  throw new Error("TypeSafe credential reference is invalid");
const client = new TypeSafeClient({
  apiKey: (await Bun.file(location).text()).trim(),
  timeout: 8000,
  retry: { maxRetries: 0 },
  logLevel: "off",
});
const state = {
  runtime: { version: Bun.version, source: Bun.revision, target: process.platform + "-" + process.arch },
  documentedAPI:
    "Bun.Video is a native global constructor. A local path, bytes or Blob can be used. metadata() provides metadata; frame(time).resize(width,height).png() extracts a PNG. HTTP URLs are fetched first and passed as Blob or bytes. No builtin bun:video is declared.",
  nativeCode:
    "const video = new Bun.Video(await fetch(url).then(r => r.blob())); const png = await video.frame(1).resize(320,180).png();",
  conflictingCode: "import { Video } from 'bun:video';",
};
let receipt: Record<string, unknown>;
try {
  const result = await client.systemOne(
    {
      state,
      questions: {
        native: noul(
          "Does `nativeCode` follow `documentedAPI` for fetching an HTTP video and extracting a resized PNG frame?",
        ),
        conflict: noul("Does `conflictingCode` import a builtin that `documentedAPI` explicitly says is not declared?"),
      },
    },
    { signal: AbortSignal.timeout(10000) },
  );
  for (const answer of Object.values(result.answers))
    if (!Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) throw new Error("Invalid probability");
  receipt = {
    schema: 1,
    date: new Date().toISOString(),
    hostTarget: state.runtime.target,
    runtimeSource: Bun.revision,
    calls: 1,
    authenticated: true,
    model: result.model,
    answers: result.answers,
    usage: result.usage,
  };
} catch (error) {
  receipt = {
    schema: 1,
    date: new Date().toISOString(),
    calls: 1,
    authenticated: false,
    errorType: error instanceof Error ? error.name : "UnknownError",
    status:
      typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
        ? error.status
        : null,
  };
}
if (values.out) await Bun.write(values.out, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
if (!receipt.authenticated) process.exitCode = 1;
