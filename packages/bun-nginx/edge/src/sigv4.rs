//! Minimal AWS Signature V4 for read-only S3 (R2) GET/HEAD requests.
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

fn hmac(key: &[u8], data: &str) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("hmac accepts any key length");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

pub struct Credentials<'a> {
    pub access_key_id: &'a str,
    pub secret_access_key: &'a str,
    pub session_token: &'a str,
}

/// Returns (header name, value) pairs to add to the request. `host` is the authority, `path` the
/// already-encoded absolute path, `range` an optional Range header value; `amz_date` is `YYYYMMDDTHHMMSSZ`.
pub fn sign(
    method: &str,
    host: &str,
    path: &str,
    range: Option<&str>,
    creds: &Credentials,
    region: &str,
    amz_date: &str,
) -> Vec<(String, String)> {
    let day = &amz_date[..8];
    let payload = "UNSIGNED-PAYLOAD";
    let mut headers: Vec<(&str, String)> = vec![
        ("host", host.to_string()),
        ("x-amz-content-sha256", payload.to_string()),
        ("x-amz-date", amz_date.to_string()),
        ("x-amz-security-token", creds.session_token.to_string()),
    ];
    if let Some(r) = range {
        headers.push(("range", r.to_string()));
    }
    headers.sort_by(|a, b| a.0.cmp(b.0));
    let canonical_headers: String = headers.iter().map(|(k, v)| format!("{k}:{}\n", v.trim())).collect();
    let signed = headers.iter().map(|(k, _)| *k).collect::<Vec<_>>().join(";");
    let canonical = format!("{method}\n{path}\n\n{canonical_headers}\n{signed}\n{payload}");
    let scope = format!("{day}/{region}/s3/aws4_request");
    let to_sign = format!("AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}", hex::encode(Sha256::digest(canonical.as_bytes())));
    let k = hmac(format!("AWS4{}", creds.secret_access_key).as_bytes(), day);
    let k = hmac(&k, region);
    let k = hmac(&k, "s3");
    let k = hmac(&k, "aws4_request");
    let signature = hex::encode(hmac(&k, &to_sign));
    let auth = format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed}, Signature={signature}",
        creds.access_key_id
    );
    let mut out = vec![
        ("x-amz-content-sha256".to_string(), payload.to_string()),
        ("x-amz-date".to_string(), amz_date.to_string()),
        ("x-amz-security-token".to_string(), creds.session_token.to_string()),
        ("authorization".to_string(), auth),
    ];
    if let Some(r) = range {
        out.push(("range".to_string(), r.to_string()));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // AWS documentation example key derivation (GET object, 20130524, us-east-1).
    #[test]
    fn signature_is_deterministic_and_scoped() {
        let c = Credentials { access_key_id: "AKID", secret_access_key: "SECRET", session_token: "TOK" };
        let a = sign("GET", "h.example", "/b/k", None, &c, "auto", "20261017T040000Z");
        let b = sign("GET", "h.example", "/b/k", None, &c, "auto", "20261017T040000Z");
        assert_eq!(a, b);
        let auth = &a.iter().find(|(k, _)| k == "authorization").unwrap().1;
        assert!(auth.contains("Credential=AKID/20261017/auto/s3/aws4_request"));
        assert!(auth.contains("SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token"));
        let r = sign("GET", "h.example", "/b/k", Some("bytes=0-1"), &c, "auto", "20261017T040000Z");
        assert!(r.iter().find(|(k, _)| k == "authorization").unwrap().1.contains("range;"));
        assert_ne!(a[3].1, r[3].1);
    }
}
