//! Digests and signature checks over BoringSSL: RSA PKCS#1 v1.5 (apk v2,
//! OpenPGP RSA) and Ed25519 (apk v3, OpenPGP EdDSA).

use core::ffi::{c_int, c_long, c_void};

use bun_sha_hmac::sha::evp;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Alg {
    Sha1,
    Sha256,
    Sha512,
}

impl Alg {
    fn nid(self) -> c_int {
        match self {
            Alg::Sha1 => 64,
            Alg::Sha256 => 672,
            Alg::Sha512 => 674,
        }
    }

    pub fn len(self) -> usize {
        match self {
            Alg::Sha1 => 20,
            Alg::Sha256 => 32,
            Alg::Sha512 => 64,
        }
    }
}

/// Incremental digest.
pub enum Hasher {
    Sha1(evp::SHA1),
    Sha256(evp::SHA256),
    Sha512(evp::SHA512),
}

impl Hasher {
    pub fn new(alg: Alg) -> Hasher {
        match alg {
            Alg::Sha1 => Hasher::Sha1(evp::SHA1::init()),
            Alg::Sha256 => Hasher::Sha256(evp::SHA256::init()),
            Alg::Sha512 => Hasher::Sha512(evp::SHA512::init()),
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        match self {
            Hasher::Sha1(h) => h.update(data),
            Hasher::Sha256(h) => h.update(data),
            Hasher::Sha512(h) => h.update(data),
        }
    }

    pub fn finish(self) -> Vec<u8> {
        match self {
            Hasher::Sha1(mut h) => {
                let mut out = [0u8; 20];
                h.r#final(&mut out);
                out.to_vec()
            }
            Hasher::Sha256(mut h) => {
                let mut out = [0u8; 32];
                h.r#final(&mut out);
                out.to_vec()
            }
            Hasher::Sha512(mut h) => {
                let mut out = [0u8; 64];
                h.r#final(&mut out);
                out.to_vec()
            }
        }
    }
}

pub fn digest(alg: Alg, data: &[u8]) -> Vec<u8> {
    let mut h = Hasher::new(alg);
    h.update(data);
    h.finish()
}

pub fn hex_decode(hex: &[u8]) -> Option<Vec<u8>> {
    if hex.len() % 2 != 0 {
        return None;
    }
    let nib = |c: u8| -> Option<u8> {
        match c {
            b'0'..=b'9' => Some(c - b'0'),
            b'a'..=b'f' => Some(c - b'a' + 10),
            b'A'..=b'F' => Some(c - b'A' + 10),
            _ => None,
        }
    };
    hex.chunks(2).map(|p| Some((nib(p[0])? << 4) | nib(p[1])?)).collect()
}

unsafe extern "C" {
    fn d2i_PUBKEY(out: *mut *mut c_void, inp: *mut *const u8, len: c_long) -> *mut c_void;
    fn EVP_PKEY_id(pkey: *const c_void) -> c_int;
    fn EVP_PKEY_get1_RSA(pkey: *const c_void) -> *mut c_void;
    fn EVP_PKEY_get_raw_public_key(pkey: *const c_void, out: *mut u8, out_len: *mut usize) -> c_int;
    fn RSA_verify(
        hash_nid: c_int,
        digest: *const u8,
        digest_len: usize,
        sig: *const u8,
        sig_len: usize,
        rsa: *mut c_void,
    ) -> c_int;
    fn RSA_new_public_key(n: *const c_void, e: *const c_void) -> *mut c_void;
    fn BN_bin2bn(input: *const u8, len: usize, ret: *mut c_void) -> *mut c_void;
    fn BN_free(bn: *mut c_void);
    fn ED25519_verify(message: *const u8, message_len: usize, signature: *const u8, public_key: *const u8) -> c_int;
    fn ERR_clear_error();
}

/// Owned `RSA*` (released with `RSA_free`).
struct RsaKey(*mut c_void);

impl Drop for RsaKey {
    fn drop(&mut self) {
        // SAFETY: `self.0` came from EVP_PKEY_get1_RSA / RSA_new_public_key and is freed once.
        unsafe { bun_boringssl_sys::RSA_free(self.0.cast()) };
    }
}

/// A public key usable for verification.
pub enum PublicKey {
    Rsa { n: Vec<u8>, e: Vec<u8>, der: Vec<u8> },
    Ed25519([u8; 32]),
}

const EVP_PKEY_RSA: c_int = 6;
const EVP_PKEY_ED25519: c_int = 949;

impl PublicKey {
    /// A `-----BEGIN PUBLIC KEY-----` PEM block or raw SubjectPublicKeyInfo DER.
    pub fn from_pem_or_der(bytes: &[u8]) -> Option<PublicKey> {
        let der = if bun_core::strings::contains(bytes, b"-----BEGIN") {
            pem_decode(bytes)?
        } else {
            bytes.to_vec()
        };
        let mut p = der.as_ptr();
        // SAFETY: `p` points into `der`, valid for `der.len()` bytes; the result is freed below.
        let pkey = unsafe { d2i_PUBKEY(core::ptr::null_mut(), &raw mut p, der.len() as c_long) };
        if pkey.is_null() {
            // SAFETY: plain FFI call clearing BoringSSL's thread-local error queue.
            unsafe { ERR_clear_error() };
            return None;
        }
        let _free = scopeguard::guard(pkey, |k| {
            // SAFETY: `k` is the EVP_PKEY returned by d2i_PUBKEY, freed exactly once.
            unsafe { bun_boringssl_sys::EVP_PKEY_free(k.cast()) }
        });
        // SAFETY: `pkey` is a live EVP_PKEY.
        match unsafe { EVP_PKEY_id(pkey) } {
            EVP_PKEY_RSA => Some(PublicKey::Rsa { n: Vec::new(), e: Vec::new(), der }),
            EVP_PKEY_ED25519 => {
                let mut raw = [0u8; 32];
                let mut len = raw.len();
                // SAFETY: `raw` has room for `len` bytes; `pkey` is a live Ed25519 key.
                let ok = unsafe { EVP_PKEY_get_raw_public_key(pkey, raw.as_mut_ptr(), &raw mut len) };
                (ok == 1 && len == 32).then_some(PublicKey::Ed25519(raw))
            }
            _ => None,
        }
    }

    /// RSA key from its big-endian modulus and exponent (OpenPGP key packets).
    pub fn rsa_from_parts(n: &[u8], e: &[u8]) -> PublicKey {
        PublicKey::Rsa { n: n.to_vec(), e: e.to_vec(), der: Vec::new() }
    }

    fn rsa(&self) -> Option<RsaKey> {
        let PublicKey::Rsa { n, e, der } = self else {
            return None;
        };
        if !der.is_empty() {
            let mut p = der.as_ptr();
            // SAFETY: `p` points into `der`; the EVP_PKEY is freed before returning.
            let pkey = unsafe { d2i_PUBKEY(core::ptr::null_mut(), &raw mut p, der.len() as c_long) };
            if pkey.is_null() {
                return None;
            }
            // SAFETY: `pkey` is a live RSA EVP_PKEY; get1 returns a new reference.
            let rsa = unsafe { EVP_PKEY_get1_RSA(pkey) };
            // SAFETY: `pkey` is freed exactly once; `rsa` holds its own reference.
            unsafe { bun_boringssl_sys::EVP_PKEY_free(pkey.cast()) };
            return (!rsa.is_null()).then_some(RsaKey(rsa));
        }
        // SAFETY: inputs are valid for their lengths; null `ret` allocates new BIGNUMs.
        let (bn_n, bn_e) = unsafe {
            (
                BN_bin2bn(n.as_ptr(), n.len(), core::ptr::null_mut()),
                BN_bin2bn(e.as_ptr(), e.len(), core::ptr::null_mut()),
            )
        };
        if bn_n.is_null() || bn_e.is_null() {
            // SAFETY: BN_free accepts null.
            unsafe {
                BN_free(bn_n);
                BN_free(bn_e);
            }
            return None;
        }
        // SAFETY: both BIGNUMs are live; RSA_new_public_key copies them.
        let rsa = unsafe { RSA_new_public_key(bn_n, bn_e) };
        // SAFETY: the BIGNUMs were copied above and are freed exactly once.
        unsafe {
            BN_free(bn_n);
            BN_free(bn_e);
        }
        (!rsa.is_null()).then_some(RsaKey(rsa))
    }

    /// PKCS#1 v1.5 signature over a precomputed digest.
    pub fn verify_digest(&self, alg: Alg, digest: &[u8], sig: &[u8]) -> bool {
        match self {
            PublicKey::Rsa { .. } => {
                let Some(rsa) = self.rsa() else {
                    return false;
                };
                // SAFETY: buffers are valid for their lengths; `rsa.0` is a live RSA key.
                let ok = unsafe {
                    RSA_verify(alg.nid(), digest.as_ptr(), digest.len(), sig.as_ptr(), sig.len(), rsa.0)
                };
                if ok != 1 {
                    // SAFETY: plain FFI call clearing the error queue left by a failed verify.
                    unsafe { ERR_clear_error() };
                }
                ok == 1
            }
            PublicKey::Ed25519(_) => self.verify_ed25519(digest, sig),
        }
    }

    /// Ed25519 over `message` (for OpenPGP EdDSA the message is the digest).
    pub fn verify_ed25519(&self, message: &[u8], sig: &[u8]) -> bool {
        let PublicKey::Ed25519(key) = self else {
            return false;
        };
        if sig.len() != 64 {
            return false;
        }
        // SAFETY: `sig` is 64 bytes and `key` 32 bytes, as ED25519_verify requires.
        unsafe { ED25519_verify(message.as_ptr(), message.len(), sig.as_ptr(), key.as_ptr()) == 1 }
    }
}

/// Body of the first PEM block, base64-decoded.
pub fn pem_decode(text: &[u8]) -> Option<Vec<u8>> {
    let begin = bun_core::strings::index_of(text, b"-----BEGIN")?;
    let after = &text[begin..];
    let header_end = bun_core::strings::index_of_char_usize(after, b'\n')? + 1;
    let body = &after[header_end..];
    let end = bun_core::strings::index_of(body, b"-----END")?;
    let mut b64 = Vec::with_capacity(end);
    for line in bun_core::strings::split(&body[..end], b"\n") {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        // Armor headers ("Version: …") and the blank line after them.
        if bun_core::strings::contains_char(line, b':') {
            continue;
        }
        // OpenPGP armor checksum line.
        if line.first() == Some(&b'=') && line.len() == 5 {
            continue;
        }
        b64.extend(line.iter().copied().filter(|c| !c.is_ascii_whitespace()));
    }
    bun_base64::decode_alloc(&b64).ok()
}

pub fn base64_decode(b64: &[u8]) -> Option<Vec<u8>> {
    bun_base64::decode_alloc(b64).ok()
}

pub fn base64_encode(bytes: &[u8]) -> Vec<u8> {
    bun_base64::encode_alloc(bytes)
}
