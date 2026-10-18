# Bun vs Python scraper — résultats

Site : https://news.ycombinator.com/ (public, choisi faute d'URL fournie). 5 exécutions chacun, 2026-10-18.

| Scraper | Médiane | Min | Max | Titre | Items (titleline) |
|---|---|---|---|---|---|
| Bun `fetch` + `HTMLRewriter` | 218 ms | 203 ms | 754 ms | Hacker News | 30 |
| Python `cloudscraper` (requests) | 2198 ms | 922 ms | 2464 ms | Hacker News | 30 |

Reproduction : `bun bench/compare-scrapers.ts` (Bun) et `uv run --with requests --with ./python python bench/compare-scrapers.py <url> 5` (Python).

Limites : une seule page, un seul réseau, pas de contournement de protection (le site ne sert pas de challenge). Le temps Python inclut la première négociation cloudscraper.

## Crunchyroll (URL fournie par l'utilisateur, 2026-10-18)

https://www.crunchyroll.com/fr/series/GT00389311/dragon-ball-super-beerus — 3 exécutions Python, 5 Bun, requête GET simple sans contournement de protection.

| Scraper | Médiane | Statut | Titre renvoyé | Items |
|---|---|---|---|---|
| Bun `fetch` + `HTMLRewriter` | 242 ms | 200 | « Crunchyroll: Watch Popular Anime, Play Games & Shop Online » | 0 |
| Python `cloudscraper` | 1906 ms | 200 | identique | 0 |

Les deux reçoivent la page d'accueil générique, pas la fiche de la série (contenu rendu côté client ou redirection) : la comparaison mesure la latence et l'accès, pas l'extraction. Le sélecteur `span.titleline` est propre à Hacker News et ne s'applique pas ici.
