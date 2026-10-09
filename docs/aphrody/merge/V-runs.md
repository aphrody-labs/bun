# V : passe lourde sur le VPS (état des runs)

Hôte : vps-203bea89 (12 CPU, 45 Go, Ubuntu 26.04). Tout sous `nice -n 19 ionice -c3`, conteneurs `--cpu-shares 256`.
Runner de ces runs (retiré depuis, `~/yolo` n'existe plus ; espaces actuels sous `~/build/w/<espace>`, logs `~/build/w/logs`) :
`run.sh <job> '<cmd>'` (tmux, log `logs/<job>.log`, code `<job>.exit`), `status.sh`, `dk.sh <image> <espace> '<cmd>'` (espace monté sur `/work`,
volumes `yolo-cargo-registry`, `yolo-bun-install-<distro>`, `yolo-build-cache-<distro>`, `yolo-ccache-<distro>`, `yolo-sccache-<distro>`).

| Job | Commit testé | Statut | Durée | Preuve / remarque |
| --- | --- | --- | --- | --- |
| J1 image `aphrody/build-linux:26.04` | bun c6a6689e23 | ✅ | 678 s | `logs/j1.log` (clang 23, nightly-2026-09-15, bun 1.4.2) |
| J2 image Alpine | bun c6a6689e23 | ⚠️ repli | 180 s | `aphrody-alpine.Dockerfile` échoue : le dépôt apk publié `aphrody-3.24-x86_64` ne contient que 5 paquets `cosmic-*` (bun, aphrody, n2b, aphrody-bun-build-deps, sudo-rs… absents) car tous les jobs CI « Aphrody packages » échouent. Image retenue : `aphrody/build-alpine:3.24` (alpine.Dockerfile de fd278401fca, llvm23@edge) |
| J3 debug glibc + tests | 2cfb53faac0 | ⏳ | | essais successifs : E0425 `OSPathSliceZ` dans `FileCopier.rs:257` (1e76474491a) → 5a5a24ff69f ; `bindings.cpp:6382` `JSC::jsDynamicCast` inconnu (c9408c68abe) → ca8ae19c821 ; codegen `JestModuleMock.ts:5` type fléché en paramètre (5838e806733) → 2cfb53faac0 ; relancé |
| J4 debug musl + tests | 2cfb53faac0 | ⏳ | | E0502 `src/sys/bun_accel.rs:63` (1e76474491a) → a4590271ba0, puis mêmes échecs que J3 ; relancé |
| J5 release glibc puis musl | a4590271ba0 / b1f11fc963 | ⏳ | | glibc ❌ E0425 FileCopier (corrigé 5a5a24ff69f) ; relance complète en file (`j5b`) |
| J6 rust:check-all / deny / nextest | en cours | ⏳ | | `vendor/lolhtml`/`build_options.rs` absents (environnement) → job corrigé (`clone-lolhtml`, `clone-rust-argon2`, `rust-codegen-ready`) ; check-all : `expect.rs:1824` `not_implemented_static_fn` mort (984c0a12081, dead_code refusé) → ca8ae19c821 ; relance en file (`j6b`) |
| J7 abuild aphrody/* | aports 928e81e9392 | ⏳ | | zlib-rs (c_variadic instable) → 91f1df49ca8 ✅ ; uutils-findutils (3 tests en root), rust-stable/rust-nightly (busybox unxz « corrupted data », xz OK : `logs/xztest.log`), system76-scheduler (sched_param musl), linux-aphrody (libclang pour bindgen, pkgdesc v3 > 128) → 2f9b564280f ; CI 37878513267 : rust-stable/nightly (`install.sh` sans bash), system76-scheduler (`open64` absent de musl via getrandom 0.2.8), uutils-findutils (`xargs_explicit_size_can_exceed_default_cap`) → 326cfa16b89 + 2eea3519f99 ; CI aarch64 v3 : `aegis128-neon-inner.c` « instruction requires: aes » (KCFLAGS -march sans +crypto) → 261d7463bd9 ; job : `abuild checksum` si `sha512sums=""` comme publish.ts ; cosmic-sound-theme, cosmic-wallpapers, cosmic-monitor, uutils-diffutils ✅ |
| J8 images aphrody-os | aphrody c46a59b7 | ❌ bloqué | 22 s | `runtime` ✅ ; `cli`/`desktop` : `aphrody-rust-base (no such package)` (même cause que J2) |
| J9 aphrody Linux | aphrody 75bbbf51 | ⏳ | | install ✅ ; typecheck:packages ❌ : m3-example (`@aphrody/m3/config`, `/plugin` introuvables, m3 en cours chez F3), rag-core (`#cli-wasm-glue` généré absent : le job le génère désormais avec le Bun release du fork, `bun:wasm` absent du Bun 1.4.3 de l’hôte) |
| J10 bun-oxc + bun-cosmic | bun 5a5a24ff69f | ⏳ | | `lint.rs:196-197` : feature `ruledocs` d’oxc_linter non activée (6922c5edba7) et Cargo.lock sans oxc-tools/napi → d29799bdee2 ; lockfile ✅, test ✅, clippy ✅ (170 s), napi en cours |
| bun-types (Bun système) | bun 1498e391c8 | ✅ | 760 s | 22 pass / 0 fail |
