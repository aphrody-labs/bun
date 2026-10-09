import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BunPython } from "./pyjs-store.ts";

type Receipt = {
  id: string;
  kind: string;
  command: string[];
  cwd: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  stdout: string;
  stderr: string;
  bun: string;
  bunRevision?: string;
  executable?: string;
};
const busy = (error: unknown) => error instanceof Error && "code" in error && error.code === "SQLITE_BUSY";
export const receiptsRoot = (registry: BunPython) => resolve(dirname(registry.path), "tmp/bun-python/runs");

async function saveRun(registry: BunPython, receipt: Receipt) {
  if (receipt.exitCode === undefined) return;
  const text = async (path: string) => {
    const file = Bun.file(path);
    return file.size <= 4 * 1024 * 1024 ? file.text() : JSON.stringify({ artifact: path, bytes: file.size });
  };
  const [stdout, stderr] = await Promise.all([text(receipt.stdout), text(receipt.stderr)]);
  registry.db
    .query("INSERT INTO runs VALUES(?,?,?,?,?,NULL,'running',NULL,NULL,NULL,?) ON CONFLICT(id) DO NOTHING")
    .run(
      receipt.id,
      receipt.kind,
      JSON.stringify(receipt.command),
      receipt.cwd,
      receipt.startedAt,
      JSON.stringify({
        bun: receipt.bun,
        bunRevision: receipt.bunRevision,
        executable: receipt.executable,
        receipt: true,
      }),
    );
  const row = registry.db.query<{ status: string }, [string]>("SELECT status FROM runs WHERE id=?").get(receipt.id)!;
  if (row.status === "running") {
    registry.finishRun(receipt.id, receipt.exitCode, stdout, stderr);
    if (receipt.finishedAt)
      registry.db.query("UPDATE runs SET finished_at=? WHERE id=?").run(receipt.finishedAt, receipt.id);
  }
  const existing = registry.db
    .query("SELECT id FROM artifacts WHERE run_id=? AND kind='command-stdout'")
    .get(receipt.id);
  if (!existing)
    await Promise.all([
      registry.artifact(receipt.stdout, "command-stdout", receipt.id),
      registry.artifact(receipt.stderr, "command-stderr", receipt.id),
    ]);
}

export async function recoverRuns(registry: BunPython) {
  const directory = receiptsRoot(registry);
  await mkdir(directory, { recursive: true });
  let recovered = 0;
  for await (const path of new Bun.Glob("*.receipt.json").scan({ cwd: directory, absolute: true })) {
    const receipt = (await Bun.file(path).json()) as Receipt;
    if (receipt.exitCode === undefined) continue;
    await saveRun(registry, receipt);
    recovered++;
  }
  return { recovered };
}

export async function runRecorded(registry: BunPython, kind: string, command: string[], cwd: string, output?: string) {
  const id = randomUUID();
  const directory = receiptsRoot(registry);
  await mkdir(directory, { recursive: true });
  const receipt: Receipt = {
    id,
    kind,
    command,
    cwd,
    startedAt: new Date().toISOString(),
    stdout: resolve(directory, `${id}.stdout`),
    stderr: resolve(directory, `${id}.stderr`),
    bun: Bun.version,
    bunRevision: Bun.revision,
    executable: process.execPath,
  };
  const receiptPath = resolve(directory, `${id}.receipt.json`);
  await Bun.write(receiptPath, JSON.stringify(receipt));
  try {
    registry.db
      .query("INSERT INTO runs VALUES(?,?,?,?,?,NULL,'running',NULL,NULL,NULL,?)")
      .run(
        id,
        kind,
        JSON.stringify(command),
        cwd,
        receipt.startedAt,
        JSON.stringify({
          bun: Bun.version,
          bunRevision: Bun.revision,
          executable: process.execPath,
          receipt: receiptPath,
        }),
      );
  } catch (error) {
    if (!busy(error)) throw error;
  }
  const capture = async (stream: ReadableStream<Uint8Array>, path: string, destination?: NodeJS.WriteStream) => {
    const writer = Bun.file(path).writer();
    let buffered = 0;
    try {
      for await (const chunk of stream) {
        const written = writer.write(chunk);
        if (typeof written !== "number") await written;
        destination?.write(chunk);
        buffered += chunk.length;
        if (buffered >= 65536) {
          await writer.flush();
          buffered = 0;
        }
      }
    } finally {
      await writer.end();
    }
  };
  let code = 1;
  try {
    await using child = Bun.spawn({
      cmd: command,
      cwd,
      env: process.env,
      stdin: "inherit",
      stdout: "pipe",
      stderr: "pipe",
    });
    const results = await Promise.all([
      capture(child.stdout, receipt.stdout, output ? undefined : process.stdout),
      capture(child.stderr, receipt.stderr, process.stderr),
      child.exited,
    ]);
    code = results[2];
  } catch (error) {
    await appendFile(receipt.stderr, `\n${String(error)}\n`);
    process.stderr.write(`${String(error)}\n`);
  }
  receipt.finishedAt = new Date().toISOString();
  receipt.exitCode = code;
  await Bun.write(receiptPath, JSON.stringify(receipt));
  if (output) await Bun.write(resolve(output), Bun.file(receipt.stdout));
  try {
    await saveRun(registry, receipt);
  } catch (error) {
    if (!busy(error)) throw error;
    process.stderr.write(`Registry busy; receipt retained at ${receiptPath}\n`);
  }
  return code;
}
