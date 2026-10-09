import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { computePresidentRunoff, computeStateRunoff, type RunoffOdds } from './runoff.ts';
import { STATES, wikiUrl } from './states.ts';
import { renderCard } from './og.ts';

// the public address: canonical links and the absolute URLs social networks need for previews
const SITE = 'https://cinquentamaisum.com';

const pct = (p: number) => (p < 0.01 ? '<1%' : p > 0.99 ? '>99%' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0).replace('.', ',')}%`);
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c'); // keeps the JSON inert inside <script>
const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Tabs: president first (and default), then the governor runoffs by state. `key` also names the labels in common.js.
const UFS = Object.keys(STATES) as (keyof typeof STATES)[];
const TABS = [
  { key: 'president', dir: '', label: 'Presidente' },
  ...UFS.map((uf) => ({ key: `${uf.toLowerCase()}-governor`, dir: `governo-${uf.toLowerCase()}`, label: uf })),
];
// every page but the president lives one folder down, so its links start with "../"
const nav = (current: string) => {
  const base = TABS.find((t) => t.key === current)!.dir ? '../' : './';
  const links = TABS.map((t) => `      <a href="${base}${t.dir ? `${t.dir}/` : ''}" data-nav="${t.key}"${t.key === current ? ' aria-current="page"' : ''}>${t.label}</a>`);
  return `<nav class="tabs" aria-label="Páginas">\n${links.join('\n')}\n    </nav>`;
};

const president = await computePresidentRunoff();
// one state at a time: each one reads a Wikipedia page, and Wikipedia rate-limits bursts
const stateOdds = new Map<keyof typeof STATES, RunoffOdds>();
for (const uf of UFS) stateOdds.set(uf, await computeStateRunoff(STATES[uf]));

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('site/img', 'dist/img', { recursive: true });
for (const f of ['style.css', 'common.js', 'runoff.js']) await cp(`site/${f}`, `dist/${f}`);
await writeFile('dist/.nojekyll', '');

const template = await readFile('site/runoff.template.html', 'utf8');

/** portraits are optional: img/<page>/<candidate-slug>.webp|png|jpg */
const image = (dir: string, name: string, flat?: string) =>
  flat ?? ['webp', 'png', 'jpg'].map((ext) => `img/${dir}/${slug(name)}.${ext}`).find((f) => existsSync(`site/${f}`)) ?? null;

interface Page {
  tab: string;
  dir: string;
  kind: 'president' | 'state';
  odds: RunoffOdds;
  candidates: { name: string; party: string; flat?: string }[];
  office: { 'pt-BR': string; en: string };
  shortTitle: { 'pt-BR': string; en: string };
  adjustments: { 'pt-BR': string; en: string };
  warning: { 'pt-BR': string; en: string } | null;
  description: string;
  wikiUrl: string;
}

const pages: Page[] = [
  {
    tab: 'president', dir: '', kind: 'president', odds: president,
    candidates: [{ name: 'Lula', party: 'PT', flat: 'img/lula.webp' }, { name: 'Flávio Bolsonaro', party: 'PL', flat: 'img/flavio.webp' }],
    office: { 'pt-BR': 'Eleição presidencial', en: 'Presidential election' },
    shortTitle: { 'pt-BR': 'Presidente', en: 'President' },
    adjustments: {
      'pt-BR': 'Entram só os institutos que seguiram publicando em outubro e têm histórico na campanha (Datafolha, Quaest, AtlasIntel, Palver, Futura, Veritá, PoderData, Gerp e Vox). Comparando a última pesquisa de cada um com o resultado do 1º turno, a parcela de Lula foi superestimada por Datafolha, Quaest e AtlasIntel e subestimada por Palver e Futura, então os ajustes são: Datafolha −0,7 ponto para Lula, Quaest −0,5, AtlasIntel −1,0, Palver +1,0 e Futura +1,5 (cerca de metade do erro medido, porque o erro de uma só pesquisa é em boa parte ruído). Os demais não recebem ajuste.',
      en: 'Only pollsters that kept publishing in October and have a track record over the campaign count (Datafolha, Quaest, AtlasIntel, Palver, Futura, Veritá, PoderData, Gerp and Vox). Comparing each one’s last poll with the first-round result, Lula’s share was overstated by Datafolha, Quaest and AtlasIntel and understated by Palver and Futura, so the adjustments are: Datafolha −0.7 points for Lula, Quaest −0.5, AtlasIntel −1.0, Palver +1.0 and Futura +1.5 (about half the measured error, since one poll’s error is largely noise). The others get no adjustment.',
    },
    warning: null,
    description: 'Probabilidade de Lula e de Flávio Bolsonaro vencerem o segundo turno de 25 de outubro, combinando o resultado do 1º turno com as pesquisas de 2º turno.',
    wikiUrl: 'https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Brazilian_presidential_election',
  },
  ...UFS.map((uf): Page => {
    const state = STATES[uf];
    const odds = stateOdds.get(uf)!;
    const [a, b] = odds.intention.rows;
    return {
      tab: `${uf.toLowerCase()}-governor`, dir: `governo-${uf.toLowerCase()}`, kind: 'state', odds,
      candidates: [{ name: a.name, party: a.party }, { name: b.name, party: b.party }],
      office: { 'pt-BR': `Governo · ${state.name}`, en: `${state.name} · Governor` },
      shortTitle: { 'pt-BR': `Governo ${uf}`, en: `${uf} governor` },
      adjustments: {
        'pt-BR': 'Não há ajuste de viés de instituto neste estado: as pesquisas de 2º turno entram como foram publicadas. Só pesquisas de 2º turno (os dois finalistas frente a frente) são usadas, nunca pesquisas do 1º turno com vários candidatos.',
        en: 'No pollster-bias adjustment is applied in this state: runoff polls enter as published. Only runoff polls (the two finalists head to head) are used, never first-round polls with many candidates.',
      },
      warning: odds.pollsReliable
        ? null
        : {
          'pt-BR': `Aviso: não há pesquisas de 2º turno suficientes e confiáveis para este estado (encontramos ${odds.pollsFound}; exigimos pelo menos 3, de 2 institutos, nas duas semanas antes do 1º turno). A estimativa usa só o resultado do 1º turno.`,
          en: `Warning: there are not enough reliable runoff polls for this state (we found ${odds.pollsFound}; we require at least 3, from 2 pollsters, in the two weeks before the first round). The estimate uses the first-round result alone.`,
        },
      description: `Probabilidade de ${a.name} e de ${b.name} vencerem o segundo turno de 25 de outubro no governo de ${state.name}.`,
      wikiUrl: wikiUrl(state),
    };
  }),
];

for (const pg of pages) {
  const [a, b] = pg.candidates;
  const o = pg.odds;
  const data = {
    ...o,
    page: {
      kind: pg.kind, office: pg.office, shortTitle: pg.shortTitle, adjustments: pg.adjustments, warning: pg.warning, wikiUrl: pg.wikiUrl,
      candidates: pg.candidates.map((c) => ({ name: c.name, party: c.party, slug: slug(c.name), image: image(pg.dir, c.name, c.flat) })),
      url: `${SITE}/${pg.dir ? `${pg.dir}/` : ''}`,
    },
  };
  const out = pg.dir ? `dist/${pg.dir}` : 'dist';
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/data.json`, JSON.stringify(data, null, 2) + '\n');
  const url = `${SITE}/${pg.dir ? `${pg.dir}/` : ''}`;
  const ogName = pg.dir || 'presidente';
  const [ia, ib] = data.page.candidates;
  const ogTitle = `${pg.shortTitle['pt-BR']} · 2º turno: ${a.name} ${pct(o.p.a)} × ${b.name} ${pct(o.p.b)}`;
  await mkdir('dist/og', { recursive: true });
  await writeFile(`dist/og/${ogName}.png`, await renderCard({
    eyebrow: `${pg.office['pt-BR']} · 2º turno: 25 de outubro`,
    title: 'Quem vence o 2º turno?',
    candidates: [{ name: a.name, party: a.party, pct: pct(o.p.a), image: ia.image }, { name: b.name, party: b.party, pct: pct(o.p.b), image: ib.image }],
    site: 'cinquentamaisum.com',
  }, 'site'));
  await writeFile(`${out}/index.html`, template
    .replaceAll('__ROOT__', pg.dir ? '../' : './')
    .replace('__NAV__', nav(pg.tab))
    .replace('__TITLE__', `Chances no 2º turno · ${pg.shortTitle['pt-BR']}`)
    .replaceAll('__DESCRIPTION__', pg.description)
    .replaceAll('__URL__', url)
    .replaceAll('__OG_TITLE__', ogTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'))
    .replaceAll('__OG_IMAGE__', `${SITE}/og/${ogName}.png`)
    .replace('__ODDS_JSON__', json(data))
    .replace('__NOSCRIPT__', `Vence o 2º turno: ${a.name} ${pct(o.p.a)} · ${b.name} ${pct(o.p.b)}`));
  console.log(`${pg.shortTitle['pt-BR']}: ${a.name} ${pct(o.p.a)} × ${b.name} ${pct(o.p.b)} (estimate ${(o.estimate.a * 100).toFixed(1)}/${(o.estimate.b * 100).toFixed(1)}, ${o.pollsUsed} polls, ${o.effectivePolls} effective, 1st round ${(o.firstRoundWeight * 100).toFixed(0)}% of the weight)`);
}
