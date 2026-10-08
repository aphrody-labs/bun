// SPDX-License-Identifier: Apache-2.0

fn main() -> std::process::ExitCode {
    aphrody_n2b::install_crypto_provider();
    match aphrody_n2b::run_from_env() {
        Ok(code) => code,
        Err(error) => {
            eprintln!("n2b: {error:#}");
            std::process::ExitCode::from(2)
        },
    }
}
