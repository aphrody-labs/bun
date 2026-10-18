// Playwright target: load a URL in system Chrome and print the rendered document.
import { createRequire } from "node:module";

const require = createRequire(`${process.env.BENCH_GLOBAL_MODULES}/`);
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: process.env.BENCH_CHROME, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2]!, { waitUntil: "load" });
  process.stdout.write(await page.content());
} finally {
  await browser.close();
}
