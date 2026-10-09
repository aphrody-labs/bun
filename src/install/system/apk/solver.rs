//! Package selection: the closure of the world dependencies over the
//! repositories and the installed database, then `install_if` packages.
//!
//! Preference order follows apk-tools `solver.c` (GPL-2.0-only,
//! aphrody-labs/apk-tools@44dcdfc): a package already chosen, the installed
//! version unless upgrading, a real name over a `provides`, the higher
//! `provider_priority`, the newer version, then repository order. Unlike
//! apk-tools it does not backtrack: an unsatisfiable choice is reported.
//! Pure: no I/O.

use std::collections::HashMap;

use super::index::Pkg;
use super::version::{self, CONFLICT, Dep};
use core::cmp::Ordering;

pub struct Problem(pub String);

pub struct Solver<'a> {
    pool: &'a [Pkg],
    /// Tag of each repository (`@edge`), `None` for untagged ones.
    repo_tags: &'a [Option<String>],
    upgrade: bool,
    by_name: HashMap<&'a str, Vec<usize>>,
    providers: HashMap<&'a str, Vec<(usize, Option<&'a str>)>>,
    installed: HashMap<&'a str, usize>,
    chosen_by_name: HashMap<&'a str, usize>,
    chosen: Vec<usize>,
    conflicts: Vec<(Dep, Option<usize>)>,
}

impl<'a> Solver<'a> {
    /// `installed` lists pool indices of the currently installed packages.
    pub fn new(pool: &'a [Pkg], installed: &[usize], repo_tags: &'a [Option<String>], upgrade: bool) -> Self {
        let mut by_name: HashMap<&str, Vec<usize>> = HashMap::new();
        let mut providers: HashMap<&str, Vec<(usize, Option<&str>)>> = HashMap::new();
        for (i, p) in pool.iter().enumerate() {
            by_name.entry(p.name.as_str()).or_default().push(i);
            for prov in &p.provides {
                providers.entry(prov.name.as_str()).or_default().push((i, prov.version.as_deref()));
            }
        }
        let installed = installed.iter().map(|&i| (pool[i].name.as_str(), i)).collect();
        Solver {
            pool,
            repo_tags,
            upgrade,
            by_name,
            providers,
            installed,
            chosen_by_name: HashMap::new(),
            chosen: Vec::new(),
            conflicts: Vec::new(),
        }
    }

    fn tag_allows(&self, dep: &Dep, i: usize) -> bool {
        let Some(repo) = self.pool[i].repo else {
            return true;
        };
        match self.repo_tags.get(repo).and_then(Option::as_ref) {
            None => true,
            Some(tag) => dep.tag.as_deref() == Some(tag.as_str()),
        }
    }

    fn candidates(&self, dep: &Dep) -> Vec<(usize, bool)> {
        let mut out = Vec::new();
        if let Some(list) = self.by_name.get(dep.name.as_str()) {
            for &i in list {
                if dep.matches_version(Some(&self.pool[i].version)) && self.tag_allows(dep, i) {
                    out.push((i, true));
                }
            }
        }
        if let Some(list) = self.providers.get(dep.name.as_str()) {
            for &(i, v) in list {
                if dep.matches_version(v) && self.tag_allows(dep, i) && !out.iter().any(|&(j, _)| j == i) {
                    out.push((i, false));
                }
            }
        }
        out
    }

    fn is_installed(&self, i: usize) -> bool {
        self.installed.get(self.pool[i].name.as_str()) == Some(&i)
    }

    fn better(&self, a: (usize, bool), b: (usize, bool)) -> Ordering {
        let (pa, pb) = (&self.pool[a.0], &self.pool[b.0]);
        let chosen = |i: usize| self.chosen_by_name.get(self.pool[i].name.as_str()) == Some(&i);
        chosen(a.0)
            .cmp(&chosen(b.0))
            .then_with(|| {
                if self.upgrade {
                    Ordering::Equal
                } else {
                    self.is_installed(a.0).cmp(&self.is_installed(b.0))
                }
            })
            .then(a.1.cmp(&b.1))
            .then(pa.provider_priority.cmp(&pb.provider_priority))
            .then_with(|| version::compare(&pa.version, &pb.version))
            .then_with(|| {
                // Earlier repository wins; installed-only records last.
                let ra = pa.repo.unwrap_or(usize::MAX);
                let rb = pb.repo.unwrap_or(usize::MAX);
                rb.cmp(&ra)
            })
    }

    fn select_for(&mut self, dep: &Dep, from: Option<usize>) -> Result<(), Problem> {
        if dep.is_conflict() {
            self.conflicts.push((dep.clone(), from));
            return Ok(());
        }
        let mut cands = self.candidates(dep);
        // A name can only be installed once: drop other versions of a chosen name.
        cands.retain(|&(i, _)| match self.chosen_by_name.get(self.pool[i].name.as_str()) {
            Some(&c) => c == i,
            None => true,
        });
        let Some(&best) = cands.iter().max_by(|&&a, &&b| self.better(a, b)) else {
            let who = from.map_or_else(|| "world".to_owned(), |i| self.pool[i].name_version());
            let reason = if self.by_name.contains_key(dep.name.as_str()) || self.providers.contains_key(dep.name.as_str()) {
                "no candidate satisfies the constraint (or another version is already selected)"
            } else {
                "no such package"
            };
            return Err(Problem(format!("{dep} (required by {who}): {reason}")));
        };
        self.choose(best.0)
    }

    fn choose(&mut self, i: usize) -> Result<(), Problem> {
        let name = self.pool[i].name.as_str();
        if self.chosen_by_name.contains_key(name) {
            return Ok(());
        }
        self.chosen_by_name.insert(name, i);
        self.chosen.push(i);
        let deps = self.pool[i].depends.clone();
        for d in &deps {
            self.select_for(d, Some(i))?;
        }
        Ok(())
    }

    fn satisfied(&self, dep: &Dep) -> bool {
        self.chosen.iter().any(|&i| {
            let p = &self.pool[i];
            (p.name == dep.name && dep.matches_version(Some(&p.version)))
                || p.provides.iter().any(|v| v.name == dep.name && dep.matches_version(v.version.as_deref()))
        })
    }

    /// Solves `world`; returns pool indices in install order (dependencies first).
    pub fn solve(mut self, world: &[Dep]) -> Result<Vec<usize>, Problem> {
        for d in world {
            self.select_for(d, None)?;
        }
        loop {
            let mut added = false;
            let mut names: Vec<&str> = self.by_name.keys().copied().collect();
            names.sort_unstable();
            for name in names {
                if self.chosen_by_name.contains_key(name) {
                    continue;
                }
                let list = &self.by_name[name];
                let best = list
                    .iter()
                    .copied()
                    .filter(|&i| !self.pool[i].install_if.is_empty())
                    .filter(|&i| self.pool[i].install_if.iter().all(|d| self.satisfied(d)))
                    .max_by(|&a, &b| self.better((a, true), (b, true)));
                if let Some(i) = best {
                    self.choose(i)?;
                    added = true;
                }
            }
            if !added {
                break;
            }
        }
        for (dep, from) in &self.conflicts {
            let positive = Dep { op: dep.op & !CONFLICT, ..dep.clone() };
            for &i in &self.chosen {
                if Some(i) == *from {
                    continue;
                }
                let p = &self.pool[i];
                let hit = (p.name == dep.name && positive.matches_version(Some(&p.version)))
                    || p.provides.iter().any(|v| v.name == dep.name && positive.matches_version(v.version.as_deref()));
                if hit {
                    let who = from.map_or_else(|| "world".to_owned(), |f| self.pool[f].name_version());
                    return Err(Problem(format!("{} conflicts with {dep} (from {who})", p.name_version())));
                }
            }
        }
        Ok(self.order())
    }

    fn order(&self) -> Vec<usize> {
        let mut out = Vec::with_capacity(self.chosen.len());
        let mut state: HashMap<usize, u8> = HashMap::new();
        let mut sorted = self.chosen.clone();
        sorted.sort_by(|&a, &b| self.pool[a].name.cmp(&self.pool[b].name));
        for &i in &sorted {
            self.visit(i, &mut state, &mut out);
        }
        out
    }

    fn visit(&self, i: usize, state: &mut HashMap<usize, u8>, out: &mut Vec<usize>) {
        if state.contains_key(&i) {
            return;
        }
        state.insert(i, 1);
        for d in &self.pool[i].depends {
            if d.is_conflict() {
                continue;
            }
            let provider = self.chosen.iter().copied().find(|&j| {
                let p = &self.pool[j];
                p.name == d.name || p.provides.iter().any(|v| v.name == d.name)
            });
            if let Some(j) = provider {
                self.visit(j, state, out);
            }
        }
        state.insert(i, 2);
        out.push(i);
    }
}
