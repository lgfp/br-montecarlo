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
| RN | `/governo-rn/` | Rio Grande do Norte |
| TO | `/governo-to/` | Tocantins |

Those are the governor races where nobody passed 50% (checked against the TSE results). Rio de Janeiro was one until 8 October, when the
TSE annulled Garotinho's votes: that put Ruas above 50% of the valid vote, so he won in the first round and the Rio page was removed
(the TRE-RJ's re-count and a possible appeal to the Supreme Court are still pending). Each page ends with a "Como funciona" section:
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

One weighted average of "polls", where the first-round result is simply one more poll:

1. **Runoff polls**: TSE-registered, fieldwork ending in the 14 days before the first round or any time after it, each as the first
   finalist's share of the two finalists' support (undecided dropped), adjusted for pollster bias (below).
2. **The first-round result as a poll**: dated election day (4 October), with the **votes of the two finalists combined** as its
   sample, and the finalists' valid-vote shares with the eliminated candidates' voters split **evenly** between the two
   (A's share = 50 + (A − B)/2; splitting them in proportion to the finalists' own votes would flatter the front-runner, since those voters
   did not pick her).
3. **Weights**: every entry weighs log(sample size) × 0.5^(age / 4 days). Polls taken before the first round age **one extra half-life**
   (they weigh half as much: they were fielded with the eliminated candidates still in the race), which gives the intended order of importance:
   pre-election polls < first-round result < recent runoff polls. The result's log weight is only about twice a typical poll's, so
   it does not drown a pile of recent polls (it is about 16% of the president's weight today, 60–75% in the states, which have few polls),
   and it fades with the same half-life until real runoff polls overtake it.
4. **Odds**: the finalists' runoff share is normal around the average. Its standard deviation (`sdPoints`) is
   √((0.20 × share of the vote that was eliminated)² + 1.2²) points: how unsure we are where eliminated voters go grows with their weight
   (2.0 for the president, 7.1 in Amazonas, 5.5 in Rio Grande do Norte), plus 1.2 for turnout.
5. **Reliability**: a state needs at least 3 runoff polls from at least 2 institutes in the window. Otherwise the polls are ignored, the
   first-round result is the whole average, and the page shows a warning.

### Pollster adjustments

- **President**: only Datafolha, Quaest, AtlasIntel, Palver, Futura, Veritá, PoderData, Gerp and Vox count (institutes that published in
  October with a campaign track record; Nexus and the rest are out). From each institute's final first-round poll against the result
  (`src/bias.ts` reproduces this): Lula's share was overstated by Datafolha (+0.5), Quaest (+0.8), AtlasIntel (+1.8) and understated by
  Palver (−1.7) and Futura (−2.5). Adjustments, in points of two-way share moved between the candidates, are about half the measured miss
  (Datafolha −0.7 for Lula, also reflecting its history, Quaest −0.5, AtlasIntel −1.0, Palver +1.0, Futura +1.5). Others: none.
  They apply to every poll from those institutes, before and after the first round.
- **States**: no adjustment; no bias was measured there.
- `src/corrections.ts` holds hand-checked fixes to incomplete Wikipedia rows (e.g. Veritá's Oct 2 poll, others = 8%).

## Sharing

Each page has a share row (WhatsApp, X, copy link) and Open Graph / Twitter card tags. The preview image is a 1200×630 card generated at
build time (`src/og.ts`, with `sharp`): both candidates, portraits when available, and the live odds, saved as `dist/og/<page>.png`.
The public address (`SITE` in `src/build.ts`) is used for canonical and absolute URLs. Chat apps cache a preview by URL for days, so
the card URL and the shared link carry `?v=<hash of the card>`: new odds, new URL, fresh preview.

## Analytics

Page views and share clicks are counted with [GoatCounter](https://www.goatcounter.com) (cookie-free, no personal data, so no consent banner):
the snippet is in `site/runoff.template.html`, and `site/runoff.js` records an event for each share button (`share/whatsapp`, `share/x`,
`share/copy-link`). The dashboard is at `luisguilherme.goatcounter.com`.

## Portraits

Optional, one file per candidate: `site/img/lula.webp`, `site/img/flavio.webp`, `site/img/governo-<uf>/<candidate-slug>.webp`
(`.png`/`.jpg` also work; the slug is the name as shown on the page, e.g. `omar-aziz`). The state pages show names only so far. Transparent 782×926 works best.

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
