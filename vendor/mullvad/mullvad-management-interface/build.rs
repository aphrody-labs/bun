fn main() {
    let protobuf_include = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../chromium/src/third_party/protobuf/src");
    let protobuf_include = protobuf_include.to_str().unwrap();

    println!("cargo:rerun-if-changed={protobuf_include}");

    // Compile both proto files together so they can reference each other
    tonic_prost_build::configure()
        .with_extended_rust_types(true)
        .compile_protos(
            &[
                "proto/management_interface.proto",
                "proto/relay_selector.proto",
            ],
            &["proto/", protobuf_include],
        )
        .unwrap();
}
