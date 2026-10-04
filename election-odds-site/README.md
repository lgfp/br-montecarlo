# Election odds site

Static site (pt-BR by default, EN toggle). Tabs are ordered president first (the default page), then by state, then by office:

| Tab | Path | What it shows |
|---|---|---|
| Presidente | `/` | Lula and Flávio Bolsonaro: first-round win odds, and the odds of a runoff between them |
| RJ · Senado | `/senado-rj/` | Odds of each Rio de Janeiro Senate candidate winning one of the two seats |
| RJ · Governo | `/governo-rj/` | Rio governor: the two leaders' first-round win odds and the odds of a runoff between them |
| SC · Senado | `/senado-sc/` | Same as RJ · Senado, for Santa Catarina |
| SC · Governo | `/governo-sc/` | Same as RJ · Governo, for Santa Catarina |
| SP · Senado | `/senado-sp/` | Same as RJ · Senado, for São Paulo |
| SP · Governo | `/governo-sp/` | Same as RJ · Governo, for São Paulo |

Every page ends its "Como funciona" section with an **aggregated vote intention** box: each candidate's poll average with a 95% margin
(± percentage points) taken from the model's simulations, so it includes error beyond sampling and is wider than one poll's margin.
President and governors show % of valid votes; Senate pages show % of the votes named (two votes per voter).

Everything is computed at build time. Outcomes under 1% are hidden (shown as "<1%" in the main boxes), and above 99% is shown as ">99%".

## Models

- **President** (same as the CLI's `--forecast`): last 50 TSE-registered polls with a Wikipedia row → weighted valid-vote average →
  200k Dirichlet simulations with the Brazilian 50% rule (`src/odds.ts`, concentration cap 300). Rows come from **both** English and
  Portuguese Wikipedia: the English page is the base and Portuguese rows (`src/president-pt.ts`) are added only for polls the English
  page does not have (it is often about a day ahead and lists pollsters the English page omits). If the Portuguese page fails or
  changes layout, the build falls back to English alone. A poll never weighs more than 5,000 respondents (`src/forecast.ts`).
- **Governor** (`src/governor-odds.ts`): the same model fed with a state's governor polls from the pt.wikipedia table, scenario 1
  (the full ballot), that match a TSE registration; concentration cap 200 (state polls err more). The two candidates with the highest
  average are the "leaders". Any other runoff pairing above 1% is listed as text.
- **Senate** (`src/senate-forecast.ts`, `src/senate-odds.ts`): only complete **two-vote** polls are used, because they measure what
  decides the race. A row summing to well over 100% is two-vote; Quaest and Datafolha are also two-vote but publish the consolidated
  total (1st and 2nd vote averaged, so rows sum to 100% or less), recognized by name (`CONSOLIDATED`); first-choice polls, polls missing candidates and polls with no TSE
  registration are excluded. Polls become shares of all named votes, are averaged (sample size × recency) and simulated; the top two
  in each simulation win. Concentration cap 150.

## Adding or changing a state

`src/states.ts` lists the states (pt.wikipedia poll page, place name, optional note such as a candidacy under appeal). Page order
and labels are in `TABS` in `src/build.ts` and `NAV` in `site/common.js`.

## Portraits

Optional, one file per candidate named after them: `site/img/<page>/<candidate-slug>.webp` (or `.png`/`.jpg`), e.g.
`site/img/senado-sc/caroline-de-toni.webp`, `site/img/governo-rj/eduardo-paes.webp`. Transparent 782×926 works best.
Without a file, a governor's card is shown without a portrait, and a Senate candidate is listed as text.
Senate pages give a portrait card only to candidates above 10% (at most 4); every other candidate above 1% is listed as text.
A governor page shows the leader alone (with the chance of a runoff) when the second candidate and the runoff are both under 1%, as on `/governo-sc/` and `/governo-sp/`.

## Run

```bash
npm ci
npm run build      # fetches live data, writes dist/
npm run serve      # preview dist/ locally
```

- `src/` – data fetching (`tse.ts`, `wikipedia.ts`, `senate-wikipedia.ts` for any pt.wikipedia state table), models, `states.ts`, `build.ts`
- `site/` – page templates (`index`, `governo`, `senado`), styles, scripts (`common.js` shared), portraits
- Deployment: `.github/workflows/election-odds-site.yml` at the repo root (GitHub Pages, rebuilt every hour).
  In the repo settings, set **Pages → Source** to **GitHub Actions**.
