// SPDX-License-Identifier: Apache-2.0
//! Canonical Rust integration source declarations from the Bun checkout.
//!
//! The exported macro declares a module in the consumer crate. Its `crate::`
//! references and sibling modules therefore retain the original consumer context.
//! This provider does not compile the transferred application owners or claim
//! runtime parity for their engines. Consumers retain their dependencies/features.
//!
//! ```
//! aphrody_web_source::module!("crates/shell/web/src/wire.rs", pub mod wire);
//! assert_eq!(wire::data_frame(b"x"), r#"{"bytes":[120],"type":"data"}"#);
//! ```
//!
//! Unknown source paths fail at compile time rather than selecting a fallback.
//!
//! ```compile_fail
//! aphrody_web_source::module!("crates/nonexistent/src/web.rs", pub mod web);
//! ```

include!(concat!(env!("OUT_DIR"), "/modules.rs"));

/// Directory of the source provider used by this build.
#[must_use]
pub fn source_root() -> &'static std::path::Path {
    std::path::Path::new(SOURCE_ROOT)
}

#[cfg(test)]
const CONSUMER_CONTEXT: u32 = 42;

#[cfg(test)]
fixture_module!("consumer-context", pub(crate) mod fixture);

#[cfg(test)]
#[allow(clippy::duplicate_mod)] // Exercise two consumer visibility forms.
mod tests {
    fixture_module!("consumer-context", mod private_fixture);

    #[test]
    fn declarations_preserve_consumer_context_and_visibility() {
        assert_eq!(super::fixture::consumer_value(), 42);
        assert_eq!(private_fixture::consumer_value(), 42);
    }

    #[test]
    fn paths_are_normalized_and_resolve_to_canonical_sources() {
        assert!(!super::SOURCE_PATHS.is_empty());
        for key in super::SOURCE_PATHS {
            assert!(!key.as_bytes().contains(&b'\\'));
            assert!(
                super::source_root()
                    .join("integrations")
                    .join(key)
                    .is_file()
            );
        }
    }

    #[test]
    fn text_sources_are_embedded_from_the_canonical_provider() {
        const SCRIPT: &str = text!("crates/tauri/aphrody-tauri/scripts/freeze_prototype.js");
        assert!(SCRIPT.contains("Object.freeze(Object.prototype)"));
        assert!(SCRIPT.contains("SPDX-License-Identifier: MIT"));
    }
}
