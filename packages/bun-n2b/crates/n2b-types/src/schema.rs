// @generated — DO NOT EDIT MANUALLY.
// Regenerate with: bun packages/bun-n2b/scripts/generate-schema-types.ts
// Source of truth: packages/bun-n2b/crates/n2b-types/schema/v2.json

#![allow(clippy::redundant_closure_call)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = "Bun↔Node compatibility metadata of the host module — Phase 3+. Optional (rétro-compat). Le champ status pilote la sévérité dérivée."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Compat {
    #[doc = "Polyfill @bun++/node-* recommandé quand status=missing. Optionnel."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub bunpp: ::std::option::Option<::std::string::String>,
    #[doc = "Équivalent Bun natif suggéré (ex: 'bun:sqlite', 'Bun.serve')."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub equivalent: ::std::option::Option<::std::string::String>,
    #[doc = "Sous-APIs documentées comme non implémentées par Bun. Vide quand status=full."]
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub missing_apis: ::std::vec::Vec<::std::string::String>,
    #[doc = "Nom du module Node concerné (sans le préfixe node:)."]
    pub module: ::std::string::String,
    #[doc = "Statut de couverture Bun du module Node host. full = tout passe, partial = bug-free sur les chemins courants, missing = pas d'équivalent natif."]
    pub status: CompatStatus,
}
impl Compat {
    pub fn builder() -> builder::Compat {
        Default::default()
    }
}
#[doc = "Statut de couverture Bun du module Node host. full = tout passe, partial = bug-free sur les chemins courants, missing = pas d'équivalent natif."]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CompatStatus {
    #[serde(rename = "full")]
    Full,
    #[serde(rename = "partial")]
    Partial,
    #[serde(rename = "missing")]
    Missing,
}
impl ::std::fmt::Display for CompatStatus {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Full => f.write_str("full"),
            Self::Partial => f.write_str("partial"),
            Self::Missing => f.write_str("missing"),
        }
    }
}
impl ::std::str::FromStr for CompatStatus {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "full" => Ok(Self::Full),
            "partial" => Ok(Self::Partial),
            "missing" => Ok(Self::Missing),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CompatStatus {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CompatStatus {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "Source context around a finding: up to 3 lines before, the finding's line, up to 3 lines after. Consumed by LLM/IDE integrations."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Context {
    pub after: ::std::vec::Vec<::std::string::String>,
    pub before: ::std::vec::Vec<::std::string::String>,
    pub line: ::std::string::String,
}
impl Context {
    pub fn builder() -> builder::Context {
        Default::default()
    }
}
#[doc = "`FileFix`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FileFix {
    #[doc = "True if the file content differs from its pre-scan state (only in --fix / --aggressive / --migrate modes)."]
    pub changed: bool,
    pub findings: ::std::vec::Vec<Finding>,
    #[doc = "Relative path to the scanned root."]
    pub path: ::std::string::String,
}
impl FileFix {
    pub fn builder() -> builder::FileFix {
        Default::default()
    }
}
#[doc = "`Finding`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Finding {
    #[doc = "True when the rule is only applied by --aggressive. Omitted when false/unset."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub aggressive: ::std::option::Option<bool>,
    #[doc = "True when the rule can be auto-applied by --fix."]
    pub autofix: bool,
    #[doc = "Top-level category derived from rule_id prefix."]
    pub category: ::std::string::String,
    pub col: ::std::num::NonZeroU64,
    #[doc = "Phase 3+ : statut de compat Bun du module hôte. Présent uniquement sur les findings imports/node-* et api/node-*. Optionnel (rétro-compat schema_version=2)."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub compat: ::std::option::Option<Compat>,
    #[doc = "Heuristic confidence 0..1."]
    pub confidence: f64,
    pub context: Context,
    #[doc = "Stable Bun (or external) docs URL for this rule."]
    pub docs_url: ::std::string::String,
    #[doc = "Byte offset into the scanned file of the finding end (UTF-8)."]
    pub end_byte: u64,
    pub line: ::std::num::NonZeroU64,
    pub message: ::std::string::String,
    #[doc = "Exact text that matched (from source)."]
    pub original: ::std::string::String,
    #[doc = "Suggested replacement. Omitted entirely when no replacement is known."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub replacement: ::std::option::Option<::std::string::String>,
    #[doc = "Rule identifier — slash-separated category/name (e.g. 'api/fs-readFileSync'). Immutable: consumers parse this."]
    pub rule_id: ::std::string::String,
    pub severity: Severity,
    #[doc = "Byte offset into the scanned file of the finding start (UTF-8)."]
    pub start_byte: u64,
}
impl Finding {
    pub fn builder() -> builder::Finding {
        Default::default()
    }
}
#[doc = "Side effects of `--migrate`, in execution order. With `--dry-run` nothing was executed."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MigrationPlan {
    pub dry_run: bool,
    pub steps: ::std::vec::Vec<MigrationStep>,
    #[doc = "What Bun cannot take over (unsupported pnpm settings, ambiguous patches, ...)."]
    pub warnings: ::std::vec::Vec<::std::string::String>,
}
impl MigrationPlan {
    pub fn builder() -> builder::MigrationPlan {
        Default::default()
    }
}
#[doc = "`MigrationStep`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MigrationStep {
    pub action: MigrationStepAction,
    pub detail: ::std::string::String,
    #[doc = "File relative to the root (`write`/`delete`)."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub path: ::std::option::Option<::std::string::String>,
}
impl MigrationStep {
    pub fn builder() -> builder::MigrationStep {
        Default::default()
    }
}
#[doc = "`MigrationStepAction`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum MigrationStepAction {
    #[serde(rename = "write")]
    Write,
    #[serde(rename = "delete")]
    Delete,
    #[serde(rename = "run")]
    Run,
}
impl ::std::fmt::Display for MigrationStepAction {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Write => f.write_str("write"),
            Self::Delete => f.write_str("delete"),
            Self::Run => f.write_str("run"),
        }
    }
}
impl ::std::str::FromStr for MigrationStepAction {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "write" => Ok(Self::Write),
            "delete" => Ok(Self::Delete),
            "run" => Ok(Self::Run),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for MigrationStepAction {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for MigrationStepAction {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`Mode`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum Mode {
    #[serde(rename = "check")]
    Check,
    #[serde(rename = "fix")]
    Fix,
    #[serde(rename = "aggressive")]
    Aggressive,
}
impl ::std::fmt::Display for Mode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Check => f.write_str("check"),
            Self::Fix => f.write_str("fix"),
            Self::Aggressive => f.write_str("aggressive"),
        }
    }
}
impl ::std::str::FromStr for Mode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "check" => Ok(Self::Check),
            "fix" => Ok(Self::Fix),
            "aggressive" => Ok(Self::Aggressive),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for Mode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for Mode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "Payload schema for n2b scan results (JSON reports). Mirrors the JSON produced by `n2b --report=json`. JSONL mode wraps each object with a `type` discriminator (\"meta\" for the header, \"finding\" for subsequent lines)."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct N2bReport {
    pub files: ::std::vec::Vec<FileFix>,
    pub files_scanned: u64,
    pub findings_total: u64,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub migration_plan: ::std::option::Option<MigrationPlan>,
    pub mode: Mode,
    #[doc = "Migration report card, present with `--migrate`."]
    #[serde(default, skip_serializing_if = "::serde_json::Map::is_empty")]
    pub report_card: ::serde_json::Map<::std::string::String, ::serde_json::Value>,
    #[doc = "Absolute path of the scanned root."]
    pub root: ::std::string::String,
    #[doc = "URL to this schema."]
    #[serde(rename = "$schema", skip_serializing_if = "::std::option::Option::is_none")]
    pub schema: ::std::option::Option<::std::string::String>,
    #[doc = "Schema version, bumped on breaking changes."]
    pub schema_version: N2bReportSchemaVersion,
    #[doc = "Git ref of an incremental scan (`--since`): only files changed in `<ref>...HEAD`, local edits, untracked files and root manifests were scanned."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub since: ::std::option::Option<::std::string::String>,
    #[doc = "Tool name (historically \"node2bun\")."]
    pub tool: ::std::string::String,
    #[doc = "n2b binary semver."]
    pub version: ::std::string::String,
}
impl N2bReport {
    pub fn builder() -> builder::N2bReport {
        Default::default()
    }
}
#[doc = "Schema version, bumped on breaking changes."]
#[derive(:: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct N2bReportSchemaVersion(i64);
impl ::std::ops::Deref for N2bReportSchemaVersion {
    type Target = i64;
    fn deref(&self) -> &i64 {
        &self.0
    }
}
impl ::std::convert::From<N2bReportSchemaVersion> for i64 {
    fn from(value: N2bReportSchemaVersion) -> Self {
        value.0
    }
}
impl ::std::convert::TryFrom<i64> for N2bReportSchemaVersion {
    type Error = self::error::ConversionError;
    fn try_from(value: i64) -> ::std::result::Result<Self, self::error::ConversionError> {
        if ![2_i64].contains(&value) { Err("invalid value".into()) } else { Ok(Self(value)) }
    }
}
impl<'de> ::serde::Deserialize<'de> for N2bReportSchemaVersion {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        Self::try_from(<i64>::deserialize(deserializer)?)
            .map_err(|e| <D::Error as ::serde::de::Error>::custom(e.to_string()))
    }
}
#[doc = "`Severity`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum Severity {
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "warn")]
    Warn,
    #[serde(rename = "info")]
    Info,
}
impl ::std::fmt::Display for Severity {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Error => f.write_str("error"),
            Self::Warn => f.write_str("warn"),
            Self::Info => f.write_str("info"),
        }
    }
}
impl ::std::str::FromStr for Severity {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "error" => Ok(Self::Error),
            "warn" => Ok(Self::Warn),
            "info" => Ok(Self::Info),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for Severity {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for Severity {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = " Types for composing complex structures."]
pub mod builder {
    #[derive(Clone, Debug)]
    pub struct Compat {
        bunpp: ::std::result::Result<
            ::std::option::Option<::std::string::String>,
            ::std::string::String,
        >,
        equivalent: ::std::result::Result<
            ::std::option::Option<::std::string::String>,
            ::std::string::String,
        >,
        missing_apis:
            ::std::result::Result<::std::vec::Vec<::std::string::String>, ::std::string::String>,
        module: ::std::result::Result<::std::string::String, ::std::string::String>,
        status: ::std::result::Result<super::CompatStatus, ::std::string::String>,
    }
    impl ::std::default::Default for Compat {
        fn default() -> Self {
            Self {
                bunpp: Ok(Default::default()),
                equivalent: Ok(Default::default()),
                missing_apis: Ok(Default::default()),
                module: Err("no value supplied for module".to_string()),
                status: Err("no value supplied for status".to_string()),
            }
        }
    }
    impl Compat {
        pub fn bunpp<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::option::Option<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.bunpp = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for bunpp: {e}"));
            self
        }
        pub fn equivalent<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::option::Option<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.equivalent = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for equivalent: {e}"));
            self
        }
        pub fn missing_apis<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::vec::Vec<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.missing_apis = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for missing_apis: {e}"));
            self
        }
        pub fn module<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.module = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for module: {e}"));
            self
        }
        pub fn status<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<super::CompatStatus>,
            T::Error: ::std::fmt::Display,
        {
            self.status = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for status: {e}"));
            self
        }
    }
    impl ::std::convert::TryFrom<Compat> for super::Compat {
        type Error = super::error::ConversionError;
        fn try_from(value: Compat) -> ::std::result::Result<Self, super::error::ConversionError> {
            Ok(Self {
                bunpp: value.bunpp?,
                equivalent: value.equivalent?,
                missing_apis: value.missing_apis?,
                module: value.module?,
                status: value.status?,
            })
        }
    }
    impl ::std::convert::From<super::Compat> for Compat {
        fn from(value: super::Compat) -> Self {
            Self {
                bunpp: Ok(value.bunpp),
                equivalent: Ok(value.equivalent),
                missing_apis: Ok(value.missing_apis),
                module: Ok(value.module),
                status: Ok(value.status),
            }
        }
    }
    #[derive(Clone, Debug)]
    pub struct Context {
        after: ::std::result::Result<::std::vec::Vec<::std::string::String>, ::std::string::String>,
        before:
            ::std::result::Result<::std::vec::Vec<::std::string::String>, ::std::string::String>,
        line: ::std::result::Result<::std::string::String, ::std::string::String>,
    }
    impl ::std::default::Default for Context {
        fn default() -> Self {
            Self {
                after: Err("no value supplied for after".to_string()),
                before: Err("no value supplied for before".to_string()),
                line: Err("no value supplied for line".to_string()),
            }
        }
    }
    impl Context {
        pub fn after<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::vec::Vec<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.after = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for after: {e}"));
            self
        }
        pub fn before<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::vec::Vec<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.before = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for before: {e}"));
            self
        }
        pub fn line<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.line = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for line: {e}"));
            self
        }
    }
    impl ::std::convert::TryFrom<Context> for super::Context {
        type Error = super::error::ConversionError;
        fn try_from(value: Context) -> ::std::result::Result<Self, super::error::ConversionError> {
            Ok(Self { after: value.after?, before: value.before?, line: value.line? })
        }
    }
    impl ::std::convert::From<super::Context> for Context {
        fn from(value: super::Context) -> Self {
            Self { after: Ok(value.after), before: Ok(value.before), line: Ok(value.line) }
        }
    }
    #[derive(Clone, Debug)]
    pub struct FileFix {
        changed: ::std::result::Result<bool, ::std::string::String>,
        findings: ::std::result::Result<::std::vec::Vec<super::Finding>, ::std::string::String>,
        path: ::std::result::Result<::std::string::String, ::std::string::String>,
    }
    impl ::std::default::Default for FileFix {
        fn default() -> Self {
            Self {
                changed: Err("no value supplied for changed".to_string()),
                findings: Err("no value supplied for findings".to_string()),
                path: Err("no value supplied for path".to_string()),
            }
        }
    }
    impl FileFix {
        pub fn changed<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<bool>,
            T::Error: ::std::fmt::Display,
        {
            self.changed = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for changed: {e}"));
            self
        }
        pub fn findings<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::vec::Vec<super::Finding>>,
            T::Error: ::std::fmt::Display,
        {
            self.findings = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for findings: {e}"));
            self
        }
        pub fn path<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.path = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for path: {e}"));
            self
        }
    }
    impl ::std::convert::TryFrom<FileFix> for super::FileFix {
        type Error = super::error::ConversionError;
        fn try_from(value: FileFix) -> ::std::result::Result<Self, super::error::ConversionError> {
            Ok(Self { changed: value.changed?, findings: value.findings?, path: value.path? })
        }
    }
    impl ::std::convert::From<super::FileFix> for FileFix {
        fn from(value: super::FileFix) -> Self {
            Self { changed: Ok(value.changed), findings: Ok(value.findings), path: Ok(value.path) }
        }
    }
    #[derive(Clone, Debug)]
    pub struct Finding {
        aggressive: ::std::result::Result<::std::option::Option<bool>, ::std::string::String>,
        autofix: ::std::result::Result<bool, ::std::string::String>,
        category: ::std::result::Result<::std::string::String, ::std::string::String>,
        col: ::std::result::Result<::std::num::NonZeroU64, ::std::string::String>,
        compat: ::std::result::Result<::std::option::Option<super::Compat>, ::std::string::String>,
        confidence: ::std::result::Result<f64, ::std::string::String>,
        context: ::std::result::Result<super::Context, ::std::string::String>,
        docs_url: ::std::result::Result<::std::string::String, ::std::string::String>,
        end_byte: ::std::result::Result<u64, ::std::string::String>,
        line: ::std::result::Result<::std::num::NonZeroU64, ::std::string::String>,
        message: ::std::result::Result<::std::string::String, ::std::string::String>,
        original: ::std::result::Result<::std::string::String, ::std::string::String>,
        replacement: ::std::result::Result<
            ::std::option::Option<::std::string::String>,
            ::std::string::String,
        >,
        rule_id: ::std::result::Result<::std::string::String, ::std::string::String>,
        severity: ::std::result::Result<super::Severity, ::std::string::String>,
        start_byte: ::std::result::Result<u64, ::std::string::String>,
    }
    impl ::std::default::Default for Finding {
        fn default() -> Self {
            Self {
                aggressive: Ok(Default::default()),
                autofix: Err("no value supplied for autofix".to_string()),
                category: Err("no value supplied for category".to_string()),
                col: Err("no value supplied for col".to_string()),
                compat: Ok(Default::default()),
                confidence: Err("no value supplied for confidence".to_string()),
                context: Err("no value supplied for context".to_string()),
                docs_url: Err("no value supplied for docs_url".to_string()),
                end_byte: Err("no value supplied for end_byte".to_string()),
                line: Err("no value supplied for line".to_string()),
                message: Err("no value supplied for message".to_string()),
                original: Err("no value supplied for original".to_string()),
                replacement: Ok(Default::default()),
                rule_id: Err("no value supplied for rule_id".to_string()),
                severity: Err("no value supplied for severity".to_string()),
                start_byte: Err("no value supplied for start_byte".to_string()),
            }
        }
    }
    impl Finding {
        pub fn aggressive<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::option::Option<bool>>,
            T::Error: ::std::fmt::Display,
        {
            self.aggressive = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for aggressive: {e}"));
            self
        }
        pub fn autofix<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<bool>,
            T::Error: ::std::fmt::Display,
        {
            self.autofix = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for autofix: {e}"));
            self
        }
        pub fn category<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.category = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for category: {e}"));
            self
        }
        pub fn col<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::num::NonZeroU64>,
            T::Error: ::std::fmt::Display,
        {
            self.col = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for col: {e}"));
            self
        }
        pub fn compat<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::option::Option<super::Compat>>,
            T::Error: ::std::fmt::Display,
        {
            self.compat = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for compat: {e}"));
            self
        }
        pub fn confidence<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<f64>,
            T::Error: ::std::fmt::Display,
        {
            self.confidence = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for confidence: {e}"));
            self
        }
        pub fn context<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<super::Context>,
            T::Error: ::std::fmt::Display,
        {
            self.context = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for context: {e}"));
            self
        }
        pub fn docs_url<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.docs_url = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for docs_url: {e}"));
            self
        }
        pub fn end_byte<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<u64>,
            T::Error: ::std::fmt::Display,
        {
            self.end_byte = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for end_byte: {e}"));
            self
        }
        pub fn line<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::num::NonZeroU64>,
            T::Error: ::std::fmt::Display,
        {
            self.line = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for line: {e}"));
            self
        }
        pub fn message<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.message = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for message: {e}"));
            self
        }
        pub fn original<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.original = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for original: {e}"));
            self
        }
        pub fn replacement<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::option::Option<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.replacement = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for replacement: {e}"));
            self
        }
        pub fn rule_id<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.rule_id = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for rule_id: {e}"));
            self
        }
        pub fn severity<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<super::Severity>,
            T::Error: ::std::fmt::Display,
        {
            self.severity = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for severity: {e}"));
            self
        }
        pub fn start_byte<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<u64>,
            T::Error: ::std::fmt::Display,
        {
            self.start_byte = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for start_byte: {e}"));
            self
        }
    }
    impl ::std::convert::TryFrom<Finding> for super::Finding {
        type Error = super::error::ConversionError;
        fn try_from(value: Finding) -> ::std::result::Result<Self, super::error::ConversionError> {
            Ok(Self {
                aggressive: value.aggressive?,
                autofix: value.autofix?,
                category: value.category?,
                col: value.col?,
                compat: value.compat?,
                confidence: value.confidence?,
                context: value.context?,
                docs_url: value.docs_url?,
                end_byte: value.end_byte?,
                line: value.line?,
                message: value.message?,
                original: value.original?,
                replacement: value.replacement?,
                rule_id: value.rule_id?,
                severity: value.severity?,
                start_byte: value.start_byte?,
            })
        }
    }
    impl ::std::convert::From<super::Finding> for Finding {
        fn from(value: super::Finding) -> Self {
            Self {
                aggressive: Ok(value.aggressive),
                autofix: Ok(value.autofix),
                category: Ok(value.category),
                col: Ok(value.col),
                compat: Ok(value.compat),
                confidence: Ok(value.confidence),
                context: Ok(value.context),
                docs_url: Ok(value.docs_url),
                end_byte: Ok(value.end_byte),
                line: Ok(value.line),
                message: Ok(value.message),
                original: Ok(value.original),
                replacement: Ok(value.replacement),
                rule_id: Ok(value.rule_id),
                severity: Ok(value.severity),
                start_byte: Ok(value.start_byte),
            }
        }
    }
    #[derive(Clone, Debug)]
    pub struct MigrationPlan {
        dry_run: ::std::result::Result<bool, ::std::string::String>,
        steps: ::std::result::Result<::std::vec::Vec<super::MigrationStep>, ::std::string::String>,
        warnings:
            ::std::result::Result<::std::vec::Vec<::std::string::String>, ::std::string::String>,
    }
    impl ::std::default::Default for MigrationPlan {
        fn default() -> Self {
            Self {
                dry_run: Err("no value supplied for dry_run".to_string()),
                steps: Err("no value supplied for steps".to_string()),
                warnings: Err("no value supplied for warnings".to_string()),
            }
        }
    }
    impl MigrationPlan {
        pub fn dry_run<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<bool>,
            T::Error: ::std::fmt::Display,
        {
            self.dry_run = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for dry_run: {e}"));
            self
        }
        pub fn steps<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::vec::Vec<super::MigrationStep>>,
            T::Error: ::std::fmt::Display,
        {
            self.steps = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for steps: {e}"));
            self
        }
        pub fn warnings<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::vec::Vec<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.warnings = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for warnings: {e}"));
            self
        }
    }
    impl ::std::convert::TryFrom<MigrationPlan> for super::MigrationPlan {
        type Error = super::error::ConversionError;
        fn try_from(
            value: MigrationPlan,
        ) -> ::std::result::Result<Self, super::error::ConversionError> {
            Ok(Self { dry_run: value.dry_run?, steps: value.steps?, warnings: value.warnings? })
        }
    }
    impl ::std::convert::From<super::MigrationPlan> for MigrationPlan {
        fn from(value: super::MigrationPlan) -> Self {
            Self {
                dry_run: Ok(value.dry_run),
                steps: Ok(value.steps),
                warnings: Ok(value.warnings),
            }
        }
    }
    #[derive(Clone, Debug)]
    pub struct MigrationStep {
        action: ::std::result::Result<super::MigrationStepAction, ::std::string::String>,
        detail: ::std::result::Result<::std::string::String, ::std::string::String>,
        path: ::std::result::Result<
            ::std::option::Option<::std::string::String>,
            ::std::string::String,
        >,
    }
    impl ::std::default::Default for MigrationStep {
        fn default() -> Self {
            Self {
                action: Err("no value supplied for action".to_string()),
                detail: Err("no value supplied for detail".to_string()),
                path: Ok(Default::default()),
            }
        }
    }
    impl MigrationStep {
        pub fn action<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<super::MigrationStepAction>,
            T::Error: ::std::fmt::Display,
        {
            self.action = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for action: {e}"));
            self
        }
        pub fn detail<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.detail = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for detail: {e}"));
            self
        }
        pub fn path<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::option::Option<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.path = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for path: {e}"));
            self
        }
    }
    impl ::std::convert::TryFrom<MigrationStep> for super::MigrationStep {
        type Error = super::error::ConversionError;
        fn try_from(
            value: MigrationStep,
        ) -> ::std::result::Result<Self, super::error::ConversionError> {
            Ok(Self { action: value.action?, detail: value.detail?, path: value.path? })
        }
    }
    impl ::std::convert::From<super::MigrationStep> for MigrationStep {
        fn from(value: super::MigrationStep) -> Self {
            Self { action: Ok(value.action), detail: Ok(value.detail), path: Ok(value.path) }
        }
    }
    #[derive(Clone, Debug)]
    pub struct N2bReport {
        files: ::std::result::Result<::std::vec::Vec<super::FileFix>, ::std::string::String>,
        files_scanned: ::std::result::Result<u64, ::std::string::String>,
        findings_total: ::std::result::Result<u64, ::std::string::String>,
        migration_plan: ::std::result::Result<
            ::std::option::Option<super::MigrationPlan>,
            ::std::string::String,
        >,
        mode: ::std::result::Result<super::Mode, ::std::string::String>,
        report_card: ::std::result::Result<
            ::serde_json::Map<::std::string::String, ::serde_json::Value>,
            ::std::string::String,
        >,
        root: ::std::result::Result<::std::string::String, ::std::string::String>,
        schema: ::std::result::Result<
            ::std::option::Option<::std::string::String>,
            ::std::string::String,
        >,
        schema_version: ::std::result::Result<super::N2bReportSchemaVersion, ::std::string::String>,
        since: ::std::result::Result<
            ::std::option::Option<::std::string::String>,
            ::std::string::String,
        >,
        tool: ::std::result::Result<::std::string::String, ::std::string::String>,
        version: ::std::result::Result<::std::string::String, ::std::string::String>,
    }
    impl ::std::default::Default for N2bReport {
        fn default() -> Self {
            Self {
                files: Err("no value supplied for files".to_string()),
                files_scanned: Err("no value supplied for files_scanned".to_string()),
                findings_total: Err("no value supplied for findings_total".to_string()),
                migration_plan: Ok(Default::default()),
                mode: Err("no value supplied for mode".to_string()),
                report_card: Ok(Default::default()),
                root: Err("no value supplied for root".to_string()),
                schema: Ok(Default::default()),
                schema_version: Err("no value supplied for schema_version".to_string()),
                since: Ok(Default::default()),
                tool: Err("no value supplied for tool".to_string()),
                version: Err("no value supplied for version".to_string()),
            }
        }
    }
    impl N2bReport {
        pub fn files<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::vec::Vec<super::FileFix>>,
            T::Error: ::std::fmt::Display,
        {
            self.files = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for files: {e}"));
            self
        }
        pub fn files_scanned<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<u64>,
            T::Error: ::std::fmt::Display,
        {
            self.files_scanned = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for files_scanned: {e}"));
            self
        }
        pub fn findings_total<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<u64>,
            T::Error: ::std::fmt::Display,
        {
            self.findings_total = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for findings_total: {e}"));
            self
        }
        pub fn migration_plan<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::option::Option<super::MigrationPlan>>,
            T::Error: ::std::fmt::Display,
        {
            self.migration_plan = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for migration_plan: {e}"));
            self
        }
        pub fn mode<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<super::Mode>,
            T::Error: ::std::fmt::Display,
        {
            self.mode = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for mode: {e}"));
            self
        }
        pub fn report_card<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<
                    ::serde_json::Map<::std::string::String, ::serde_json::Value>,
                >,
            T::Error: ::std::fmt::Display,
        {
            self.report_card = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for report_card: {e}"));
            self
        }
        pub fn root<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.root = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for root: {e}"));
            self
        }
        pub fn schema<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::option::Option<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.schema = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for schema: {e}"));
            self
        }
        pub fn schema_version<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<super::N2bReportSchemaVersion>,
            T::Error: ::std::fmt::Display,
        {
            self.schema_version = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for schema_version: {e}"));
            self
        }
        pub fn since<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::option::Option<::std::string::String>>,
            T::Error: ::std::fmt::Display,
        {
            self.since = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for since: {e}"));
            self
        }
        pub fn tool<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.tool = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for tool: {e}"));
            self
        }
        pub fn version<T>(mut self, value: T) -> Self
        where
            T: ::std::convert::TryInto<::std::string::String>,
            T::Error: ::std::fmt::Display,
        {
            self.version = value
                .try_into()
                .map_err(|e| format!("error converting supplied value for version: {e}"));
            self
        }
    }
    impl ::std::convert::TryFrom<N2bReport> for super::N2bReport {
        type Error = super::error::ConversionError;
        fn try_from(
            value: N2bReport,
        ) -> ::std::result::Result<Self, super::error::ConversionError> {
            Ok(Self {
                files: value.files?,
                files_scanned: value.files_scanned?,
                findings_total: value.findings_total?,
                migration_plan: value.migration_plan?,
                mode: value.mode?,
                report_card: value.report_card?,
                root: value.root?,
                schema: value.schema?,
                schema_version: value.schema_version?,
                since: value.since?,
                tool: value.tool?,
                version: value.version?,
            })
        }
    }
    impl ::std::convert::From<super::N2bReport> for N2bReport {
        fn from(value: super::N2bReport) -> Self {
            Self {
                files: Ok(value.files),
                files_scanned: Ok(value.files_scanned),
                findings_total: Ok(value.findings_total),
                migration_plan: Ok(value.migration_plan),
                mode: Ok(value.mode),
                report_card: Ok(value.report_card),
                root: Ok(value.root),
                schema: Ok(value.schema),
                schema_version: Ok(value.schema_version),
                since: Ok(value.since),
                tool: Ok(value.tool),
                version: Ok(value.version),
            }
        }
    }
}
#[doc = " Error types."]
pub mod error {
    #[doc = r" Error from a `TryFrom` or `FromStr` implementation."]
    pub struct ConversionError(::std::borrow::Cow<'static, str>);
    impl ::std::error::Error for ConversionError {}
    impl ::std::fmt::Display for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Display::fmt(&self.0, f)
        }
    }
    impl ::std::fmt::Debug for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Debug::fmt(&self.0, f)
        }
    }
    impl From<&'static str> for ConversionError {
        fn from(value: &'static str) -> Self {
            Self(value.into())
        }
    }
    impl From<String> for ConversionError {
        fn from(value: String) -> Self {
            Self(value.into())
        }
    }
}
