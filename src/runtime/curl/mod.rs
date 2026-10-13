pub(crate) mod cli;
#[path = "Curl.rs"]
mod curl_class;
#[cfg(feature = "curl_native")]
mod ffi;
pub(crate) mod provider;
pub(crate) use curl_class::Curl;
