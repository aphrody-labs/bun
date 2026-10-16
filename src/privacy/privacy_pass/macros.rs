// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Absorbed from brave-intl/challenge-bypass-ristretto 2.1.0 src/macros.rs
// (used by brave-core components/challenge_bypass_ristretto).

#[cfg(test)]
/// Implement the encode_base64 / decode_base64 functions for a struct which implements to_bytes / from_bytes
macro_rules! impl_base64 {
    ($t:ident) => {
        impl $t {
            /// Encode to a base64 string
            pub fn encode_base64(&self) -> ::std::string::String {
                use base64::Engine;
                base64::prelude::BASE64_STANDARD.encode(&self.to_bytes().to_vec())
            }

            /// Decode from a base64 string
            pub fn decode_base64(s: &str) -> Result<Self, TokenError> {
                use base64::Engine;
                let bytes = base64::prelude::BASE64_STANDARD
                    .decode(s)
                    .or(Err(TokenError(InternalError::DecodingError)))?;
                $t::from_bytes(&bytes)
            }
        }
    };
}
