// SPDX-License-Identifier: Apache-2.0
//! Compatibility package for the canonical Bun DOM implementation.
pub use bun_browser_dom::*;

pub mod selector {
    pub use bun_browser_dom::selector::*;
    pub use bun_browser_dom::selector::{
        BunBrowserSelector as ObscuraSelector, BunBrowserSelectorParser as ObscuraSelectorParser,
    };
}

pub mod tree_sink {
    pub use bun_browser_dom::tree_sink::BunBrowserElemName as ObscuraElemName;
    pub use bun_browser_dom::tree_sink::*;
}
