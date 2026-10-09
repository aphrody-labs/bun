Default Windows metadata from windows-rs `crates/libs/default` (642aca37075f2091a0950b4ea79f35a7ead43460),
compressed with `zstd -19 --long=27`: `Windows.winmd` (WinRT) and `Windows.Win32.winmd` (Win32, from
microsoft/win32metadata). Bun embeds them on Windows for `bun winmd` (see src/runtime/cli/winmd_command.rs).
