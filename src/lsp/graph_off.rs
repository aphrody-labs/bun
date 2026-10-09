//! [`crate::graph`] without the `graph` feature: no graph is ever built.

use std::convert::Infallible;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use crate::Options;
use crate::links::{Link, Site, Symbol};

/// The graph of one workspace root; none exists without the `graph` feature.
pub struct Index {
    never: Infallible,
}

impl Index {
    pub fn root(&self) -> &Path {
        match self.never {}
    }
    pub fn files(&self) -> usize {
        match self.never {}
    }
    pub fn elapsed(&self) -> Duration {
        match self.never {}
    }
    pub fn nodes(&self) -> usize {
        match self.never {}
    }
    pub fn edges(&self) -> usize {
        match self.never {}
    }
    pub fn link_count(&self) -> usize {
        match self.never {}
    }
    pub fn links_at(&self, _: &Path, _: u32, _: u32, _: Option<&str>) -> Vec<Link> {
        match self.never {}
    }
    pub fn node_at(&self, _: &Path, _: u32, _: &str) -> Option<usize> {
        match self.never {}
    }
    pub fn symbol(&self, _: usize) -> Option<Symbol> {
        match self.never {}
    }
    pub fn callers(&self, _: usize) -> Vec<(Symbol, Option<Site>)> {
        match self.never {}
    }
    pub fn callees(&self, _: usize) -> Vec<(Symbol, Option<Site>)> {
        match self.never {}
    }
    pub fn search(&self, _: &str, _: usize) -> Vec<Symbol> {
        match self.never {}
    }
    pub fn describe(&self, _: &Path, _: u32, _: u32, _: &str) -> Option<String> {
        match self.never {}
    }
}

pub struct Graphs;

impl Graphs {
    pub fn new(_: &Options) -> Arc<Graphs> {
        Arc::new(Graphs)
    }
    pub fn enabled(&self) -> bool {
        false
    }
    pub fn current(&self, _: &Path) -> Option<Arc<Index>> {
        None
    }
    pub fn wait(&self, _: &Path, _: Duration) -> Option<Arc<Index>> {
        None
    }
    pub fn built(&self) -> Vec<Arc<Index>> {
        Vec::new()
    }
    pub fn touch(&self, _: &Path) {}
}
