#![allow(non_camel_case_types)]
#![warn(unused_must_use)]
pub mod shared;

// Provides the C zlib symbols (deflate, inflate, crc32, ...) to every C and Rust consumer.
use zlib_rs as _;
