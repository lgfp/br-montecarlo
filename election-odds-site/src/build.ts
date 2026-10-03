import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { computeOdds } from './odds.ts';

const { odds } = await computeOdds();

const pct = (p: number) => (p < 0.01 ? '<1%' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0).replace('.', ',')}%`);

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('site/img', 'dist/img', { recursive: true });
await cp('site/style.css', 'dist/style.css');
await cp('site/app.js', 'dist/app.js');
await writeFile('dist/.nojekyll', '');
await writeFile('dist/data.json', JSON.stringify(odds, null, 2) + '\n');

const html = (await readFile('site/index.template.html', 'utf8'))
  // data is inlined so the page needs no extra request; "<" is escaped to keep the JSON inert inside <script>
  .replace('__ODDS_JSON__', JSON.stringify(odds).replace(/</g, '\\u003c'))
  // plain pt-BR fallback for browsers without JavaScript
  .replace('__NOSCRIPT__', `Lula vence no 1º turno: ${pct(odds.firstRoundWin.lula)} · Segundo turno entre os dois: ${pct(odds.runoffLulaFlavio)} · Flávio Bolsonaro vence no 1º turno: ${pct(odds.firstRoundWin.flavio)}`);
await writeFile('dist/index.html', html);

console.log('Built dist/ —', JSON.stringify(odds));
