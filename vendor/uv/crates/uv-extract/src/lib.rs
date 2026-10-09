pub use error::Error;
use regex::regex;
pub use sync::*;
use uv_static::EnvVars;

mod archive_path;
pub mod dirhash;
mod error;
pub mod hash;
pub mod stream;
mod sync;
mod vendor;

static REPLACEMENT_CHARACTER: &str = "\u{FFFD}";

/// Validate that a given filename (e.g. reported by a ZIP archive's
/// local file entries or central directory entries) is "safe" to use.
///
/// "Safe" in this context doesn't refer to directory traversal
/// risk, but whether we believe that other ZIP implementations
/// handle the name correctly and consistently.
///
/// Specifically, we want to avoid names that:
///
/// - Contain *any* non-printable characters
/// - Are empty
///
/// In the future, we may also want to check for names that contain
/// leading/trailing whitespace, or names that are exceedingly long.
pub(crate) fn validate_archive_member_name(name: &str) -> Result<(), Error> {
    if name.is_empty() {
        return Err(Error::EmptyFilename);
    }

    match regex!(r"\p{C}").replace_all(name, REPLACEMENT_CHARACTER) {
        // No replacements mean no control characters.
        std::borrow::Cow::Borrowed(_) => Ok(()),
        std::borrow::Cow::Owned(sanitized) => Err(Error::UnacceptableFilename {
            filename: sanitized,
        }),
    }
}

/// Returns `true` if ZIP validation is disabled.
pub fn insecure_no_validate() -> bool {
    // TODO(charlie) Parse this in `EnvironmentOptions`.
    let Some(value) = std::env::var_os(EnvVars::UV_INSECURE_NO_ZIP_VALIDATION) else {
        return false;
    };
    let Some(value) = value.to_str() else {
        return false;
    };
    matches!(
        value.to_lowercase().as_str(),
        "y" | "yes" | "t" | "true" | "on" | "1"
    )
}

#[cfg(test)]
mod tests {
    use std::io::{self, Write};
    use std::path::Path;

    use async_compression::tokio::bufread::{BzEncoder, LzmaEncoder, XzEncoder};
    use lzma_rust2::{LzipOptions, LzipWriter};
    use tempfile::TempDir;
    use tokio::io::{AsyncReadExt, BufReader};
    use uv_distribution_filename::{LegacySourceDistExtension, SourceDistExtension};

    use crate::stream;

    async fn tar_fixture(path: &str, content: &[u8]) -> io::Result<Vec<u8>> {
        let mut builder = tokio_tar::Builder::new(Vec::new());
        let mut header = tokio_tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        builder.append_data(&mut header, path, content).await?;
        builder.into_inner().await
    }

    #[tokio::test]
    async fn extract_tar_bzip2() -> anyhow::Result<()> {
        let _preview = uv_preview::test::with_features(&[]);
        let bytes = tar_fixture("package/module.py", b"print('bzip2')\n").await?;
        let mut compressed = Vec::new();
        BzEncoder::new(BufReader::new(bytes.as_slice()))
            .read_to_end(&mut compressed)
            .await?;
        let (target, files) = stream::archive(
            &mut compressed.as_slice(),
            SourceDistExtension::Legacy(LegacySourceDistExtension::TarBz2),
            TempDir::new()?,
        )
        .await?;
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path(), Path::new("package/module.py"));
        assert_eq!(files[0].size(), 15);
        assert_eq!(
            fs_err::tokio::read(target.path().join("package/module.py")).await?,
            b"print('bzip2')\n"
        );
        Ok(())
    }

    #[tokio::test]
    async fn extract_concatenated_bzip2_members() -> anyhow::Result<()> {
        let _preview = uv_preview::test::with_features(&[]);
        let bytes = tar_fixture("package/data", b"concatenated members").await?;
        let split = bytes.len() / 2;
        let mut compressed = Vec::new();
        BzEncoder::new(BufReader::new(&bytes[..split]))
            .read_to_end(&mut compressed)
            .await?;
        BzEncoder::new(BufReader::new(&bytes[split..]))
            .read_to_end(&mut compressed)
            .await?;
        let (target, files) = stream::archive(
            &mut compressed.as_slice(),
            SourceDistExtension::Legacy(LegacySourceDistExtension::Tbz),
            TempDir::new()?,
        )
        .await?;
        assert_eq!(files.len(), 1);
        assert_eq!(
            fs_err::tokio::read(target.path().join("package/data")).await?,
            b"concatenated members"
        );
        Ok(())
    }

    #[tokio::test]
    async fn extract_tar_xz() -> anyhow::Result<()> {
        let _preview = uv_preview::test::with_features(&[]);
        let bytes = tar_fixture("package/data", b"xz payload").await?;
        let mut compressed = Vec::new();
        XzEncoder::new(BufReader::new(bytes.as_slice()))
            .read_to_end(&mut compressed)
            .await?;
        let (target, files) = stream::archive(
            &mut compressed.as_slice(),
            SourceDistExtension::Legacy(LegacySourceDistExtension::TarXz),
            TempDir::new()?,
        )
        .await?;
        assert_eq!(files.len(), 1);
        assert_eq!(
            fs_err::tokio::read(target.path().join("package/data")).await?,
            b"xz payload"
        );
        Ok(())
    }

    #[tokio::test]
    async fn extract_tar_lzma() -> anyhow::Result<()> {
        let _preview = uv_preview::test::with_features(&[]);
        let bytes = tar_fixture("package/data", b"lzma payload").await?;
        let mut compressed = Vec::new();
        LzmaEncoder::new(BufReader::new(bytes.as_slice()))
            .read_to_end(&mut compressed)
            .await?;
        let (target, files) = stream::archive(
            &mut compressed.as_slice(),
            SourceDistExtension::Legacy(LegacySourceDistExtension::TarLzma),
            TempDir::new()?,
        )
        .await?;
        assert_eq!(files.len(), 1);
        assert_eq!(
            fs_err::tokio::read(target.path().join("package/data")).await?,
            b"lzma payload"
        );
        Ok(())
    }

    #[tokio::test]
    async fn reject_truncated_xz_trailer() -> anyhow::Result<()> {
        let _preview = uv_preview::test::with_features(&[]);
        let bytes = tar_fixture(
            "package/data",
            b"complete tar with an incomplete compression trailer",
        )
        .await?;
        let mut compressed = Vec::new();
        XzEncoder::new(BufReader::new(bytes.as_slice()))
            .read_to_end(&mut compressed)
            .await?;
        compressed.truncate(compressed.len().saturating_sub(4));
        let target = TempDir::new()?;
        let path = target.path().to_path_buf();
        assert!(
            stream::archive(
                &mut compressed.as_slice(),
                SourceDistExtension::Legacy(LegacySourceDistExtension::Txz),
                target,
            )
            .await
            .is_err()
        );
        assert!(!path.exists());
        Ok(())
    }

    #[tokio::test]
    async fn extract_tar_lzip() -> anyhow::Result<()> {
        let _preview = uv_preview::test::with_features(&[]);
        let bytes = tar_fixture("package/data", b"lzip payload").await?;
        let mut encoder = LzipWriter::new(Vec::new(), LzipOptions::with_preset(1));
        encoder.write_all(&bytes)?;
        let compressed = encoder.finish()?;
        let (target, files) = stream::archive(
            &mut compressed.as_slice(),
            SourceDistExtension::Legacy(LegacySourceDistExtension::TarLz),
            TempDir::new()?,
        )
        .await?;
        assert_eq!(files.len(), 1);
        assert_eq!(
            fs_err::tokio::read(target.path().join("package/data")).await?,
            b"lzip payload"
        );
        Ok(())
    }

    #[tokio::test]
    async fn reject_lzip_checksum_mismatch() -> anyhow::Result<()> {
        let _preview = uv_preview::test::with_features(&[]);
        let bytes = tar_fixture("package/data", b"lzip checksum").await?;
        let mut encoder = LzipWriter::new(Vec::new(), LzipOptions::with_preset(1));
        encoder.write_all(&bytes)?;
        let mut compressed = encoder.finish()?;
        let checksum = compressed.len() - 20;
        compressed[checksum] ^= 1;
        assert!(
            stream::archive(
                &mut compressed.as_slice(),
                SourceDistExtension::Legacy(LegacySourceDistExtension::TarLz),
                TempDir::new()?,
            )
            .await
            .is_err()
        );
        Ok(())
    }

    #[tokio::test]
    async fn reject_truncated_lzip_header() -> anyhow::Result<()> {
        let _preview = uv_preview::test::with_features(&[]);
        let mut bytes = b"LZIP\x01".as_slice();
        assert!(
            stream::archive(
                &mut bytes,
                SourceDistExtension::Legacy(LegacySourceDistExtension::Tlz),
                TempDir::new()?,
            )
            .await
            .is_err()
        );
        Ok(())
    }

    #[test]
    fn test_validate_archive_member_name() {
        for (testcase, ok) in &[
            // Valid cases.
            ("normal.txt", true),
            ("__init__.py", true),
            ("fine i guess.py", true),
            ("🌈.py", true),
            // Invalid cases.
            ("", false),
            ("new\nline.py", false),
            ("carriage\rreturn.py", false),
            ("tab\tcharacter.py", false),
            ("null\0byte.py", false),
            ("control\x01code.py", false),
            ("control\x02code.py", false),
            ("control\x03code.py", false),
            ("control\x04code.py", false),
            ("backspace\x08code.py", false),
            ("delete\x7fcode.py", false),
        ] {
            assert_eq!(
                super::validate_archive_member_name(testcase).is_ok(),
                *ok,
                "testcase: {testcase}"
            );
        }
    }

    #[test]
    fn test_unacceptable_filename_error_replaces_control_characters() {
        let err = super::validate_archive_member_name("bad\nname").unwrap_err();
        match err {
            super::Error::UnacceptableFilename { filename } => {
                assert_eq!(filename, "bad�name");
            }
            _ => panic!("expected UnacceptableFilename error"),
        }
    }
}
