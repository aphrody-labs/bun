//! Loose version ordering and ranges shared by the system sources; the
//! implementation lives in `aphrody-pkg-system` (packages/aphrody-pkg-system).

pub use aphrody_pkg_system::version::{best_match, compare, is_exact, satisfies};
