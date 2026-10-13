# Native Rio: Material 3 and full features

The `rio` desktop executable is built from `src/rio/frontends/rioterm`. It
draws through Sugarloaf and the native Windows GPU backend, independently of
the headless `bun:rio` module.

## Material source and accessibility

Terminal text, tab titles, search and command palette use size 18 by default.
Terminal line height is 1.2. Palette rows and search buttons have 48 logical
pixel targets; their layout fits the window and keeps keyboard selection in
view. `Tab` moves forward and `Shift+Tab` moves backward in the palette.
Search, palette and tabs follow the terminal's light/dark appearance.

The native colors come from Material's Rust `ThemeExport`, not CSS or a
webview. The input is
`packages/app-ui/src/generated/brand-theme-high-contrast.json` in the selected
Material checkout: schema 1, specification 2021, seed `#8c6c88`, tonal-spot,
contrast 1. The generated Rust roles record the source SHA-256. Regenerate or
verify them with the installed Aphrody Bun:

```powershell
bun run scripts/aphrody/rio-material-theme.ts --source=C:/material/packages/app-ui/src/generated/brand-theme-high-contrast.json
bun run scripts/aphrody/rio-material-theme.ts --source=C:/material/packages/app-ui/src/generated/brand-theme-high-contrast.json --check
```

The built-in `theme = "m3"` follows the system's light/dark appearance. Use
`m3-light` or `m3-dark` to fix it. Named TOML themes and explicit color
overrides remain supported. Tests measure text, selection, search and ANSI
color contrast in both schemes. This improves visual and keyboard access;
the GPU interface does not expose a Windows UI Automation screen-reader tree.

## Full native profile

The desktop package enables all four public Cargo features by default:
`audio`, `wgpu`, `x11`, and `wayland`. Platform gates remain in effect: Windows
uses MessageBeep and its native windows; X11/Wayland and CPAL are Unix paths.
Renderer, PTY, clipboard, Kitty host graphics, image/glyph decoding and the
wgpu filter chain are linked through the desktop dependencies.

Enable optional interactions and effects with `rio --all-features`, or put
this at the top level of the config:

```toml
theme = "m3"
line-height = 1.2
enable-all-features = true

[fonts]
size = 18
```

The profile enables shell integration, grapheme clustering, the scrollbar,
copy on selection, bright bold colors, clickable tabs with terminal titles,
URL/path hints and OSC 8 hyperlinks, splits, opening
settings in a split, a visible single tab, IME positioning, audible and tab
bell indicators, the custom mouse cursor and cursor trail.

The CPU renderer and Game redraw strategy are alternative renderer choices.
Filters require a chosen shader preset. Debug/FPS logging is configured in
`[developer]`. Full features do not switch these settings, start a quake
window, override the shell, or enable Bun's embedding-only SIMD FFI.

## Shell and icon

The native default shell is `rio-shell`, resolved beside the Rio executable,
through `RIO_BUN_SHELL`, or through PATH. Explicit user shell configurations
remain supported. Its canonical source is Aphrody's
`tools/config/host/windows/terminal/bun-shell.ts`; compile that adapter with a
Bun runtime built with coreutils and place the executable beside Rio.

The adapter runs commands through Bun Shell, probes linked coreutils with an
empty PATH, and loads `bun:windows` on Windows or `bun:linux` on Linux.
`js <expression>` exposes those modules, `$`, and `bun:wasm` in the session's
JavaScript VM. WASM here means build/optimization tooling, not a native browser
terminal. Platform API availability does not prove every privileged operation
or a Linux desktop build has been qualified.

The executable and window icon embed Material Symbols Rounded `terminal`
(weight 400), loaded through Material's icon catalogue. The catalogue has no
`shell` symbol. The M3 tile uses `primaryContainer` and `onPrimaryContainer`;
the SVG, PNG, ICO and source hashes are recorded alongside the native assets.
Regenerate or verify them with:

```powershell
bun run scripts/aphrody/rio-material-icon.ts --material=C:/material --check
```

Build and test only the native packages, rather than the unrelated WASM and
C ABI packages with `--workspace --all-features`:

```powershell
cargo test --manifest-path src/rio/Cargo.toml -p rio-backend -p rioterm --all-features --lib --bin rio -j2
cargo build --manifest-path src/rio/Cargo.toml -p rioterm --all-features --bin rio -j2
```

The upstream file receipt excludes newly authored adapter files. To refresh
its upstream-file hashes after local changes:

```powershell
aphrody git api '/repos/raphamorim/rio/git/trees/09473c7c28a49ad547375cf0a8690ef7ebd7d879?recursive=1' --pretty > $env:TEMP/rio-tree.json
bun run scripts/aphrody/rio-source-receipt.ts --tree=$env:TEMP/rio-tree.json
```
