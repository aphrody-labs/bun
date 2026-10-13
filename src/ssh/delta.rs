//! Versioned, bounded-memory delta uploads over an authenticated SSH exec stream.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub const CHUNK: usize = 2 * 1024 * 1024;
const MAX_DELTA: usize = 2 * CHUNK + 4096;
const MAX_SIGNATURE: usize = 12 + (CHUNK / 2048 + 1) * 20;
const MAX_FILE: u64 = 1024 * 1024 * 1024 * 1024;
const IDLE: Duration = Duration::from_secs(30);

#[derive(Serialize, Deserialize)]
struct Capabilities {
    protocol: u32,
    implementation: String,
    version: String,
    chunk_bytes: usize,
    algorithm: String,
    integrity: String,
    original_size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TransferSummary {
    pub protocol: u32,
    pub original_size: u64,
    pub modified_size: u64,
    pub signature_bytes: u64,
    pub delta_bytes: u64,
    pub chunks: u64,
}

fn invalid(message: &str) -> Error {
    Error::InvalidInput(message.into())
}

async fn read_exact<R: AsyncRead + Unpin>(reader: &mut R, bytes: &mut [u8]) -> Result<()> {
    tokio::time::timeout(IDLE, reader.read_exact(bytes))
        .await
        .map_err(|_| Error::Timeout(30))??;
    Ok(())
}

async fn write_all<W: AsyncWrite + Unpin>(writer: &mut W, bytes: &[u8]) -> Result<()> {
    tokio::time::timeout(IDLE, writer.write_all(bytes))
        .await
        .map_err(|_| Error::Timeout(30))??;
    tokio::time::timeout(IDLE, writer.flush())
        .await
        .map_err(|_| Error::Timeout(30))??;
    Ok(())
}

async fn frame<R: AsyncRead + Unpin>(reader: &mut R, maximum: usize) -> Result<Vec<u8>> {
    let mut size = [0; 4];
    read_exact(reader, &mut size).await?;
    let size = u32::from_be_bytes(size) as usize;
    if size > maximum {
        return Err(invalid("delta protocol frame exceeded its bound"));
    }
    let mut bytes = vec![0; size];
    read_exact(reader, &mut bytes).await?;
    Ok(bytes)
}

async fn write_frame<W: AsyncWrite + Unpin>(writer: &mut W, bytes: &[u8]) -> Result<()> {
    write_all(writer, &(bytes.len() as u32).to_be_bytes()).await?;
    write_all(writer, bytes).await
}

fn chunk(file: &mut std::fs::File, data: &mut [u8]) -> Result<usize> {
    let mut length = 0;
    while length < data.len() {
        let count = file.read(&mut data[length..])?;
        if count == 0 {
            break;
        }
        length += count;
    }
    Ok(length)
}

struct BoundedOutput {
    bytes: Vec<u8>,
    maximum: usize,
}
impl Write for BoundedOutput {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > self.maximum.saturating_sub(self.bytes.len()) {
            return Err(std::io::Error::other(
                "delta expanded beyond declared chunk size",
            ));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

struct Staging {
    path: PathBuf,
    published: bool,
}
impl Drop for Staging {
    fn drop(&mut self) {
        if !self.published {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FileIdentity {
    size: u64,
    modified: std::time::SystemTime,
    volume: u64,
    file_id: u64,
}

fn target_identity(path: &Path) -> Result<Option<FileIdentity>> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) => {
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err(invalid(
                    "delta target must be a regular file, never a symbolic link",
                ));
            }
            #[cfg(unix)]
            let (volume, file_id) = {
                use std::os::unix::fs::MetadataExt;
                (meta.dev(), meta.ino())
            };
            #[cfg(windows)]
            let (volume, file_id) = {
                use std::os::windows::io::AsRawHandle;
                use windows_sys::Win32::Storage::FileSystem::{
                    BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
                };
                let file = std::fs::File::open(path)?;
                // The handle owns the identity query; no raw handle survives this scope.
                let mut info = unsafe { std::mem::zeroed::<BY_HANDLE_FILE_INFORMATION>() };
                if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
                    return Err(std::io::Error::last_os_error().into());
                }
                (
                    u64::from(info.dwVolumeSerialNumber),
                    (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow),
                )
            };
            #[cfg(not(any(unix, windows)))]
            return Err(invalid(
                "native delta file identity is unavailable on this platform",
            ));
            #[cfg(any(unix, windows))]
            Ok(Some(FileIdentity {
                size: meta.len(),
                modified: meta.modified()?,
                volume,
                file_id,
            }))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// The receiver touches only the explicitly selected destination and a fresh sibling staging file.
pub async fn receive<R: AsyncRead + Unpin, W: AsyncWrite + Unpin>(
    reader: &mut R,
    writer: &mut W,
    target: &Path,
) -> Result<TransferSummary> {
    if !target.is_absolute() {
        return Err(invalid("delta receiver requires an absolute destination"));
    }
    let parent = target
        .parent()
        .ok_or_else(|| invalid("delta destination has no parent"))?;
    let parent = std::fs::canonicalize(parent)?;
    let target = parent.join(
        target
            .file_name()
            .ok_or_else(|| invalid("delta destination has no filename"))?,
    );
    let initial = target_identity(&target)?;
    if initial.is_some_and(|identity| identity.size > MAX_FILE) {
        return Err(invalid("delta base file exceeds one TiB"));
    }
    let mut base = initial.map(|_| std::fs::File::open(&target)).transpose()?;
    let path = parent.join(format!(
        ".bun-delta-{}-{:016x}.part",
        std::process::id(),
        rand::random::<u64>()
    ));
    let mut output = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)?;
    let mut staging = Staging {
        path: path.clone(),
        published: false,
    };
    if initial.is_some() {
        output.set_permissions(std::fs::metadata(&target)?.permissions())?;
    }
    #[cfg(unix)]
    if initial.is_none() {
        use std::os::unix::fs::PermissionsExt;
        output.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    let caps = Capabilities {
        protocol: 1,
        implementation: "bun-ssh".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        chunk_bytes: CHUNK,
        algorithm: "fast_rsync/md4-16".into(),
        integrity: "sha256".into(),
        original_size: initial.map_or(0, |identity| identity.size),
    };
    write_frame(
        writer,
        &serde_json::to_vec(&caps).map_err(|_| invalid("delta capability encoding failed"))?,
    )
    .await?;
    let mut report = TransferSummary {
        protocol: 1,
        original_size: caps.original_size,
        modified_size: 0,
        signature_bytes: 0,
        delta_bytes: 0,
        chunks: 0,
    };
    let mut original = vec![0; CHUNK];
    let mut hash = Sha256::new();
    loop {
        let size = if let Some(base) = base.as_mut() {
            chunk(base, &mut original)?
        } else {
            0
        };
        let signature = crate::rsync::compute_signature(
            &original[..size],
            crate::rsync::RsyncOptions::default(),
        );
        report.signature_bytes += signature.len() as u64;
        write_frame(writer, &signature).await?;
        let mut tag = [0];
        read_exact(reader, &mut tag).await?;
        if tag[0] == 0 {
            let mut expected = [0; 40];
            read_exact(reader, &mut expected).await?;
            let expected_size = u64::from_be_bytes(expected[..8].try_into().unwrap());
            if expected_size != report.modified_size || hash.finalize().as_slice() != &expected[8..]
            {
                return Err(invalid("delta reconstructed file SHA-256 or size mismatch"));
            }
            output.sync_all()?;
            drop(output);
            drop(base);
            if target_identity(&target)? != initial {
                return Err(invalid(
                    "delta destination changed during transfer; preserved",
                ));
            }
            std::fs::rename(&path, &target)?;
            staging.published = true;
            write_frame(
                writer,
                &serde_json::to_vec(&report)
                    .map_err(|_| invalid("delta report encoding failed"))?,
            )
            .await?;
            return Ok(report);
        }
        if tag[0] != 1 {
            return Err(invalid("unknown delta protocol operation"));
        }
        let mut declared = [0; 4];
        read_exact(reader, &mut declared).await?;
        let declared = u32::from_be_bytes(declared) as usize;
        if declared == 0 || declared > CHUNK || report.modified_size > MAX_FILE - declared as u64 {
            return Err(invalid("delta chunk/file size exceeded its bound"));
        }
        let delta = frame(reader, MAX_DELTA).await?;
        let mut applied = BoundedOutput {
            bytes: Vec::with_capacity(declared),
            maximum: declared,
        };
        fast_rsync::apply(&original[..size], &delta, &mut applied)
            .map_err(crate::rsync::RsyncError::from)?;
        if applied.bytes.len() != declared {
            return Err(invalid("delta chunk has an incorrect reconstructed size"));
        }
        output.write_all(&applied.bytes)?;
        hash.update(&applied.bytes);
        report.modified_size += declared as u64;
        report.delta_bytes += delta.len() as u64;
        report.chunks += 1;
        write_all(writer, &[1]).await?;
    }
}

pub async fn send<R: AsyncRead + Unpin, W: AsyncWrite + Unpin>(
    reader: &mut R,
    writer: &mut W,
    source: &Path,
) -> Result<TransferSummary> {
    let identity =
        target_identity(source)?.ok_or_else(|| invalid("delta source does not exist"))?;
    if identity.size > MAX_FILE {
        return Err(invalid("delta source exceeds one TiB"));
    }
    let mut input = std::fs::File::open(source)?;
    let caps: Capabilities = serde_json::from_slice(&frame(reader, 2048).await?)
        .map_err(|_| invalid("remote Bun did not provide delta protocol capabilities"))?;
    if caps.protocol != 1
        || caps.implementation != "bun-ssh"
        || caps.version.is_empty()
        || caps.version.len() > 64
        || caps.chunk_bytes != CHUNK
        || caps.algorithm != "fast_rsync/md4-16"
        || caps.integrity != "sha256"
        || caps.original_size > MAX_FILE
    {
        return Err(invalid(
            "remote Bun delta version/capabilities are incompatible",
        ));
    }
    let mut hash = Sha256::new();
    let mut modified = vec![0; CHUNK];
    let mut size = 0_u64;
    loop {
        let signature = frame(reader, MAX_SIGNATURE).await?;
        let length = chunk(&mut input, &mut modified)?;
        if length == 0 {
            if size != identity.size || target_identity(source)? != Some(identity) {
                return Err(invalid("delta source changed during transfer"));
            }
            write_all(writer, &[0]).await?;
            let mut final_frame = Vec::with_capacity(40);
            final_frame.extend_from_slice(&size.to_be_bytes());
            final_frame.extend_from_slice(&hash.finalize());
            write_all(writer, &final_frame).await?;
            let report: TransferSummary = serde_json::from_slice(&frame(reader, 2048).await?)
                .map_err(|_| invalid("remote Bun delta acknowledgement is invalid"))?;
            if report.protocol != 1
                || report.modified_size != size
                || report.original_size != caps.original_size
            {
                return Err(invalid("remote Bun delta acknowledgement size mismatch"));
            }
            return Ok(report);
        }
        if size > MAX_FILE - length as u64 {
            return Err(invalid("delta source exceeded its file bound"));
        }
        let delta = crate::rsync::compute_delta(&signature, &modified[..length])?;
        if delta.len() > MAX_DELTA {
            return Err(invalid("computed delta exceeded its chunk bound"));
        }
        write_all(writer, &[1]).await?;
        write_all(writer, &(length as u32).to_be_bytes()).await?;
        write_frame(writer, &delta).await?;
        let mut ack = [0];
        read_exact(reader, &mut ack).await?;
        if ack != [1] {
            return Err(invalid("remote Bun delta chunk acknowledgement failed"));
        }
        hash.update(&modified[..length]);
        size += length as u64;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Files(PathBuf);
    impl Files {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "bun-delta-fixture-{}-{:016x}",
                std::process::id(),
                rand::random::<u64>()
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn at(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
        fn no_staging(&self) {
            assert!(std::fs::read_dir(&self.0).unwrap().all(|entry| {
                !entry
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".bun-delta-")
            }));
        }
    }
    impl Drop for Files {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn multi_chunk_transfer_reconstructs_bytes_without_sending_the_base() {
        let files = Files::new();
        let source = files.at("source.bin");
        let target = files.at("target.bin");
        let base = vec![77_u8; CHUNK + 8192];
        let mut modified = base.clone();
        modified[4096..4104].copy_from_slice(b"changed!");
        std::fs::write(&source, &modified).unwrap();
        std::fs::write(&target, &base).unwrap();
        crate::runtime().unwrap().block_on(async {
            let (local, remote) = tokio::io::duplex(4096);
            let (mut local_read, mut local_write) = tokio::io::split(local);
            let (mut remote_read, mut remote_write) = tokio::io::split(remote);
            let (sent, received) = tokio::join!(
                send(&mut local_read, &mut local_write, &source),
                receive(&mut remote_read, &mut remote_write, &target)
            );
            let sent = sent.unwrap();
            let received = received.unwrap();
            assert_eq!(sent.modified_size, modified.len() as u64);
            assert_eq!(received.chunks, 2);
            assert!(sent.delta_bytes < modified.len() as u64 / 32);
            assert!(sent.signature_bytes < modified.len() as u64 / 32);
        });
        assert_eq!(std::fs::read(&target).unwrap(), modified);
        files.no_staging();
    }

    #[test]
    fn bad_final_hash_preserves_target_and_removes_only_fresh_staging() {
        let files = Files::new();
        let target = files.at("target.bin");
        std::fs::write(&target, b"preserved target").unwrap();
        std::fs::write(files.at("unrelated.part"), b"unrelated").unwrap();
        let error = crate::runtime().unwrap().block_on(async {
            let (local, mut peer) = tokio::io::duplex(4096);
            let (mut reader, mut writer) = tokio::io::split(local);
            let (result, written) = tokio::join!(
                receive(&mut reader, &mut writer, &target),
                peer.write_all(&[0; 41])
            );
            written.unwrap();
            result.unwrap_err()
        });
        assert!(error.to_string().contains("SHA-256"));
        assert_eq!(std::fs::read(&target).unwrap(), b"preserved target");
        assert_eq!(
            std::fs::read(files.at("unrelated.part")).unwrap(),
            b"unrelated"
        );
        files.no_staging();
    }

    #[test]
    fn aborted_input_cleans_staging_and_keeps_existing_bytes() {
        let files = Files::new();
        let target = files.at("target.bin");
        std::fs::write(&target, b"preserved on abort").unwrap();
        crate::runtime().unwrap().block_on(async {
            let (local, mut peer) = tokio::io::duplex(4096);
            peer.shutdown().await.unwrap();
            let (mut reader, mut writer) = tokio::io::split(local);
            assert!(receive(&mut reader, &mut writer, &target).await.is_err());
        });
        assert_eq!(std::fs::read(&target).unwrap(), b"preserved on abort");
        files.no_staging();
    }

    #[test]
    fn replacement_with_identical_length_and_timestamp_has_a_different_identity() {
        let files = Files::new();
        let target = files.at("target.bin");
        std::fs::write(&target, b"old").unwrap();
        let before = target_identity(&target).unwrap().unwrap();
        let replacement = files.at("replacement.bin");
        std::fs::write(&replacement, b"new").unwrap();
        std::fs::File::open(&replacement)
            .unwrap()
            .set_modified(before.modified)
            .unwrap();
        std::fs::rename(replacement, &target).unwrap();
        let after = target_identity(&target).unwrap().unwrap();
        assert_eq!(before.size, after.size);
        assert_eq!(before.modified, after.modified);
        assert_ne!(
            (before.volume, before.file_id),
            (after.volume, after.file_id)
        );
    }
}
