#!/usr/bin/env bun
/**
 * Loads pages of a built or deployed site in a real browser (Bun.WebView) and checks what a visitor depends on: the
 * response, the stylesheet and fonts applied, no console error, no horizontal overflow, working navigation links and the
 * search box. Exits 1 on the first failing page.
 *
 *   bun scripts/verify.ts https://bun.aphrody.app [--pages /,/docs,/downloads] [--widths 1440,390]
 */
const args = Bun.argv.slice(2);
const origin = (args.find(arg => /^https?:\/\//.test(arg)) ?? "https://bun.aphrody.app").replace(/\/$/, "");
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const pages = option(
  "--pages",
  "/,/docs,/docs/runtime/video,/downloads,/release-notes,/benchmarks,/runtime,/nothing-here",
)
  .split(",")
  .map(page => (page.startsWith("/") ? page : `/${page}`));
const widths = option("--widths", "1440,390").split(",").map(Number);

const errors: string[] = [];
const view = new Bun.WebView({
  backend: { type: "chrome" },
  console: (type: string, ...parts: unknown[]) => {
    if (type === "error")
      errors.push(
        parts
          .map(part => String(part))
          .join(" ")
          .slice(0, 240),
      );
  },
} as ConstructorParameters<typeof Bun.WebView>[0]);

const probe = `(() => {
  const heading = document.querySelector("h1");
  const font = (selector) => getComputedStyle(document.querySelector(selector) ?? document.body).fontFamily;
  return JSON.stringify({
    title: document.title,
    background: getComputedStyle(document.body).backgroundColor,
    heading: heading?.textContent?.slice(0, 80) ?? null,
    headingFont: heading ? getComputedStyle(heading).fontFamily : null,
    bodyFont: font("body"),
    fonts: [...document.fonts].filter(f => f.status === "loaded").map(f => f.family),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    links: [...document.querySelectorAll("header nav a")].map(a => a.getAttribute("href")),
    mainLength: document.querySelector("main")?.textContent?.length ?? 0,
  });
})()`;

let failed = 0;
const fail = (message: string) => {
  failed++;
  console.log(`  FAIL ${message}`);
};
try {
  await view.navigate(`${origin}/robots.txt`);
  for (const width of widths) {
    await view.resize(width, width > 800 ? 900 : 844);
    for (const page of pages) {
      errors.length = 0;
      const missing = page === "/nothing-here";
      const response = await fetch(origin + page, { redirect: "follow" });
      console.log(`${page} @${width}: HTTP ${response.status}`);
      if (missing ? response.status !== 404 : !response.ok) fail(`status ${response.status}`);
      await view.navigate(origin + page);
      await Bun.sleep(1500);
      const state = JSON.parse(String(await view.evaluate(probe))) as Record<string, any>;
      if (state.background !== "rgb(13, 10, 12)") fail(`background ${state.background}, the stylesheet did not apply`);
      if (!/Archivo/.test(state.headingFont ?? "")) fail(`heading font ${state.headingFont}`);
      if (!state.fonts.includes("Archivo")) fail(`Archivo not loaded (${state.fonts.join(", ") || "none"})`);
      if (state.overflow > 0) fail(`horizontal overflow of ${state.overflow}px`);
      if (!state.heading) fail("no heading");
      if (state.mainLength < 100) fail(`main holds ${state.mainLength} characters`);
      for (const error of errors) fail(`console error: ${error}`);
    }
  }
  // The navigation links of the header all answer.
  await view.navigate(origin + "/");
  const links = (JSON.parse(String(await view.evaluate(probe))) as { links: string[] }).links;
  for (const link of links) {
    const response = await fetch(new URL(link, origin), { redirect: "follow" });
    console.log(`nav ${link}: HTTP ${response.status}`);
    if (!response.ok) fail(`nav link ${link} answers ${response.status}`);
  }
  // The search box answers from /docs/search.json.
  await view.click("#q").catch(() => {});
  await view.type("python");
  await Bun.sleep(1200);
  const results = Number(await view.evaluate(`document.querySelectorAll("#results a").length`));
  console.log(`search "python": ${results} result(s)`);
  if (!results) fail("search returned nothing");
} finally {
  view.close();
}
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
