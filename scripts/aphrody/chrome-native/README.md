# Private Chrome native bridge

The `com.bun.aphrody` native messaging host accepts explicit bookmark, history,
tab and recent-session exports from one registered extension ID. It writes
projected batches under `%LOCALAPPDATA%\BunChromium\Exports`. Each private JSON
file contains items plus a manifest with count, source extension ID, timestamp,
batch ID and SHA-256 of UTF-8 `JSON.stringify(items)`. Responses contain receipt
metadata only. It does not upload data, invoke commands or accept filesystem
paths. Passwords, cookies, credentials and opaque Chrome session data are not
supported message kinds.

Messages use Chrome's UTF-8 JSON framing with a four-byte little-endian length
on Windows. Frames are limited to 1 MiB; incoming exports are additionally
limited to 512 KiB. DTOs have strict field allowlists, HTTP(S) URLs without URL
credentials, bounded strings and item counts: 500 bookmarks, 200 history
entries, 100 tabs, or 25 recent sessions with 100 total tabs. A connection handles
at most 100 messages; the export directory holds at most 1,000 files before
the host refuses further writes. Existing private data is preserved.

Native messaging requires both extension permission and an exact host manifest
origin allowlist. HKCU host registration does not install an extension or grant
Chrome approval. See [Chrome native messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

Build the public host with the qualified native Bun checkout:

```powershell
bun bd build --compile ./scripts/aphrody/chrome-native/host.ts --outfile ./build/chromium/qualification/chrome-native/host.exe
```

Run the protocol/stdio fixtures through `bun bd -j2 test
./scripts/aphrody/chrome-native/protocol.test.ts`, then qualify the compiled
executable's framed input/output before installing it. Synthetic fixtures use
isolated temporary storage; no real browsing data is needed for these gates.

Run `install.ps1 -Mode Plan -ExtensionId <actual-id>`. Installation additionally
requires `-Mode Install -Executable <qualified-exe> -ExecutableSha256 <sha256>`.
The installer creates owner/SYSTEM-only native and export directories, pins
the executable hash and writes an explicit extension ID configuration. It
records prior registry metadata, refuses existing host directories or registry
keys, compares registry absence immediately before writing and verifies typed
readback in both Windows registry views for Chrome and Chromium. Concurrent
registry changes fail closed; an interrupted installation may retain its
already-created private host files or registered views for owner review.

HKCU Software is shared between Windows registry views, so each host key is
written once and verified through both views, per [Microsoft's registry view
contract](https://learn.microsoft.com/en-us/windows/win32/winprog64/shared-registry-keys).

The active browser/profile remains untouched. A real disposable Chrome or
Chromium extension/native-host round trip is a separate gate from native stdio
fixtures and host registration. Production Google sign-in remains with the
explicit Google OAuth client and protected server session owner.

On 2026-10-11, the compiled Windows host passed eight synthetic protocol/stdio
tests with 26 assertions, including binary framing and Unicode batches. Its
SHA-256 was `6aacdeeb229524059b8779c06a8e8c91b9c7f1da94460c7e691202b7732b74b3`.
Current-user registration and protected-directory permissions were verified for
extension `pmkbpaadodekfojfkblbjoihnbplgokp` in both registry views. Disposable
Chrome 154 loaded the generated extension and popup; optional permission
approval remained pending in Chrome. No actual private export was qualified.
