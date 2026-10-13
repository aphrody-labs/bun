use std::{env, path::Path};

fn main() {
    for name in [
        "NGINX_SOURCE_DIR",
        "NGINX_BUILD_DIR",
        "BUN_NGINX_CONFIGURATION_SHA256",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
        let value = env::var(name)
            .unwrap_or_else(|_| panic!("{name} must select the canonical configured NGINX owner"));
        if name == "BUN_NGINX_CONFIGURATION_SHA256" {
            assert!(
                value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit()),
                "invalid NGINX configuration digest"
            );
            println!("cargo:rustc-env={name}={value}");
        } else {
            assert!(
                Path::new(&value).is_absolute() && Path::new(&value).is_dir(),
                "{name} must be an existing absolute directory"
            );
        }
    }
    let build = env::var("NGINX_BUILD_DIR").expect("validated NGINX build directory");
    assert!(
        Path::new(&build).join("ngx_auto_config.h").is_file(),
        "NGINX configure must run before bindgen"
    );
    if cfg!(target_os = "macos") {
        println!("cargo:rustc-link-arg=-undefined");
        println!("cargo:rustc-link-arg=dynamic_lookup");
    }
}
