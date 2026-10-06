# Election odds site

Static site (pt-BR by default, EN toggle) with the **second-round odds** of the 2026 Brazilian election (runoff: 25 October 2026).
The first round (4 October) is over, so the site now has two pages, president first (the default):

| Tab | Path | What it shows |
|---|---|---|
| Presidente | `/` | Lula × Flávio Bolsonaro: chance of each winning the runoff |
| RJ · Governo | `/governo-rj/` | Douglas Ruas × Eduardo Paes (Ruas got 49.27% of valid votes, short of the 50% needed): chance of each winning the runoff |

Each page ends with a "Como funciona" section: method, the first-round and poll components, the pollster adjustments, a runoff vote
estimate with its 95% margin, and a collapsible table of every poll used with its raw value, adjustment and weight.
Probabilities under 1% are shown as "<1%", above 99% as ">99%". Everything is computed at build time.

## Model (`src/runoff.ts`)

1. **First-round result**: each finalist's share of the two finalists' combined votes (official counts, hard-coded).
2. **Pre-election runoff polls**: TSE-registered polls with a Wikipedia row, fieldwork ending in the 14 days before the first round,
   as each candidate's share of the two's votes (undecided dropped), adjusted for pollster bias, then averaged with weight
   log(sample size) × 0.5^(age / 4 days).
3. **Blend**: 80% first-round result, 20% polls (`ELECTION_WEIGHT`).
4. **Odds**: the finalists' runoff share is normal around the blend with a standard deviation of 2.0 points (`SD_POINTS`: ~1.6 for
   where the eliminated candidates' ~8% of the vote goes, ~1.2 for turnout).

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
- `src/corrections.ts` holds hand-checked fixes to incomplete Wikipedia rows (e.g. Veritá's Oct 2 poll, others = 8%).

## Portraits

Optional, one file per candidate: `site/img/lula.webp`, `site/img/flavio.webp`, `site/img/governo-rj/<candidate-slug>.webp`
(`.png`/`.jpg` also work). Transparent 782×926 works best.

## Run

```bash
npm ci
npm run build      # fetches live data, writes dist/
npm run serve      # preview dist/ locally
npx tsx src/bias.ts   # pollster bias against the first-round result
```

- `src/` – data fetching (`tse.ts`, `wikipedia.ts`, `senate-wikipedia.ts` for pt.wikipedia state tables), `runoff.ts` (model), `states.ts`, `build.ts`
- `site/` – page template (`runoff.template.html`), styles, scripts (`common.js` shared, `runoff.js`), portraits
- Deployment: `.github/workflows/election-odds-site.yml` at the repo root (GitHub Pages, rebuilt once a day).
  In the repo settings, set **Pages → Source** to **GitHub Actions**.
