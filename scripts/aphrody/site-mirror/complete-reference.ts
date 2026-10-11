import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export function capturePath(root: string, value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "bun.com" || url.username || url.password || url.search)
    throw new Error("Only canonical public bun.com URLs are captured");
  const path = url.pathname.replace(/^\//, "").replace(/\/$/, "");
  const file = resolve(root, "bun.com", path, "index.html");
  if (!file.startsWith(resolve(root) + sep)) throw new Error("Captured path escaped its root");
  return file;
}
export function retryDelay(value: unknown, attempt: number, now = Date.now()): number {
  const text = String(value ?? "").trim();
  const parsed = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - now;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000 * 2 ** attempt;
}

if (import.meta.main) {
  const [directory, ...args] = process.argv.slice(2);
  if (!directory) throw new Error("Usage: complete-reference.ts <capture-dir> [--apply]");
  const root = resolve(directory),
    captured = join(root, "upstream");
  const db = new Database(join(root, "frontier.sqlite"), { readonly: true });
  const discovered = db
    .query<{ url: string }, []>(
      "SELECT url FROM requests WHERE host='bun.com' AND url LIKE 'https://bun.com/reference/%' ORDER BY url",
    )
    .all()
    .map(row => row.url);
  db.close();
  const journal = join(root, "reference-capture.jsonl");
  const receipts = existsSync(journal)
    ? readFileSync(journal, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(line => JSON.parse(line))
    : [];
  const completed = new Set<string>(receipts.filter(receipt => receipt.ok).map(receipt => receipt.requested));
  const requests = discovered.filter(url => !completed.has(url) && !existsSync(capturePath(captured, url)));
  if (!args.includes("--apply"))
    console.log(
      JSON.stringify({
        discovered: discovered.length,
        remaining: requests.length,
        concurrency: 2,
        delayMs: 300,
        maxURLs: 20000,
        maxAttemptsPerURL: 3,
        source: "native robots/sitemap frontier",
        owner: "aphrody-web response",
      }),
    );
  else {
    let index = 0,
      nextStart = Date.now(),
      ok = 0,
      failed = 0;
    let actualRequests = 0,
      stop = false;
    const selected = requests.slice(0, 20000);
    const worker = async () => {
      while (index < selected.length && !stop) {
        const requested = selected[index++]!;
        const due = Math.max(Date.now(), nextStart);
        nextStart = due + 300;
        if (due > Date.now()) await Bun.sleep(due - Date.now());
        let receipt: Record<string, unknown>;
        try {
          let response: any;
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) {
              const retryStart = Math.max(Date.now(), nextStart);
              nextStart = retryStart + 300;
              if (retryStart > Date.now()) await Bun.sleep(retryStart - Date.now());
            }
            actualRequests++;
            const proc = Bun.spawn(["aphrody-web", "response", requested, "--max-bytes", "2000000"], {
              stdout: "pipe",
              stderr: "pipe",
            });
            const [stdout, stderr, code] = await Promise.all([
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
              proc.exited,
            ]);
            if (code) throw new Error(stderr.slice(0, 300));
            response = JSON.parse(stdout);
            if (response.status !== 429 || attempt === 2) break;
            const delay = retryDelay(response.headers?.["retry-after"], attempt);
            appendFileSync(
              journal,
              JSON.stringify({
                requested,
                event: "retry",
                status: 429,
                delayMs: delay,
                observedAt: new Date().toISOString(),
              }) + "\n",
            );
            if (delay > 300000) {
              stop = true;
              throw new Error("Server Retry-After exceeds bounded 5 minute wait; batch deferred");
            }
            nextStart = Math.max(nextStart, Date.now() + delay);
            await Bun.sleep(delay);
          }
          if (
            response.status !== 200 ||
            response.truncated ||
            !String(response.headers["content-type"] ?? "").includes("text/html")
          )
            throw new Error(`Unqualified response: status=${response.status}, truncated=${response.truncated}`);
          const file = capturePath(captured, response.url),
            bytes = existsSync(file) ? readFileSync(file) : new TextEncoder().encode(response.body);
          mkdirSync(dirname(file), { recursive: true });
          if (!existsSync(file)) {
            const temporary =
              file + ".partial-" + new Bun.CryptoHasher("sha256").update(requested).digest("hex").slice(0, 16);
            writeFileSync(temporary, bytes);
            renameSync(temporary, file);
          }
          receipt = {
            requested,
            resolved: response.url,
            ok: true,
            bytes: bytes.length,
            sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
          };
          ok++;
        } catch (error) {
          receipt = { requested, ok: false, error: String(error).slice(0, 300) };
          failed++;
        }
        appendFileSync(
          journal,
          JSON.stringify({ ...receipt, observedAt: new Date().toISOString(), owner: "aphrody-web response" }) + "\n",
        );
        if ((ok + failed) % 100 === 0)
          console.log(JSON.stringify({ processed: ok + failed, total: selected.length, ok, failed }));
      }
    };
    await Promise.all([worker(), worker()]);
    const report = {
      endedAt: new Date().toISOString(),
      discovered: discovered.length,
      requested: selected.length,
      actualRequests,
      ok,
      failed,
      deferred: Math.max(0, requests.length - index),
      owner: "aphrody-web response",
      coverage:
        "Public reference URLs discovered by the native robots/sitemap frontier; other unlinked page families require separate coverage.",
    };
    writeFileSync(join(root, "reference-capture-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
}
