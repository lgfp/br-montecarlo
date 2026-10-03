# ElectionOdds

Tools for Brazil's 2026 presidential election polls, using the TSE poll registry (dadosabertos.tse.jus.br) and Wikipedia's results tables.

- [`tse-results-cli/`](tse-results-cli) – Node/TypeScript CLI: lists registered presidential polls, shows each poll's results, and runs a poll-aggregation Monte Carlo forecast (`--forecast`). The original JavaScript version is kept in `archive-js/`.
- [`election-odds-site/`](election-odds-site) – static site (pt-BR, EN toggle) with two pages, the presidential odds and the Santa Catarina Senate odds, built from the poll data. Published to GitHub Pages by [`.github/workflows/election-odds-site.yml`](.github/workflows/election-odds-site.yml).
