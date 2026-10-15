// SPDX-License-Identifier: Apache-2.0
//! Explicit private-data gate; retained sources and the baseline export remain read-only.
use std::{collections::{BTreeMap, HashSet},path::{Path, PathBuf}};
use bun_browser_crawl::dragon_ball::{DragonBallDocument,reproject_captures};
use serde_json::Value;
use sha2::{Digest,Sha256};

fn digest(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut output = String::with_capacity(64);
    for byte in Sha256::digest(bytes) { write!(&mut output,"{byte:02x}").unwrap(); }
    output
}
fn private_directory(path: &Path) {
    let mut builder = std::fs::DirBuilder::new();
    #[cfg(unix)] { use std::os::unix::fs::DirBuilderExt; builder.mode(0o700); }
    builder.create(path).expect("Create new private evidence directory");
}

#[test]
#[ignore = "requires SHENRON_REPROJECT_CAPTURES, SHENRON_REPROJECT_BASELINE and new SHENRON_REPROJECT_JOB absolute private paths"]
fn retained_capture_reprojection_preserves_pinned_documents_and_seals_new_export() {
    let required = |key| PathBuf::from(std::env::var_os(key).expect("Explicit private gate paths required"));
    let captures = required("SHENRON_REPROJECT_CAPTURES");
    let baseline = required("SHENRON_REPROJECT_BASELINE");
    let job = required("SHENRON_REPROJECT_JOB");
    assert!(captures.is_absolute() && baseline.is_absolute() && job.is_absolute());
    let baseline_bytes = std::fs::read(&baseline).expect("Read immutable baseline");
    let baseline_sha256 = digest(&baseline_bytes);
    let mut expected = BTreeMap::new();
    for line in baseline_bytes.split(|byte| *byte == b'\n').filter(|line| !line.is_empty()) {
        assert!(line.len() <= 2*1024*1024);
        let document: DragonBallDocument = serde_json::from_slice(line).map_err(|_| "Invalid baseline schema").unwrap();
        assert!(document.document_uid.len()==64 && document.document_uid.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert!(expected.insert(document.document_uid.clone(),document).is_none());
    }
    assert_eq!(expected.len(),349,"Pinned historical corpus cardinality");
    private_directory(&job);
    let snapshot = job.join("captures"); private_directory(&snapshot);
    let mut directories = vec![(captures,0)];
    let mut found = HashSet::new();
    let mut source_hashes = Vec::new();
    while let Some((directory,depth)) = directories.pop() {
        for entry in std::fs::read_dir(directory).expect("Read retained capture directory") {
            let entry = entry.unwrap(); let kind = entry.file_type().unwrap();
            assert!(!kind.is_symlink());
            if kind.is_dir() { assert!(depth<2); directories.push((entry.path(),depth+1)); continue; }
            if entry.path().extension().is_none_or(|extension| extension!="json") { continue; }
            assert!(entry.metadata().unwrap().len()<=4*1024*1024);
            let bytes = std::fs::read(entry.path()).expect("Read retained source bytes");
            let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Invalid capture schema").unwrap();
            let document: DragonBallDocument = serde_json::from_value(value["document"].clone()).map_err(|_| "Invalid capture document").unwrap();
            let Some(original) = expected.get(&document.document_uid) else { continue };
            assert!(serde_json::to_value(&document).unwrap()==serde_json::to_value(original).unwrap(),"Retained capture must match exact staged document");
            assert!(found.insert(document.document_uid.clone()));
            let path = snapshot.join(format!("{}.json",document.document_uid));
            let mut options = std::fs::OpenOptions::new(); options.write(true).create_new(true);
            #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
            use std::io::Write;
            let mut file = options.open(path).unwrap(); file.write_all(&bytes).unwrap(); file.sync_all().unwrap();
            source_hashes.push((entry.path(),digest(&bytes)));
        }
    }
    assert_eq!(found.len(),expected.len(),"Every staged identity has exact retained source evidence");
    let output = job.join("native-export-reprojected-v1.jsonl");
    let report = reproject_captures(&snapshot,&output).expect("Canonical reprojection must preserve protected document fields");
    assert_eq!(report.documents,349);
    assert_eq!(report.skipped_media,28);
    let mut observed = HashSet::new();
    for line in std::fs::read(&output).unwrap().split(|byte| *byte==b'\n').filter(|line| !line.is_empty()) {
        let document: DragonBallDocument = serde_json::from_slice(line).map_err(|_| "Invalid reprojected document").unwrap();
        let mut original = expected[&document.document_uid].clone();
        assert!(document.payload.embedded_media.iter().all(|media| url::Url::parse(&media.url).is_ok_and(|url|url.scheme()=="https" && url.username().is_empty() && url.password().is_none())));
        original.payload.embedded_media = document.payload.embedded_media.clone();
        assert!(serde_json::to_value(original).unwrap()==serde_json::to_value(&document).unwrap(),"Only media references may change");
        assert!(observed.insert(document.document_uid));
    }
    assert_eq!(observed.len(),349);
    for (path,hash) in source_hashes { assert!(digest(&std::fs::read(path).unwrap())==hash,"Original source bytes unchanged"); }
    assert!(digest(&std::fs::read(&baseline).unwrap())==baseline_sha256,"Original export unchanged");
    let receipt = serde_json::json!({"baselineSha256":baseline_sha256,"reprojection":report,"originalSourcesUnchanged":true});
    let path = job.join("reprojection-receipt.json");
    let mut options = std::fs::OpenOptions::new(); options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    use std::io::Write;
    let mut file = options.open(path).unwrap(); file.write_all(&serde_json::to_vec_pretty(&receipt).unwrap()).unwrap(); file.sync_all().unwrap();
}
