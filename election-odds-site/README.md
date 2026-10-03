# Election odds site

Single-page static site (pt-BR by default, EN toggle) with the odds of Lula and Flávio Bolsonaro
winning the first round of Brazil's 2026 presidential election, and of a runoff between the two.

The odds are computed at build time by the same model as the CLI's `--forecast` mode
(last 50 TSE-registered polls with a Wikipedia row → weighted valid-vote average → 200k Dirichlet
simulations with the Brazilian 50% rule). Defaults live in `src/odds.ts`.

```bash
npm ci
npm run build      # fetches live data, writes dist/ (index.html, data.json, assets)
npm run serve      # preview dist/ locally
```

- `src/` – data fetching (`tse.ts`, `wikipedia.ts`), model (`forecast.ts`), build (`odds.ts`, `build.ts`)
- `site/` – page template, styles, script (i18n + rendering), portraits
- Deployment: `.github/workflows/election-odds-site.yml` at the repo root (GitHub Pages, rebuilt every 3 hours).
  In the repo settings, set **Pages → Source** to **GitHub Actions**.
