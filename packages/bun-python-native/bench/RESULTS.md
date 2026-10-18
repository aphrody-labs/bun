# Bun vs Python scraper — résultats

Site : https://news.ycombinator.com/ (public, choisi faute d'URL fournie). 5 exécutions chacun, 2026-10-18.

| Scraper | Médiane | Min | Max | Titre | Items (titleline) |
|---|---|---|---|---|---|
| Bun `fetch` + `HTMLRewriter` | 218 ms | 203 ms | 754 ms | Hacker News | 30 |
| Python `cloudscraper` (requests) | 2198 ms | 922 ms | 2464 ms | Hacker News | 30 |

Reproduction : `bun bench/compare-scrapers.ts` (Bun) et `uv run --with requests --with ./python python bench/compare-scrapers.py <url> 5` (Python).

Limites : une seule page, un seul réseau, pas de contournement de protection (le site ne sert pas de challenge). Le temps Python inclut la première négociation cloudscraper.
