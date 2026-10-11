# Windows Terminal and PowerShell source snapshots

This repository vendors source snapshots of the Aphrody forks for Windows
terminal and PowerShell work:

- `vendor/terminal` is the Aphrody fork of `microsoft/terminal`, pinned at
  `f8b3cf09a114209be960a98a18a184d997f72a11`. Its upstream license is MIT and
  remains in `vendor/terminal/LICENSE`.
- `vendor/powershell` is the Aphrody fork of `PowerShell/PowerShell`, pinned at
  `5d871eb5e02cbcc8ecb03fce4b24d7f48bf97c26`. Its upstream license is MIT and
  remains in `vendor/powershell/LICENSE.txt`.

These imports are source snapshots, not linked Bun components. Windows
Terminal and PowerShell still build and run as separate applications. Bun's
`bunsh` is an experimental shell with a different language and incomplete
PowerShell compatibility; its current Windows tests do not establish a full
replacement. Rio is another separate terminal application. Vendoring alone
does not replace the terminal provider, PowerShell, Explorer, login shell,
services, or file associations, and no such Windows setting is changed here.

Review the upstream diff, dependencies, licenses, and native Windows build and
test requirements before updating these snapshots or wiring them into a Bun
distribution. Keep each component's license and notices with its source. Do
not claim integration, replacement, compatibility, or Windows qualification
until those behaviors pass their own gates.
