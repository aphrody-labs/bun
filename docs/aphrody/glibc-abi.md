# Compatibilité ABI glibc

La cible Rust `x86_64-unknown-linux-gnu` annonce une prise en charge de glibc 2.17 ou plus. Cette valeur décrit le support de la cible Rust et de sa bibliothèque standard ; elle ne qualifie pas à elle seule un exécutable qui embarque d'autres dépendances natives. Voir la [table officielle des cibles Rust](https://doc.rust-lang.org/rustc/platform-support.html#tier-1-with-host-tools) et le [manuel GNU libc](https://sourceware.org/glibc/manual/).

Pour les binaires Bun GNU du fork, le contrat de release est contrôlé sur l'ELF : `scripts/build/binary-expectations.ts` limite les imports de symboles à `GLIBC_2.17`, et `verify-binary.ts` applique cette limite aux builds CI épinglés. Un import d'une version plus récente invalide ce contrat.

Le sysroot de compilation du binaire est Ubuntu 20.04 (glibc 2.31), car c'est l'environnement du prébuild WebKit utilisé par Bun. La matrice exécute ensuite un smoke test dans Debian Bullseye (glibc 2.31) et dans Ubuntu 26.04. Ces exécutions vérifient respectivement le runtime ancien retenu par la matrice et la génération des hôtes Aphrody ; elles ne remplacent pas le contrôle ELF de la limite 2.17.

Les extensions natives Rust publiées séparément ont leur propre chaîne de compilation et leurs propres tests de chargement. Elles ne sont pas qualifiées par les contrôles ELF du binaire Bun.
