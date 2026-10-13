export function openApplication(options) {
  return require("bun:chromium").profiles.openApplication(options);
}

export function importProfile(options) {
  if (!(this instanceof Bun.WebView)) throw new TypeError("WebView.importProfile requires a WebView receiver");
  return require("bun:chromium").profiles.importSite({ ...options, view: this });
}
