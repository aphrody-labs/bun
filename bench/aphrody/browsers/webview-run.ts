// Bun.WebView target: load a URL through the Chrome backend and print the rendered document.
const view = new Bun.WebView({
  backend: { type: "chrome", url: false, path: process.env.BENCH_CHROME, argv: ["--no-sandbox"] },
});
try {
  await view.navigate(process.argv[2]!);
  process.stdout.write(String(await view.evaluate("document.documentElement.outerHTML")));
} finally {
  view.close();
}
