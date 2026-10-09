// SPDX-License-Identifier: Apache-2.0
//! Aphrody code-graph algorithms and extractors embedded in Bun.

#![deny(unsafe_code)]

pub mod analyze;
pub mod api;
pub mod error;
pub mod export;
pub mod extract;
pub mod graph;
pub mod query;
pub mod report;

pub use api::{GraphRequest, GraphResponse, execute, execute_json};
pub use error::{GraphError, Result};
pub use graph::{Confidence, Edge, Graph, GraphMeta, Node, NodeKind};
