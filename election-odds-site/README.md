# Election odds site

Static site (pt-BR by default, EN toggle) with the **second-round odds** of the 2026 Brazilian election (runoff: 25 October 2026).
The first round (4 October) is over, so the site has one page per runoff, president first (the default), then governors by state:

| Tab | Path | Runoff |
|---|---|---|
| Presidente | `/` | Lula × Flávio Bolsonaro |
| AC | `/governo-ac/` | Acre |
| AM | `/governo-am/` | Amazonas |
| DF | `/governo-df/` | Distrito Federal |
| ES | `/governo-es/` | Espírito Santo |
| RJ | `/governo-rj/` | Rio de Janeiro (Ruas × Paes) |
| RN | `/governo-rn/` | Rio Grande do Norte |
| TO | `/governo-to/` | Tocantins |

Those are the seven governor races where nobody passed 50% (checked against the TSE results). Each page ends with a "Como funciona" section:
method, the first-round and poll components, the pollster adjustments, a runoff vote estimate with its 95% margin, and a collapsible
table of every poll used with its raw value, adjustment and weight. Probabilities under 1% are shown as "<1%", above 99% as ">99%".
Everything is computed at build time.

## Data

- **First-round results**: the TSE's own results service (`src/tse-results.ts`, `resultados.tse.jus.br/oficial/ele2026/...`): official counts,
  valid votes, and which two candidates are marked "2º turno". The build fails if a count is not final or a race does not have two finalists.
- **Runoff polls**: only **runoff** tables (the two finalists head to head), never first-round "big field" polls: the president's rows come
  from the English Wikipedia runoff table with no third candidate, a governor's from the pt.wikipedia section of exactly that matchup.
  Each must match a TSE poll registration (same institute, fieldwork end within a day).

## Model (`src/runoff.ts`)

1. **First-round result**: each finalist's valid-vote share, with the eliminated candidates' voters split **evenly** between the two
   (A's share = 50 + (A − B)/2). Splitting them in proportion to the finalists' own votes would flatter the front-runner, since those voters
   did not pick her; this matters most in scattered fields (Amazonas, Acre, Espírito Santo).
2. **Pre-election runoff polls**: fieldwork ending in the 14 days before the first round, as each candidate's share of the two's votes
   (undecided dropped), adjusted for pollster bias, then averaged with weight log(sample size) × 0.5^(age / 4 days).
3. **Blend**: 80% first-round result, 20% polls (`ELECTION_WEIGHT`).
4. **Odds**: the finalists' runoff share is normal around the blend. Its standard deviation (`sdPoints`) is
   √((0.20 × share of the vote that was eliminated)² + 1.2²) points: how unsure we are where eliminated voters go grows with their weight
   (2.0 in Rio and for the president, 7.1 in Amazonas, 5.5 in Rio Grande do Norte), plus 1.2 for turnout.
5. **Reliability**: a state needs at least 3 runoff polls from at least 2 institutes in the window. Otherwise the polls are ignored, the
   estimate is the first-round result alone, and the page shows a warning.

Polls with fieldwork after the first round are **post-election polls**: they enter the same average without the pre-election
adjustments and the build prints a warning, because the 80/20 blend should be revisited once they arrive.

### Pollster adjustments

- **President**: only Datafolha, Quaest, AtlasIntel, Palver, Futura, Veritá, PoderData, Gerp and Vox count (institutes that published in
  October with a campaign track record; Nexus and the rest are out). From each institute's final first-round poll against the result
  (`src/bias.ts` reproduces this): Lula's share was overstated by Datafolha (+0.5), Quaest (+0.8), AtlasIntel (+1.8) and understated by
  Palver (−1.7) and Futura (−2.5). Adjustments, in points of two-way share moved between the candidates, are about half the measured miss
  (Datafolha −0.7 for Lula, also reflecting its history, Quaest −0.5, AtlasIntel −1.0, Palver +1.0, Futura +1.5). Others: none.
- **Rio**: every pre-election runoff poll moves 10 points from Paes to Ruas (`RIO_RUAS_BOOST`); the first-round polls missed the Ruas–Paes gap
  by roughly that much in two-way terms. The first-round result and any post-election poll get no such shift.
- **Other states**: no adjustment; no bias was measured there.
- `src/corrections.ts` holds hand-checked fixes to incomplete Wikipedia rows (e.g. Veritá's Oct 2 poll, others = 8%).

## Portraits

Optional, one file per candidate: `site/img/lula.webp`, `site/img/flavio.webp`, `site/img/governo-<uf>/<candidate-slug>.webp`
(`.png`/`.jpg` also work; the slug is the name as shown on the page, e.g. `douglas-ruas`). Only Rio has portraits so far; the other states show names only. Transparent 782×926 works best.

## Run

```bash
npm ci
npm run build      # fetches live data, writes dist/
npm run serve      # preview dist/ locally
npx tsx src/bias.ts   # pollster bias against the first-round result
```

- `src/` – data fetching (`tse.ts`, `wikipedia.ts`, `senate-wikipedia.ts` for pt.wikipedia state tables), `tse-results.ts` (official first round), `runoff.ts` (model), `states.ts`, `build.ts`
- `site/` – page template (`runoff.template.html`), styles, scripts (`common.js` shared, `runoff.js`), portraits
- Deployment: `.github/workflows/election-odds-site.yml` at the repo root (GitHub Pages, rebuilt once a day).
  In the repo settings, set **Pages → Source** to **GitHub Actions**.
