# M-tauri — one Tauri plugin (`tauri-plugin-aphrody` + `@aphrody/tauri`)

Source: aphrody-labs/aphrody@55652e3f56 (handoff-runtime-bun lot 0 `tauri`): `crates/tauri/*`, `crates/ui/tauri-plugin-mcp-bridge`, `crates/ui/tauri-wrap`.
Destination: `packages/bun-tauri` (separate Cargo workspace). Guide: `docs/guides/runtime/tauri.mdx`. Owner: TP.
Runtimes (`aphrody-tauri-runtime{,-cef,-wry}`) belong to WV (`C:/tmp/wv-coord.md`). TP does not modify them.

Legend: ✅ verified by a real run (command and date) · ⏳ not done · ➖ not applicable.

| Module | Builds (Windows, default features) | e2e IPC MockRuntime Windows 11 | Ubuntu 26.04 | Alpine 3.24 | Real window |
| --- | --- | --- | --- | --- | --- |
| aphrody (Bun: bun_info / bun_request / bun_restart, real `bun` server) | ✅ 2026-10-09 | ✅ `bun_server_over_ipc`, `bun_restart_needs_its_permission` | ⏳ | ⏳ | ⏳ (WebOS demo) |
| ACL bundle (`__BUNDLE__` keys, `tauri_plugin::Bundle`) | ✅ | ✅ `acl_denies_commands_without_permission` + utils `bundle_tests` | ⏳ | ⏳ | ➖ |
| os | ✅ | ✅ `os` | ⏳ | ⏳ | ➖ |
| fs | ✅ | ✅ `fs_inside_scope_only` (mkdir, read_dir, stat, exists, outside scope refused) | ⏳ | ⏳ | ➖ |
| store | ✅ | ✅ `store_set_get_save` | ⏳ | ⏳ | ➖ |
| log, window-state, notification, deep-link | ✅ | ✅ `log_window_state_notification_deep_link` | ⏳ | ⏳ | ➖ |
| autostart | ✅ | ⏳ (needs a real app identifier) | ⏳ | ⏳ | ➖ |
| updater | ✅ (+ unit tests) | ⏳ (needs a signed manifest) | ⏳ | ⏳ | ➖ |
| process, single-instance | ✅ | ⏳ (exit/restart kill the test runner) | ⏳ | ⏳ | ⏳ |
| dialog, clipboard-manager, global-shortcut, opener | ✅ | ➖ (need a desktop session) | ⏳ | ⏳ | ⏳ |
| mcp-bridge (`--features mcp-bridge`, CEF) | ⏳ | ⏳ | ⏳ | ➖ (CEF glibc only) | ⏳ |
| wrap (`--features wrap,wrap-bundle`) | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| core crates (cli, bundler, codegen, …) | ⏳ (only those the plugin needs) | ➖ | ⏳ | ⏳ | ➖ |
| `@aphrody/tauri` (js/api, js/plugins, bun, server) | ⏳ typecheck | ➖ | ➖ | ➖ | ⏳ |
| Example app WebOS (`examples/webos`) | ⏳ | ⏳ | ⏳ | ⏳ (window via runtime-wry, WV) | ⏳ |
| Mobile (android/ios kept in `mobile/<name>/`) | ⏳ | ➖ | ➖ | ➖ | ⏳ |

Commands:

```sh
cd packages/bun-tauri
cargo test -p tauri-plugin-aphrody            # unit (36) + e2e
cargo test -p aphrody-tauri-utils bundle_tests
# Linux (VPS, nice): docker run --rm -v $PWD:/w -w /w <ubuntu-26.04|alpine-3.24 image with rust+bun> cargo test -p tauri-plugin-aphrody
```
