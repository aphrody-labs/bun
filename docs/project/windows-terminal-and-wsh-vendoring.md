# Windows Terminal and WSH source snapshots

This repository vendors two independent source snapshots for Windows shell and
terminal integration work:

- `vendor/terminal` is the Aphrody fork of `microsoft/terminal`, pinned at
  `f8b3cf09a114209be960a98a18a184d997f72a11`. Its upstream license is MIT and
  remains in `vendor/terminal/LICENSE`.
- `vendor/wsh` is the Aphrody fork of `Thewafflication/wsh`, pinned at
  `9b89404bf99212062050fb694b412f67f463405c`. Its upstream license is GPL-3.0
  and remains in `vendor/wsh/LICENSE`. Its `wsp` submodule points to
  `Thewafflication/wsp` at `2198ccab08f969a789448767fe7017b774369adc`; that
  repository declares no license, so its source is not copied or distributed.
  WSH build qualification therefore remains incomplete until that dependency's
  distribution rights and source are resolved.

The imported trees are source snapshots, not linked Bun components. Windows
Terminal remains a separate WinUI application and console host. WSH remains a
separate shell and embedding SDK. Bun's `bunsh` is a distinct, experimental
shell implementation; its current Windows integration and language coverage
do not establish full PowerShell compatibility. Rio is also a separate
terminal application. No Windows shell, terminal provider, Explorer, login
shell, service, or file association is changed by these source imports.

Do not combine GPL-3.0 WSH source into a distributed Bun binary without first
designing and reviewing the licensing and linking boundary. Keep each
component's license and notices with its source when building or distributing
it. No claim of binary integration, replacement, compatibility, or Windows
qualification follows from vendoring alone.

To refresh a snapshot, review the upstream diff, dependency changes, and
licenses first. Record the upstream commit here, retain all notices, and run
the component's own build and test gates before changing any integration.
