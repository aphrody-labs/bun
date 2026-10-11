---
name: bun-runtime
description: "Développer, exécuter, installer et vérifier les projets JavaScript ou TypeScript d'Omar avec le runtime Bun maison 1.4.4 d'Aphrody Labs."
---
Utiliser exclusivement le runtime maison Bun 1.4.4 pour les projets JavaScript/TypeScript d'Omar. Vérifier bun --version et le chemin du binaire ; celui observé est C:/Users/omara/.bun/bin/bun.exe.
Lire les AGENTS.md, package.json et lockfiles du projet. Employer ses scripts via bun run, son installation via bun install et ses tests via bun test quand adaptés.
Ne pas installer un Bun public ou remplacer la version maison par une autre distribution. Si la version diffère, diagnostiquer la résolution du binaire et retrouver le runtime demandé.
Pour les capacités maison, consulter les sources locales et le catalogue Aphrody. Pour la documentation Bun, réutiliser les outils MCP du kernel Aphrody : bun_docs_list, bun_docs_search, bun_docs_read, bun_node_equivalent. Leur disponibilité dépend de la session ; ce plugin ne lance aucun MCP supplémentaire.
Les comportements spécifiques au fork maison doivent être vérifiés dans ses sources ou par une exécution locale ciblée.
