//! Result cache shared across sessions: Redis/Valkey when `VALKEY_URL` or `REDIS_URL` points at a
//! `redis://` server (RESP parsing from `bun_valkey`), else the `cache` table of the agent
//! database. Values are zstd-compressed bytes with a time-to-live.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bun_valkey::valkey_protocol::{RESPValue, ReplyScanner, ScanResult, ValkeyReader};

use crate::sqlite::{Db, Param};
use crate::util::env;

struct Valkey {
    stream: TcpStream,
}

impl Valkey {
    fn connect(url: &str) -> Option<Self> {
        let rest = url
            .strip_prefix("redis://")
            .or_else(|| url.strip_prefix("valkey://"))?;
        let (auth, host) = match rest.rsplit_once('@') {
            Some((a, h)) => (Some(a), h),
            None => (None, rest),
        };
        let (host, db) = match host.split_once('/') {
            Some((h, d)) => (h, d.parse::<u32>().ok()),
            None => (host, None),
        };
        let host = if host.contains(':') {
            host.to_owned()
        } else {
            format!("{host}:6379")
        };
        let addr = host.to_socket_addrs().ok()?.next()?;
        let stream = TcpStream::connect_timeout(&addr, Duration::from_millis(300)).ok()?;
        stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
        stream
            .set_write_timeout(Some(Duration::from_secs(2)))
            .ok()?;
        let mut conn = Valkey { stream };
        if let Some(auth) = auth {
            let (user, pass) = auth.split_once(':').unwrap_or(("default", auth));
            let user = if user.is_empty() { "default" } else { user };
            conn.command(&[b"AUTH", user.as_bytes(), pass.as_bytes()])?;
        }
        if let Some(db) = db {
            conn.command(&[b"SELECT", db.to_string().as_bytes()])?;
        }
        Some(conn)
    }

    fn command(&mut self, args: &[&[u8]]) -> Option<RESPValue> {
        let mut out = format!("*{}\r\n", args.len()).into_bytes();
        for a in args {
            out.extend_from_slice(format!("${}\r\n", a.len()).as_bytes());
            out.extend_from_slice(a);
            out.extend_from_slice(b"\r\n");
        }
        self.stream.write_all(&out).ok()?;
        let mut buf = Vec::new();
        let mut scanner = ReplyScanner::default();
        let mut chunk = [0u8; 16 * 1024];
        loop {
            let n = self.stream.read(&mut chunk).ok()?;
            if n == 0 {
                return None;
            }
            buf.extend_from_slice(&chunk[..n]);
            if let ScanResult::Complete = scanner.scan(&buf).ok()? {
                let value = ValkeyReader::init(&buf).read_value().ok()?;
                return match value {
                    RESPValue::Error(_) => None,
                    v => Some(v),
                };
            }
        }
    }
}

#[derive(Default)]
pub(crate) struct Cache {
    valkey: Mutex<Option<Valkey>>,
    db: OnceLock<Option<Db>>,
    tried_valkey: OnceLock<()>,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Cache {
    fn valkey(&self) -> std::sync::MutexGuard<'_, Option<Valkey>> {
        let mut guard = self.valkey.lock().unwrap_or_else(|e| e.into_inner());
        self.tried_valkey.get_or_init(|| {
            *guard = env("VALKEY_URL")
                .or_else(|| env("REDIS_URL"))
                .and_then(|u| Valkey::connect(&u));
        });
        guard
    }

    fn db(&self) -> Option<&Db> {
        self.db
            .get_or_init(|| {
                let db = crate::tools::memory::open_db().ok()?;
                db.execute(
                    "CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, value BLOB NOT NULL, expires INTEGER NOT NULL)",
                    &[],
                )
                .ok()?;
                Some(db)
            })
            .as_ref()
    }

    /// Which backend serves the cache: `valkey`, `sqlite` or `none`.
    pub(crate) fn backend(&self) -> &'static str {
        if self.valkey().is_some() {
            "valkey"
        } else if self.db().is_some() {
            "sqlite"
        } else {
            "none"
        }
    }

    pub(crate) fn get(&self, key: &str) -> Option<Vec<u8>> {
        let key = format!("bun-mcp:{key}");
        let packed = {
            let mut valkey = self.valkey();
            match valkey.as_mut() {
                Some(conn) => match conn.command(&[b"GET", key.as_bytes()]) {
                    Some(RESPValue::BulkString(Some(v))) => Some(v.into_vec()),
                    Some(_) => None,
                    None => {
                        *valkey = None;
                        None
                    }
                },
                None => {
                    drop(valkey);
                    let mut found = None;
                    self.db()?
                        .query(
                            "SELECT value FROM cache WHERE key = ?1 AND expires > ?2",
                            &[Param::Text(&key), Param::Int(now())],
                            |row| found = Some(row.blob(0)),
                        )
                        .ok()?;
                    found
                }
            }
        }?;
        bun_zstd::decompress_alloc(&packed).ok()
    }

    pub(crate) fn set(&self, key: &str, value: &[u8], ttl_secs: u64) {
        let key = format!("bun-mcp:{key}");
        let mut packed = Vec::with_capacity(bun_zstd::compress_bound(value.len()));
        if !matches!(
            bun_zstd::compress_append(&mut packed, value, Some(3)),
            bun_zstd::Result::Success(_)
        ) {
            return;
        }
        let mut valkey = self.valkey();
        if let Some(conn) = valkey.as_mut() {
            let ttl = ttl_secs.to_string();
            if conn
                .command(&[b"SET", key.as_bytes(), &packed, b"EX", ttl.as_bytes()])
                .is_none()
            {
                *valkey = None;
            }
            return;
        }
        drop(valkey);
        if let Some(db) = self.db() {
            let _ = db.execute(
                "INSERT OR REPLACE INTO cache(key, value, expires) VALUES (?1, ?2, ?3)",
                &[
                    Param::Text(&key),
                    Param::Blob(&packed),
                    Param::Int(now() + ttl_secs as i64),
                ],
            );
            let _ = db.execute(
                "DELETE FROM cache WHERE expires <= ?1",
                &[Param::Int(now())],
            );
        }
    }
}
