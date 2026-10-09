# SSH and Git: what moved from aphrody into the Bun fork

aphrody carried its own SSH client (russh, russh-sftp, fast_rsync in `crates/infra/ssh`) and Git/GitHub layer (gix, octocrab in `crates/infra/git`), next to many `Command::new("ssh" | "git" | "gh")` call sites. The fork now owns the low-level part as `bun ssh` (`src/ssh`, crate `bun_ssh`) and `bun git` (`src/git`, crate `bun_git`). Neither rewrites a tool that is already installed. Each detects and drives it first:

- the system OpenSSH (`ssh`, `scp`, `sftp`, `ssh-keygen`, `ssh-add`, `sshd`): Windows `System32\OpenSSH`, Win32-OpenSSH, Git for Windows `usr\bin`, or the Linux/macOS system one;
- `rsync`;
- Git for Windows or the system `git`;
- the GitHub CLI `gh`.

The in-process code only runs when the tool is missing, or when a structured (JSON) result is needed. aphrody keeps what talks to its hosts and services (inventories, deploy, probes, sysctl tuning, monitors). It calls `bun ssh` / `bun git` instead of its own transport.

## Origin of the code

The aphrody sources come from `aphrody-labs/aphrody` revision `55fdf5e127`, Apache-2.0. The license is recorded in `[package.metadata.aphrody-source]` of `src/ssh/Cargo.toml`.

| Fork file                     | Origin                                                                    | Change                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/ssh/native.rs`           | aphrody `crates/infra/ssh/src/in_process.rs`                              | Host-key verification via `known_hosts`, agent/keys/password auth, `ProxyJump`, PTY, remote forwards     |
| `src/ssh/rsync.rs`            | aphrody `crates/infra/ssh/src/rsync.rs`                                   | Verbatim (fast_rsync signatures and deltas)                                                             |
| `src/ssh/forward.rs`          | aphrody `crates/infra/ssh/src/tunnel.rs` (service tunnels = `-L` specs)   | Generalized to `-L`, `-R`, `-D` (SOCKS5)                                                                |
| `src/ssh/config.rs`           | aphrody `crates/infra/ssh/src/lib.rs` (host table, `run_ssh`)             | Hosts come from `ssh -G` or `~/.ssh/config`; no built-in host table                                     |
| `src/ssh/system.rs`           | new                                                                       | Tool discovery (PATH, well-known install dirs, `BUN_SSH_<TOOL>` overrides)                              |
| `src/ssh/auth.rs`, `keys.rs`, `known_hosts.rs`, `term.rs` | new, on russh / ssh-key                       | ssh-agent (Unix socket, Windows pipe, Pageant), keygen, known_hosts, raw terminal (termios, VT console)  |
| `src/ssh/server.rs`           | new, on russh server + russh-sftp server                                  | Embedded server (exec, shell, SFTP, forwards); system `sshd` management                                 |
| `vendor/russh-sftp`           | [russh-sftp](https://github.com/AspectUnk/russh-sftp) 3.0.1, Apache-2.0   | `serde` pinned to the workspace version; `fetch_update` → `try_update`                                  |

Crates.io dependencies: russh 0.64.1 (aws-lc-rs backend, so NASM is needed on Windows builds), fast_rsync 0.2, tokio and clap. TLS for HTTPS goes through Bun's client (BoringSSL). It follows `SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS` and the Windows certificate store, like `fetch`.

## Decisions

| aphrody                                                            | Decision | Fork                                         | Reason                                                     |
| ------------------------------------------------------------------ | -------- | -------------------------------------------- | ---------------------------------------------------------- |
| `aphrody-ssh` binary, `infra ssh exec` transport (`run_ssh`)       | MIGRATE  | `bun ssh <host> <cmd>`, `bun ssh exec --json` | Same OpenSSH, plus multiplexing on Unix and a native fallback |
| `in_process.rs` SFTP (`stat`, `read_dir`, `tree`, `read_file`, `write_file`, differential upload) | MIGRATE | `bun ssh sftp`, `bun ssh cp [--delta]` | JSON output keeps the aphrody shapes                       |
| `tunnel.rs` service tunnels                                        | MIGRATE  | `bun ssh forward -L`                          | Prints the bound port as JSON                              |
| Host inventory, `monitor`/`tune`/`audit` parsers, sysctl, deploy   | KEEP     | —                                            | aphrody's hosts and services                               |
| `aphrody git api\|graphql\|repo\|search` (octocrab)                | MIGRATE  | `bun git api\|graphql\|repo\|search`          | `gh`-compatible, through Bun's HTTP client                  |
| `aphrody git inspect` (gix), `local_git`                           | MIGRATE  | `bun git` read commands (gix), others delegated to `git` | In progress                                      |
| `git_ingest` on a repository URL, upstream catalogue               | KEEP     | —                                            | Network services (see `agent-plugin-migration.md`)         |
