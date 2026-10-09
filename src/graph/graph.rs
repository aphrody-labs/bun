// SPDX-License-Identifier: Apache-2.0
// Modified for Bun; see provenance.json for the owner revision and adaptations.
//! The owner in-memory graph, independent of database and profile storage.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// What a node represents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    /// A symbol or file of source code.
    Code,
    /// A document.
    Document,
    /// A concept.
    Concept,
    /// A design rationale.
    Rationale,
}

impl NodeKind {
    /// Database and `graph.json` label.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Code => "code",
            Self::Document => "document",
            Self::Concept => "concept",
            Self::Rationale => "rationale",
        }
    }
}

/// How an edge was established.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Confidence {
    /// Read directly from the syntax tree.
    #[serde(rename = "EXTRACTED")]
    Extracted,
    /// Resolved by a heuristic (name matching, call resolution).
    #[serde(rename = "INFERRED")]
    Inferred,
    /// Several equally plausible targets.
    #[serde(rename = "AMBIGUOUS")]
    Ambiguous,
}

impl Confidence {
    /// Database and `graph.json` label.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Extracted => "EXTRACTED",
            Self::Inferred => "INFERRED",
            Self::Ambiguous => "AMBIGUOUS",
        }
    }
}

/// A graph node.
#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    /// Stable id (unique in the graph).
    pub id: String,
    /// Display label.
    pub label: String,
    /// Lower-case label used for matching.
    pub norm_label: String,
    /// Kind.
    pub kind: NodeKind,
    /// Source file.
    pub file: Option<String>,
    /// Location (`L132`).
    pub loc: Option<String>,
    /// Language.
    pub lang: Option<String>,
    /// Community id.
    pub community: Option<i64>,
    /// Community name.
    pub community_name: Option<String>,
    /// Package of the node file: Rust crate identifier or npm package name.
    pub package: Option<String>,
}

impl Node {
    /// A code node with the given id, label and file.
    #[must_use]
    pub fn code(id: &str, label: &str, file: Option<&str>) -> Self {
        Self {
            id: id.to_owned(),
            label: label.to_owned(),
            norm_label: label.to_lowercase(),
            kind: NodeKind::Code,
            file: file.map(str::to_owned),
            loc: None,
            lang: None,
            community: None,
            community_name: None,
            package: None,
        }
    }
}

/// A directed edge between two node indices.
#[derive(Debug, Clone, PartialEq)]
pub struct Edge {
    /// Source node index.
    pub src: usize,
    /// Target node index.
    pub dst: usize,
    /// Relation (`calls`, `contains`...).
    pub relation: String,
    /// Confidence class.
    pub confidence: Confidence,
    /// Confidence score in `[0, 1]`.
    pub score: f64,
    /// File of the reference.
    pub file: Option<String>,
    /// Location of the reference.
    pub loc: Option<String>,
    /// Weight.
    pub weight: f64,
    /// Context (`call`, `import`...).
    pub context: Option<String>,
}

impl Edge {
    /// An EXTRACTED edge of weight 1 and score 1.
    #[must_use]
    pub fn extracted(src: usize, dst: usize, relation: &str) -> Self {
        Self {
            src,
            dst,
            relation: relation.to_owned(),
            confidence: Confidence::Extracted,
            score: 1.0,
            file: None,
            loc: None,
            weight: 1.0,
            context: None,
        }
    }
}

/// Facts about the tree a graph was built from.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GraphMeta {
    /// Absolute root of the tree.
    pub root: Option<String>,
    /// `HEAD` of the tree at build time.
    pub built_at_commit: Option<String>,
}

/// A graph with adjacency lists in both directions.
#[derive(Debug, Clone, Default)]
pub struct Graph {
    /// Nodes, indexed by position.
    pub nodes: Vec<Node>,
    /// Edges.
    pub edges: Vec<Edge>,
    /// Source facts provided by the selected graph snapshot.
    pub meta: GraphMeta,
    pub(crate) by_id: HashMap<String, usize>,
    pub(crate) out_adj: Vec<Vec<usize>>,
    pub(crate) in_adj: Vec<Vec<usize>>,
}

impl Graph {
    /// Build a graph from nodes and edges (edges reference node positions). Edges with an
    /// out-of-range endpoint are dropped; duplicate node ids keep the first.
    #[must_use]
    pub fn from_parts(nodes: Vec<Node>, edges: Vec<Edge>) -> Self {
        let mut graph = Self::default();
        for node in nodes {
            if graph.by_id.contains_key(&node.id) {
                continue;
            }
            graph.by_id.insert(node.id.clone(), graph.nodes.len());
            graph.nodes.push(node);
        }
        graph.out_adj = vec![Vec::new(); graph.nodes.len()];
        graph.in_adj = vec![Vec::new(); graph.nodes.len()];
        for edge in edges {
            if edge.src >= graph.nodes.len() || edge.dst >= graph.nodes.len() {
                continue;
            }
            let index = graph.edges.len();
            graph.out_adj[edge.src].push(index);
            graph.in_adj[edge.dst].push(index);
            graph.edges.push(edge);
        }
        graph
    }

    /// Index of a node id.
    #[must_use]
    pub fn index_of(&self, id: &str) -> Option<usize> {
        self.by_id.get(id).copied()
    }

    /// Total degree (in plus out) of a node.
    #[must_use]
    pub fn degree(&self, node: usize) -> usize {
        self.out_adj[node].len() + self.in_adj[node].len()
    }

    /// Indices of the edges leaving a node.
    #[must_use]
    pub fn out_edges(&self, node: usize) -> &[usize] {
        &self.out_adj[node]
    }

    /// Indices of the edges entering a node.
    #[must_use]
    pub fn in_edges(&self, node: usize) -> &[usize] {
        &self.in_adj[node]
    }
}

#[cfg(test)]
pub(crate) fn sample() -> Graph {
    // a -contains-> b, a -contains-> c, b -calls-> c (INFERRED), c -calls-> d, e isolated.
    let nodes = vec![
        Node::code("a", "RagStore", Some("store.rs")),
        Node::code("b", ".open()", Some("store.rs")),
        Node::code("c", ".upsert_doc()", Some("store.rs")),
        Node::code("d", "Connection", None),
        Node::code("e", "Lonely", Some("other.rs")),
    ];
    let mut call = Edge::extracted(1, 2, "calls");
    call.confidence = Confidence::Inferred;
    call.score = 0.8;
    let edges = vec![
        Edge::extracted(0, 1, "contains"),
        Edge::extracted(0, 2, "contains"),
        call,
        Edge::extracted(2, 3, "calls"),
    ];
    Graph::from_parts(nodes, edges)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adjacency_and_degree() {
        let g = sample();
        assert_eq!(g.degree(0), 2);
        assert_eq!(g.degree(2), 3);
        assert_eq!(g.degree(4), 0);
        assert_eq!(g.index_of("c"), Some(2));
    }

    #[test]
    fn invalid_edges_and_duplicate_nodes_are_dropped() {
        let nodes = vec![Node::code("a", "A", None), Node::code("a", "dup", None)];
        let g = Graph::from_parts(nodes, vec![Edge::extracted(0, 5, "calls")]);
        assert_eq!((g.nodes.len(), g.edges.len()), (1, 0));
    }
}
