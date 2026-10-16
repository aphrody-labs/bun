# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3](https://github.com/oxc-project/oxc-markdown-parser/compare/oxc-markdown-parser-v0.0.2...oxc-markdown-parser-v0.0.3) - 2026-10-02

### Added

- _(parser)_ add lexical::table_delimiter_activates ([#28](https://github.com/oxc-project/oxc-markdown-parser/pull/28))

### Other

- _(parser)_ correct HtmlBlock end conditions ([#23](https://github.com/oxc-project/oxc-markdown-parser/pull/23))

## [0.0.2](https://github.com/oxc-project/oxc-markdown-parser/compare/oxc-markdown-parser-v0.0.1...oxc-markdown-parser-v0.0.2) - 2026-09-24

### Added

- _(parser)_ add `math_text_single_dollar`, off by default ([#21](https://github.com/oxc-project/oxc-markdown-parser/pull/21))

## [0.0.1](https://github.com/oxc-project/oxc-markdown-parser/compare/oxc-markdown-parser-v0.0.0...oxc-markdown-parser-v0.0.1) - 2026-09-18

### Fixed

- _(parser)_ interrupt paragraph only with complete liquid tag ([#18](https://github.com/oxc-project/oxc-markdown-parser/pull/18))

### Other

- _(parser)_ record how to handle JS-like part in MDX ([#16](https://github.com/oxc-project/oxc-markdown-parser/pull/16))

## [0.0.0](https://github.com/oxc-project/oxc-markdown-parser/releases/tag/oxc-markdown-parser-v0.0.0) - 2026-09-15

### Added

- _(parser)_ export more parser contract ([#11](https://github.com/oxc-project/oxc-markdown-parser/pull/11))
- _(parser)_ export inline::attention ([#10](https://github.com/oxc-project/oxc-markdown-parser/pull/10))
- _(parser)_ support container directive on any name-like fence ([#9](https://github.com/oxc-project/oxc-markdown-parser/pull/9))
- _(parser)_ expose `unicode`, add `decode::destination` ([#7](https://github.com/oxc-project/oxc-markdown-parser/pull/7))

### Fixed

- _(parser)_ extend blockquote span over trailing marker-only blank lines ([#8](https://github.com/oxc-project/oxc-markdown-parser/pull/8))

### Other

- _(parser)_ split modules ([#13](https://github.com/oxc-project/oxc-markdown-parser/pull/13))
- _(all)_ fix up ([#4](https://github.com/oxc-project/oxc-markdown-parser/pull/4))
- init
