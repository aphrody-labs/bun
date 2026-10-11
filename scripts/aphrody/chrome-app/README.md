# Aphrody Chrome app

The generator writes a separate Chrome theme and Manifest V3 extension. It reads a public RSA SPKI key and the exact SHA256-pinned CSS produced by the canonical native M3 owner. It maps existing color roles to Chrome colors; it does not reproduce palette mathematics.

Run through the owner factory: `bun bd -j2 scripts/aphrody/chrome-app/generate.ts C:/bun/build/chrome-app-config.json`. The explicit JSON config contains `cssFile`, `cssSha256`, `outputRoot` and base64 `publicKey`. Keep generated assets under ignored `build/chrome-app`. Reuse the same public key across regeneration; the receipt records its stable extension ID, file hashes and native host origin. Only the public key is needed by this generator.

The popup/new-tab page opens Aphrody search and the site's real Google login route. OAuth success depends on the separately configured site client and session store. Homepage, startup and default search overrides are declared for Chrome's user confirmation. The native theme contains colors only, without extension scripts.

Export buttons request bookmarks, history, tabs or sessions plus nativeMessaging directly on the user gesture. Only bounded http(s) URLs without URL credentials, titles and selected metadata are sent to `com.bun.aphrody`. Closed sessions require both sessions and tabs permission. The separately owned `chrome-native` host writes private local archives; this is not browser-profile import, password extraction, cookie transfer or cloud synchronization. No browser data goes to aphrody.com.

Generated assets are uninstalled and unqualified until Chrome loads them in a synthetic profile. Do not install into the owner's active profile as part of generation. Chrome stable may restrict command-line unpacked extension loading; use a browser that actually supports it. Store publication remains a separate action.

`bun bd -j2 scripts/aphrody/chrome-app/qualify.ts` verifies generated hashes, starts installed Chrome with a fresh synthetic profile and explicit CDP extension debugging, then records `build/chrome-app/qualification.json`. Chrome154.0.8037.57 loaded the real MV3 extension with its stable ID, popup and new-tab override. Homepage/search declarations were observed in its live manifest; production search and OAuth success are separate checks. Optional bookmarks/nativeMessaging permission requests timed out awaiting Chrome consent, so the browser-to-host export remains unqualified. The compiled host's standalone protocol tests do not replace this roundtrip.

The native theme was rejected because the existing Windows `BrowserThemeColor` policy imposes a managed theme. Chromium's `extension_management.cc` rejects theme extensions while `ThemeService::UsingPolicyTheme()` is true. The qualifier preserves that policy, records `themeQualified:false` and leaves active owner profiles untouched. Generated theme colors and PNG files passed source/runtime generator tests; actual theme installation remains pending.

The installed Windows computer-use skill's `docs/guidance.md` forbids acting on security/privacy permission requests. Automated UI consent was therefore excluded; no optional permission was forged. A future owner-approved manual consent test must use the qualifier's synthetic profile and fixtures, independently from private profile migration.

Contracts: [MV3 settings overrides](https://developer.chrome.com/docs/extensions/reference/manifest/chrome-settings-override), [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [themes](https://developer.chrome.com/docs/extensions/develop/ui/themes).
