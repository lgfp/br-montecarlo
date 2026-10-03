# Election odds site

Static site (pt-BR by default, EN toggle) with three pages:

- **Presidente** (`/`): odds of Lula and Flávio Bolsonaro winning the first round, and of a runoff between the two.
- **Senado · SC** (`/senado-sc/`): odds of each Santa Catarina Senate candidate winning one of the two seats
  (two votes per voter, no runoff: the two most voted win).
- **Governo · RJ** (`/governo-rj/`): odds of Eduardo Paes and Douglas Ruas winning the first round, and of a Paes–Ruas runoff;
  any other runoff pairing above 1% is listed as text. Garotinho is assumed to be a valid candidate (his registration is under
  appeal), so the poll scenario that includes him is used.

The odds are computed at build time.

- Presidential model (same as the CLI's `--forecast`): last 50 TSE-registered polls with a Wikipedia row → weighted valid-vote
  average → 200k Dirichlet simulations with the Brazilian 50% rule. Defaults in `src/odds.ts`.
- Governor model (`src/governor-odds.ts`): the presidential model fed with the Rio de Janeiro governor polls (pt.wikipedia
  table, scenario 1) that match a TSE registration; concentration cap 200 (state polls err more than national ones).
- Senate model (`src/senate-forecast.ts`): only complete **two-vote** polls are used (rows summing to well over 100%), because
  they measure what decides the race; first-choice polls and polls missing candidates are excluded. Polls become shares of all
  named votes, are averaged (sample size × recency) and simulated; the top two in each simulation win. Polls come from the
  Portuguese Wikipedia page for Santa Catarina and must match a TSE registration. Defaults in `src/senate-odds.ts`.

```bash
npm ci
npm run build      # fetches live data, writes dist/ (index.html, senado-sc/, data.json files, assets)
npm run serve      # preview dist/ locally
```

- `src/` – data fetching (`tse.ts`, `wikipedia.ts`, `senate-wikipedia.ts` for any pt.wikipedia state table), models (`forecast.ts`, `senate-forecast.ts`, `governor-odds.ts`), build
- `site/` – page templates, styles, scripts (`common.js` shared; one script per page), portraits
- Governor portraits live in `site/img/governo-rj/`. Senate portraits are optional: drop `site/img/senado/<candidate-slug>.webp` (or `.png`/`.jpg`), e.g. `caroline-de-toni.webp`;
  a candidate above 1% without a portrait is listed as text ("Outros candidatos com chance acima de 1%") before the combinations.
- Deployment: `.github/workflows/election-odds-site.yml` at the repo root (GitHub Pages, rebuilt every 3 hours).
  In the repo settings, set **Pages → Source** to **GitHub Actions**.
