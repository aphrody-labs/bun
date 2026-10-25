// @aphrody/bun-web target: BrowserPage over a Chrome DevTools endpoint started for the sample.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserPage } from "../../../packages/bun-ui/packages/bun-web/src/index.ts";

const profile = mkdtempSync(join(tmpdir(), "bench-bunweb-"));
const chrome = Bun.spawn(
  [
    process.env.BENCH_CHROME!,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" },
);
try {
  const port = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  let endpoint = "";
  while (!endpoint && Date.now() < deadline) {
    try {
      const [number, path] = readFileSync(port, "utf8").trim().split("\n");
      endpoint = `ws://127.0.0.1:${number}${path}`;
    } catch {
      await Bun.sleep(25);
    }
  }
  if (!endpoint) throw new Error("Chrome did not publish a DevTools endpoint");
  const page = await BrowserPage.connect(endpoint);
  try {
    await page.goto(process.argv[2]!);
    process.stdout.write(String(await page.evaluate("document.documentElement.outerHTML")));
  } finally {
    await page.close();
  }
} finally {
  chrome.kill("SIGKILL");
  await chrome.exited;
  rmSync(profile, { recursive: true, force: true });
}
