# Windows source submodules

The independently owned Microsoft sources are pinned Git submodules of their Aphrody forks:

| Path | Fork | Upstream | Pin | Aphrody commits over upstream |
| --- | --- | --- | --- | ---: |
| `vendor/powershell` | `aphrody-labs/PowerShell` | `PowerShell/PowerShell` | `cf5765391c7c78914d5316f0b8105fa652456cc4` | 0 |
| `vendor/windows-terminal` | `aphrody-labs/terminal` | `microsoft/terminal` | `2304e801074b546b4544f5cd697e98b0e4c94359` | 13 |
| `vendor/vcpkg` | `aphrody-labs/vcpkg` | `microsoft/vcpkg` | `e664453ac3e6a07c62c92bedeb562effe662a44b` | 2 |
| `vendor/roslyn` | `aphrody-labs/roslyn` | `dotnet/roslyn` | `c8b2c7a7e2c29fb031f39008e6258a8706dbf6b1` | 0 |
| `vendor/fluentui` | `aphrody-labs/fluentui` | `microsoft/fluentui` | `a2ebcfa86f7df5930fb4c75a4dde5b81c6d24860` | 1 |

The pins were compared with the upstream default branches on 2026-10-14. PowerShell fast-forwarded to upstream. Windows Terminal and vcpkg merged upstream while retaining their Aphrody histories. Roslyn was forked at the current upstream head. Fluent UI was already current with its Bun migration patch.

These are source/build inputs, not linked Bun components. PowerShell and Windows Terminal remain separate applications; Roslyn remains a separate LSP process; vcpkg remains a separate native dependency tool. The opt-in distribution boundary is `@aphrody/bun-windows-suite`, and builds route through `scripts/aphrody/windows-suite.ts`.

Vendoring does not by itself prove shell or terminal compatibility. PowerShell behavior, ConPTY/VT behavior, Windows Terminal builds and each optional payload retain separate gates.
