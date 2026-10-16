# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.16](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.15...oxc-css-parser-v0.0.16) - 2026-10-02

### Added

- _(parser)_ add `block_contents` option to parse the root as a block's contents in css-in-md ([#179](https://github.com/oxc-project/oxc-css-parser/pull/179))

## [0.0.15](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.14...oxc-css-parser-v0.0.15) - 2026-09-10

### Fixed

- _(tokenizer,parser)_ misc fixes for less-test-suite ([#170](https://github.com/oxc-project/oxc-css-parser/pull/170))

## [0.0.14](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.13...oxc-css-parser-v0.0.14) - 2026-09-07

### Fixed

- _(parser)_ keep declarations and raw-prelude rules whole in CSS/Scss ([#166](https://github.com/oxc-project/oxc-css-parser/pull/166))

## [0.0.13](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.12...oxc-css-parser-v0.0.13) - 2026-08-31

### Added

- _(parser)_ accept declaration-shaped raw-prelude qualified rules in CSS ([#162](https://github.com/oxc-project/oxc-css-parser/pull/162))

### Fixed

- _(parser)_ accept case-insensitive dash-digit An+B forms (2N-1) ([#161](https://github.com/oxc-project/oxc-css-parser/pull/161))

## [0.0.12](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.11...oxc-css-parser-v0.0.12) - 2026-08-27

### Fixed

- _(parser)_ correct signed-value handling in Less operations and Sass calculations ([#158](https://github.com/oxc-project/oxc-css-parser/pull/158))

## [0.0.11](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.10...oxc-css-parser-v0.0.11) - 2026-08-04

### Fixed

- _(parser)_ fallback to raw tokens when unknown at prelude ([#146](https://github.com/oxc-project/oxc-css-parser/pull/146))

## [0.0.10](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.9...oxc-css-parser-v0.0.10) - 2026-07-30

### Fixed

- _(parser)_ stop leaking the internal error ([#140](https://github.com/oxc-project/oxc-css-parser/pull/140))
- _(parser)_ accept substituted container ([#139](https://github.com/oxc-project/oxc-css-parser/pull/139))

### Other

- _(ast)_ box the fat `SimpleSelector`, `MediaFeature` and `MediaQuery` variants ([#138](https://github.com/oxc-project/oxc-css-parser/pull/138))

## [0.0.9](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.8...oxc-css-parser-v0.0.9) - 2026-07-21

### Fixed

- _(parser)_ parse `:host` and `:host-context` args as selector list ([#130](https://github.com/oxc-project/oxc-css-parser/pull/130))

### Other

- _(ast)_ [**breaking**] remove unused `PseudoClassSelectorArgKind::CompoundSelector` ([#131](https://github.com/oxc-project/oxc-css-parser/pull/131))

## [0.0.8](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.7...oxc-css-parser-v0.0.8) - 2026-07-20

### Fixed

- _(parser)_ keep a newline-separated colon out of a statement-position placeholder declaration ([#129](https://github.com/oxc-project/oxc-css-parser/pull/129))

### Other

- update sponsor section

## [0.0.7](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.6...oxc-css-parser-v0.0.7) - 2026-07-12

### Added

- _(parser)_ accept functional pseudo-pages (@page::slot()) ([#121](https://github.com/oxc-project/oxc-css-parser/pull/121))
- _(parser)_ allow multiple idents in ::part() ([#119](https://github.com/oxc-project/oxc-css-parser/pull/119))
- _(parser)_ support scroll-driven keyframe timeline-range selectors ([#118](https://github.com/oxc-project/oxc-css-parser/pull/118))
- _(parser)_ accept empty @scope () roots and limits ([#117](https://github.com/oxc-project/oxc-css-parser/pull/117))
- _(parser)_ support name-only and general-enclosed @container queries ([#116](https://github.com/oxc-project/oxc-css-parser/pull/116))

### Fixed

- _(parser)_ don't report an error for @color-profile device-cmyk ([#120](https://github.com/oxc-project/oxc-css-parser/pull/120))

### Other

- replace guarded single-arm matches with let chains ([#113](https://github.com/oxc-project/oxc-css-parser/pull/113))
- remove redundant clone on Copy type Span ([#112](https://github.com/oxc-project/oxc-css-parser/pull/112))
- set MSRV to 1.95.0 ([#111](https://github.com/oxc-project/oxc-css-parser/pull/111))

## [0.0.6](https://github.com/oxc-project/oxc-css-parser/compare/oxc-css-parser-v0.0.5...oxc-css-parser-v0.0.6) - 2026-07-08

### Added

- _(parser)_ report spec parse errors via recoverable_errors ([#94](https://github.com/oxc-project/oxc-css-parser/pull/94))

### Other

- mention raffia fork ([#106](https://github.com/oxc-project/oxc-css-parser/pull/106))
- remove redundant clones on Copy types ([#100](https://github.com/oxc-project/oxc-css-parser/pull/100))
- _(parser)_ compact CSS token data ([#98](https://github.com/oxc-project/oxc-css-parser/pull/98))
- import ast_generated as a module instead of include! ([#97](https://github.com/oxc-project/oxc-css-parser/pull/97))
- place span first in ast structs ([#96](https://github.com/oxc-project/oxc-css-parser/pull/96))
- tokenize over bytes instead of CharIndices ([#95](https://github.com/oxc-project/oxc-css-parser/pull/95))
- remove changelog
- clean up codebase and fix svmin/svmax classification ([#89](https://github.com/oxc-project/oxc-css-parser/pull/89))
- normalize README sponsor section
