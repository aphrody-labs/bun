//! Blocking HTTP GET for the system sources (index/manifest/installer downloads).

use bun_core::MutableString;
use bun_http::{self as http, AsyncHTTP, headers};
use bun_url::URL;

use super::{Error, Result};

pub fn get(env: &bun_dotenv::Loader, url: &str) -> Result<Vec<u8>> {
    let parsed = URL::parse(url.as_bytes());
    let proxy = env.get_http_proxy_for(&parsed);
    let mut body = MutableString::init(16 * 1024).map_err(|_| Error::Io("out of memory".to_owned()))?;
    let mut req = AsyncHTTP::init_sync(
        http::Method::GET,
        parsed,
        headers::EntryList::default(),
        b"",
        b"",
        proxy,
        http::FetchRedirect::Follow,
    );
    req.client.flags.reject_unauthorized = env.get_tls_reject_unauthorized();
    let res = req
        .send_sync(&mut body)
        .map_err(|e| Error::Http(format!("GET {url} failed: {}", e.name())))?;
    match res.status_code() {
        200..=299 => Ok(core::mem::take(&mut body.list)),
        404 | 410 => Err(Error::NotFound(url.to_owned())),
        code => Err(Error::Http(format!("GET {url} returned HTTP {code}"))),
    }
}
