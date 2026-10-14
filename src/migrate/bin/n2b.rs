// SPDX-License-Identifier: Apache-2.0

fn main() -> std::process::ExitCode {
    bun_migrate::install_crypto_provider();
    match bun_migrate::run_from_env() {
        Ok(code) => code,
        Err(error) => {
            eprintln!("n2b: {error:#}");
            std::process::ExitCode::from(2)
        },
    }
}
