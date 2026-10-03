import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { computeOdds } from './odds.ts';
import { computeSenateOdds } from './senate-odds.ts';
import { computeGovernorOdds } from './governor-odds.ts';
import { STATES, wikiUrl, type State } from './states.ts';

const pct = (p: number) => (p < 0.01 ? '<1%' : p > 0.99 ? '>99%' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0).replace('.', ',')}%`);
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c'); // keeps the JSON inert inside <script>
const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Tabs: president first (and default), then by state, then by office. `key` also names the labels in common.js.
const TABS = [
  { key: 'president', dir: '', label: 'Presidente' },
  { key: 'rj-senate', dir: 'senado-rj', label: 'RJ · Senado' },
  { key: 'rj-governor', dir: 'governo-rj', label: 'RJ · Governo' },
  { key: 'sc-senate', dir: 'senado-sc', label: 'SC · Senado' },
  { key: 'sc-governor', dir: 'governo-sc', label: 'SC · Governo' },
];
// every page but the president lives one folder down, so its links start with "../"
const nav = (current: string) => {
  const base = TABS.find((t) => t.key === current)!.dir ? '../' : './';
  const links = TABS.map((t) => `      <a href="${base}${t.dir ? `${t.dir}/` : ''}" data-nav="${t.key}"${t.key === current ? ' aria-current="page"' : ''}>${t.label}</a>`);
  return `<nav class="tabs" aria-label="Páginas">\n${links.join('\n')}\n    </nav>`;
};

const [{ odds }, ...stateOdds] = await Promise.all([
  computeOdds(),
  computeSenateOdds(STATES.RJ),
  computeGovernorOdds(STATES.RJ),
  computeSenateOdds(STATES.SC),
  computeGovernorOdds(STATES.SC),
]);
const [rjSenate, rjGovernor, scSenate, scGovernor] = stateOdds as [
  Awaited<ReturnType<typeof computeSenateOdds>>, Awaited<ReturnType<typeof computeGovernorOdds>>,
  Awaited<ReturnType<typeof computeSenateOdds>>, Awaited<ReturnType<typeof computeGovernorOdds>>,
];

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

// --- Senate pages ---
for (const [key, dir, state, { odds: o }] of [
  ['rj-senate', 'senado-rj', STATES.RJ, rjSenate],
  ['sc-senate', 'senado-sc', STATES.SC, scSenate],
] as const) {
  const data = { ...o, page: pageInfo(dir, state), candidates: o.candidates.map((c) => ({ ...c, slug: slug(c.name), image: image(dir, c.name) })) };
  await mkdir(`dist/${dir}`, { recursive: true });
  await writeFile(`dist/${dir}/data.json`, JSON.stringify(data, null, 2) + '\n');
  await writeFile(`dist/${dir}/index.html`, (await template('senado'))
    .replaceAll('__ROOT__', '../')
    .replace('__NAV__', nav(key))
    .replace('__TITLE__', `Chances na eleição 2026 · Senado ${state.uf}`)
    .replace('__DESCRIPTION__', `Probabilidade de cada candidato ao Senado por ${state.name} conquistar uma das duas vagas, calculada a partir das pesquisas registradas no TSE.`)
    .replace('__ODDS_JSON__', json(data))
    .replace('__NOSCRIPT__', 'Chance de conquistar uma vaga: ' + o.candidates.filter((c) => c.p >= 0.01).map((c) => `${c.name} ${pct(c.p)}`).join(' · ')));
}

// --- governor pages ---
for (const [key, dir, state, o] of [
  ['rj-governor', 'governo-rj', STATES.RJ, rjGovernor],
  ['sc-governor', 'governo-sc', STATES.SC, scGovernor],
] as const) {
  const [a, b] = o.leaders;
  const data = { ...o, page: pageInfo(dir, state), leaders: [{ ...a, slug: slug(a.name), image: image(dir, a.name) }, { ...b, slug: slug(b.name), image: image(dir, b.name) }] };
  await mkdir(`dist/${dir}`, { recursive: true });
  await writeFile(`dist/${dir}/data.json`, JSON.stringify(data, null, 2) + '\n');
  await writeFile(`dist/${dir}/index.html`, (await template('governo'))
    .replaceAll('__ROOT__', '../')
    .replace('__NAV__', nav(key))
    .replace('__TITLE__', `Chances na eleição 2026 · Governo ${state.uf}`)
    .replace('__DESCRIPTION__', `Probabilidade de ${a.name} e ${b.name} vencerem no 1º turno e de um 2º turno entre os dois no governo de ${state.name}, calculada a partir das últimas pesquisas registradas no TSE.`)
    .replace('__ODDS_JSON__', json(data))
    .replace('__NOSCRIPT__', `${a.name} vence no 1º turno: ${pct(a.p)} · Segundo turno entre os dois: ${pct(o.runoffLeaders)} · ${b.name} vence no 1º turno: ${pct(b.p)}`));
}

console.log('President:', JSON.stringify(odds.firstRoundWin), 'runoff', pct(odds.runoffLulaFlavio));
for (const [label, o] of [['RJ Governor', rjGovernor], ['SC Governor', scGovernor]] as const) {
  console.log(`${label}: ${o.leaders.map((l) => `${l.name} ${pct(l.p)}`).join(', ')}, runoff ${pct(o.runoffLeaders)}, other runoffs >=1%: ${o.otherRunoffs.filter((x) => x.p >= 0.01).length}`);
}
for (const [label, { odds: o }] of [['RJ Senate', rjSenate], ['SC Senate', scSenate]] as const) {
  console.log(`${label}: ${o.candidates.filter((c) => c.p >= 0.01).map((c) => `${c.name} ${pct(c.p)}`).join(', ')}`);
}
