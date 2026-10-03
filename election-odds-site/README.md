# Election odds site

Static site (pt-BR by default, EN toggle) with two pages:

- **Presidente** (`/`): odds of Lula and Flávio Bolsonaro winning the first round, and of a runoff between the two.
- **Senado · SC** (`/senado-sc/`): odds of each Santa Catarina Senate candidate winning one of the two seats
  (two votes per voter, no runoff: the two most voted win).

The odds are computed at build time.

- Presidential model (same as the CLI's `--forecast`): last 50 TSE-registered polls with a Wikipedia row → weighted valid-vote
  average → 200k Dirichlet simulations with the Brazilian 50% rule. Defaults in `src/odds.ts`.
- Senate model (`src/senate-forecast.ts`): only complete **two-vote** polls are used (rows summing to well over 100%), because
  they measure what decides the race; first-choice polls and polls missing candidates are excluded. Polls become shares of all
  named votes, are averaged (sample size × recency) and simulated; the top two in each simulation win. Polls come from the
  Portuguese Wikipedia page for Santa Catarina and must match a TSE registration. Defaults in `src/senate-odds.ts`.

```bash
npm ci
npm run build      # fetches live data, writes dist/ (index.html, senado-sc/, data.json files, assets)
npm run serve      # preview dist/ locally
```

- `src/` – data fetching (`tse.ts`, `wikipedia.ts`, `senate-wikipedia.ts`), models (`forecast.ts`, `senate-forecast.ts`), build
- `site/` – page templates, styles, scripts (`common.js` shared; one script per page), portraits
- Senate portraits are optional: drop `site/img/senado/<candidate-slug>.webp` (or `.png`/`.jpg`), e.g. `caroline-de-toni.webp`;
  without a file the page shows initials.
- Deployment: `.github/workflows/election-odds-site.yml` at the repo root (GitHub Pages, rebuilt every 3 hours).
  In the repo settings, set **Pages → Source** to **GitHub Actions**.
