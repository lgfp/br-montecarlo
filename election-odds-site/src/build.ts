import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { computeOdds } from './odds.ts';
import { computeSenateOdds } from './senate-odds.ts';
import { computeGovernorOdds } from './governor-odds.ts';
import { STATES, wikiUrl, type State } from './states.ts';

const pct = (p: number) => (p < 0.01 ? '<1%' : p > 0.99 ? '>99%' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0).replace('.', ',')}%`);
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c'); // keeps the JSON inert inside <script>
const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// States, in tab order (alphabetical). Each gets a Senate page and a governor page; see states.ts.
const UFS = ['RJ', 'SC', 'SP'] as const;
type UF = (typeof UFS)[number];

// Tabs: president first (and default), then by state, then by office. `key` also names the labels in common.js.
const TABS = [
  { key: 'president', dir: '', label: 'Presidente' },
  ...UFS.flatMap((uf) => [
    { key: `${uf.toLowerCase()}-senate`, dir: `senado-${uf.toLowerCase()}`, label: `${uf} · Senado` },
    { key: `${uf.toLowerCase()}-governor`, dir: `governo-${uf.toLowerCase()}`, label: `${uf} · Governo` },
  ]),
];
// every page but the president lives one folder down, so its links start with "../"
const nav = (current: string) => {
  const base = TABS.find((t) => t.key === current)!.dir ? '../' : './';
  const links = TABS.map((t) => `      <a href="${base}${t.dir ? `${t.dir}/` : ''}" data-nav="${t.key}"${t.key === current ? ' aria-current="page"' : ''}>${t.label}</a>`);
  return `<nav class="tabs" aria-label="Páginas">\n${links.join('\n')}\n    </nav>`;
};

const [{ odds }, ...stateResults] = await Promise.all([
  computeOdds(),
  ...UFS.flatMap((uf) => [computeSenateOdds(STATES[uf]), computeGovernorOdds(STATES[uf])]),
]);
const senateOf = new Map<UF, Awaited<ReturnType<typeof computeSenateOdds>>>();
const governorOf = new Map<UF, Awaited<ReturnType<typeof computeGovernorOdds>>>();
UFS.forEach((uf, i) => {
  senateOf.set(uf, stateResults[2 * i] as Awaited<ReturnType<typeof computeSenateOdds>>);
  governorOf.set(uf, stateResults[2 * i + 1] as Awaited<ReturnType<typeof computeGovernorOdds>>);
});

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('site/img', 'dist/img', { recursive: true });
for (const f of ['style.css', 'common.js', 'presidente.js', 'senado.js', 'governo.js']) await cp(`site/${f}`, `dist/${f}`);
await writeFile('dist/.nojekyll', '');

const template = (name: string) => readFile(`site/${name}.template.html`, 'utf8');

/** portraits are optional: img/<page>/<candidate-slug>.webp|png|jpg */
const image = (dir: string, name: string) =>
  ['webp', 'png', 'jpg'].map((ext) => `img/${dir}/${slug(name)}.${ext}`).find((f) => existsSync(`site/${f}`)) ?? null;

const pageInfo = (dir: string, state: State) => ({ folder: dir, uf: state.uf, state: state.name, place: state.place, wikiUrl: wikiUrl(state), note: state.note ?? null });

// --- president ---
await writeFile('dist/data.json', JSON.stringify(odds, null, 2) + '\n');
await writeFile('dist/index.html', (await template('index'))
  .replaceAll('__ROOT__', './')
  .replace('__NAV__', nav('president'))
  .replace('__ODDS_JSON__', json(odds))
  // plain pt-BR fallback for browsers without JavaScript
  .replace('__NOSCRIPT__', `Lula vence no 1º turno: ${pct(odds.firstRoundWin.lula)} · Segundo turno entre os dois: ${pct(odds.runoffLulaFlavio)} · Flávio Bolsonaro vence no 1º turno: ${pct(odds.firstRoundWin.flavio)}`));

// --- state pages ---
for (const uf of UFS) {
  const state = STATES[uf];
  const lower = uf.toLowerCase();

  // Senate
  {
    const { odds: o } = senateOf.get(uf)!;
    const dir = `senado-${lower}`;
    const data = { ...o, page: pageInfo(dir, state), candidates: o.candidates.map((c) => ({ ...c, slug: slug(c.name), image: image(dir, c.name) })) };
    await mkdir(`dist/${dir}`, { recursive: true });
    await writeFile(`dist/${dir}/data.json`, JSON.stringify(data, null, 2) + '\n');
    await writeFile(`dist/${dir}/index.html`, (await template('senado'))
      .replaceAll('__ROOT__', '../')
      .replace('__NAV__', nav(`${lower}-senate`))
      .replace('__TITLE__', `Chances na eleição 2026 · Senado ${state.uf}`)
      .replace('__DESCRIPTION__', `Probabilidade de cada candidato ao Senado por ${state.name} conquistar uma das duas vagas, calculada a partir das pesquisas registradas no TSE.`)
      .replace('__ODDS_JSON__', json(data))
      .replace('__NOSCRIPT__', 'Chance de conquistar uma vaga: ' + o.candidates.filter((c) => c.p >= 0.01).map((c) => `${c.name} ${pct(c.p)}`).join(' · ')));
  }

  // Governor
  {
    const o = governorOf.get(uf)!;
    const dir = `governo-${lower}`;
    const [a, b] = o.leaders;
    const data = { ...o, page: pageInfo(dir, state), leaders: [{ ...a, slug: slug(a.name), image: image(dir, a.name) }, { ...b, slug: slug(b.name), image: image(dir, b.name) }] };
    await mkdir(`dist/${dir}`, { recursive: true });
    await writeFile(`dist/${dir}/data.json`, JSON.stringify(data, null, 2) + '\n');
    await writeFile(`dist/${dir}/index.html`, (await template('governo'))
      .replaceAll('__ROOT__', '../')
      .replace('__NAV__', nav(`${lower}-governor`))
      .replace('__TITLE__', `Chances na eleição 2026 · Governo ${state.uf}`)
      .replace('__DESCRIPTION__', `Probabilidade de ${a.name} e ${b.name} vencerem no 1º turno e de um 2º turno entre os dois no governo de ${state.name}, calculada a partir das últimas pesquisas registradas no TSE.`)
      .replace('__ODDS_JSON__', json(data))
      .replace('__NOSCRIPT__', `${a.name} vence no 1º turno: ${pct(a.p)} · Segundo turno entre os dois: ${pct(o.runoffLeaders)} · ${b.name} vence no 1º turno: ${pct(b.p)}`));
  }
}

console.log('President:', JSON.stringify(odds.firstRoundWin), 'runoff', pct(odds.runoffLulaFlavio));
for (const uf of UFS) {
  const o = governorOf.get(uf)!;
  console.log(`${uf} Governor: ${o.leaders.map((l) => `${l.name} ${pct(l.p)}`).join(', ')}, runoff needed ${pct(o.runoffNeeded)}, other runoffs >=1%: ${o.otherRunoffs.filter((x) => x.p >= 0.01).length}`);
  const { odds: so } = senateOf.get(uf)!;
  console.log(`${uf} Senate: ${so.candidates.filter((c) => c.p >= 0.01).map((c) => `${c.name} ${pct(c.p)}`).join(', ')}`);
}
