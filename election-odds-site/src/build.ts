import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { computeOdds } from './odds.ts';
import { computeSenateOdds } from './senate-odds.ts';

const [{ odds }, { odds: senate }] = await Promise.all([computeOdds(), computeSenateOdds()]);

const pct = (p: number) => (p < 0.01 ? '<1%' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0).replace('.', ',')}%`);
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c'); // keeps the JSON inert inside <script>
const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

await rm('dist', { recursive: true, force: true });
await mkdir('dist/senado-sc', { recursive: true });
await cp('site/img', 'dist/img', { recursive: true });
for (const f of ['style.css', 'common.js', 'presidente.js', 'senado-sc.js']) await cp(`site/${f}`, `dist/${f}`);
await writeFile('dist/.nojekyll', '');

// --- president ---
await writeFile('dist/data.json', JSON.stringify(odds, null, 2) + '\n');
const president = (await readFile('site/index.template.html', 'utf8'))
  .replaceAll('__ROOT__', './')
  .replace('__ODDS_JSON__', json(odds))
  // plain pt-BR fallback for browsers without JavaScript
  .replace('__NOSCRIPT__', `Lula vence no 1º turno: ${pct(odds.firstRoundWin.lula)} · Segundo turno entre os dois: ${pct(odds.runoffLulaFlavio)} · Flávio Bolsonaro vence no 1º turno: ${pct(odds.firstRoundWin.flavio)}`);
await writeFile('dist/index.html', president);

// --- Santa Catarina Senate ---
// portraits are optional: img/senado/<candidate-slug>.webp|png|jpg, otherwise the page shows initials
const withImages = senate.candidates.map((c) => {
  const file = ['webp', 'png', 'jpg'].map((ext) => `img/senado/${slug(c.name)}.${ext}`).find((f) => existsSync(`site/${f}`));
  return { ...c, slug: slug(c.name), image: file ?? null };
});
const senateData = { ...senate, candidates: withImages };
await writeFile('dist/senado-sc/data.json', JSON.stringify(senateData, null, 2) + '\n');
const senatePage = (await readFile('site/senado-sc.template.html', 'utf8'))
  .replaceAll('__ROOT__', '../')
  .replace('__ODDS_JSON__', json(senateData))
  .replace('__NOSCRIPT__', 'Chance de conquistar uma vaga: ' + senate.candidates.filter((c) => c.p >= 0.01).map((c) => `${c.name} ${pct(c.p)}`).join(' · '));
await writeFile('dist/senado-sc/index.html', senatePage);

console.log('President:', JSON.stringify(odds.firstRoundWin), 'runoff', pct(odds.runoffLulaFlavio));
console.log('SC Senate:', senate.candidates.filter((c) => c.p >= 0.01).map((c) => `${c.name} ${pct(c.p)}`).join(', '));
