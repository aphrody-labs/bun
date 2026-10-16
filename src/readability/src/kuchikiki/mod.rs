// Derived from brave/kuchikiki 0.8.9-speedreader (MIT, see LICENSE-kuchikiki).
// Absorbed into Bun: selector support removed, html5ever 0.40.

// Absorbed upstream API surface: not every item has a Bun caller.
#![allow(dead_code, unreachable_pub)]
//! Reference-counted HTML tree built by html5ever, used by readability.

mod attributes;
mod cell_extras;
pub mod iter;
mod node_data_ref;
mod parser;
mod serializer;
mod tree;

pub use parser::Sink;
pub use tree::{ElementData, NodeData, NodeRef};
