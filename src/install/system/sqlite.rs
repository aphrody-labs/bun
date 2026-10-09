//! Read-only SQLite table reader over an in-memory database image; the
//! implementation lives in `aphrody-pkg-system` (packages/aphrody-pkg-system).

pub use aphrody_pkg_system::sqlite::{Cell, Database};

impl From<aphrody_pkg_system::Error> for super::Error {
    fn from(e: aphrody_pkg_system::Error) -> Self {
        use aphrody_pkg_system::Error as E;
        match e {
            E::Parse(s) => super::Error::Parse(s),
            E::NotFound(s) => super::Error::NotFound(s),
            E::NoMatchingVersion { id, range } => super::Error::NoMatchingVersion { id, range },
            E::Unsupported(s) => super::Error::Unsupported(s),
        }
    }
}
