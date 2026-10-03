#!/usr/bin/env node
import readline from 'node:readline';
import { fetchPresidentialPolls } from './tse.ts';
import { fetchWikipediaPolls, matchesPoll, type WikiPoll } from './wikipedia.ts';
import { ELECTION_DATE, forecast } from './forecast.ts';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const pct = (v: number | null) => (v === null ? '  —  ' : `${v.toFixed(1).padStart(5)}%`);
const bar = (v: number | null) => (v === null ? '' : '█'.repeat(Math.round(v / 2)));

const limit = Number(opt('limit', '20'));
const pollster = opt('pollster', '');

const [allPolls, wikiPolls] = await Promise.all([fetchPresidentialPolls({ pollster }), fetchWikipediaPolls()]);
const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const onlyMatched = args.includes('--matched');
const released = allPolls
  .filter((p) => p.divulgacao <= today)
  .filter((p) => !onlyMatched || wikiPolls.some((w) => matchesPoll(p, w)));
const polls = released.slice(0, limit);

if (args.includes('--forecast')) {
  // the last N distinct Wikipedia first-round rows behind released TSE polls (newest release first)
  const rows = new Set<WikiPoll>();
  for (const p of allPolls.filter((p) => p.divulgacao <= today)) {
    for (const w of wikiPolls) if (w.round === 1 && matchesPoll(p, w)) rows.add(w);
    if (rows.size >= Number(opt('polls', '50'))) break;
  }
  const matched = [...rows].sort((a, b) => b.end.localeCompare(a.end)).slice(0, Number(opt('polls', '50')));
  const f = forecast(matched, {
    today,
    sims: Number(opt('sims', '200000')),
    seed: Number(opt('seed', '2026')),
    concentration: Number(opt('concentration', '300')),
    halfLifeDays: 7,
    designEffect: 2,
  });
  const short = (n: string) => n.replace(/ \S+$/, '');
  const show = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0).padStart(5)}%`;
  console.log(`Forecast for ${ELECTION_DATE} from the last ${matched.length} matched polls${f.pollsUsed < matched.length ? ` (${f.pollsUsed} cover every current candidate)` : ''} (fieldwork ${f.oldest} → ${f.newest}), ${Number(opt('sims', '200000')).toLocaleString()} simulations`);
  console.log('\nAggregated share of the valid vote:');
  for (const { name, share } of f.shares) console.log(`  ${name.padEnd(20)} ${pct(share * 100)}`);
  console.log(`  ${'Others'.padEnd(20)} ${pct(f.othersShare * 100)}`);
  console.log('\nWins in the first round (> 50% of valid votes):');
  const wins = f.firstRoundWin.filter((c) => c.p >= 0.01);
  if (!wins.length) console.log('  nobody ≥ 1%');
  for (const { name, p } of wins) console.log(`  ${name.padEnd(20)} ${show(p)}  ${bar(p * 100)}`);
  console.log(`\nRunoff pairings (a runoff is needed in ${(f.runoffNeeded * 100).toFixed(0)}% of simulations):`);
  for (const { a, b, p } of f.pairings.filter((x) => x.p >= 0.01)) console.log(`  ${`${short(a)} vs ${short(b)}`.padEnd(28)} ${show(p)}  ${bar(p * 100)}`);
  console.log('\nOutcomes under 1% omitted. Assumes undecided/blank/null split like decided voters.');
  process.exit(0);
}

console.log(`Presidential polls registered with TSE and released by ${today}${onlyMatched ? ' with results on Wikipedia' : ''}: ${released.length} (showing ${polls.length}, newest release first)`);
console.table(polls.map((p) => ({
  Registro: p.registro,
  Instituto: p.instituto,
  UF: p.uf,
  Campo: `${p.inicio} → ${p.fim}`,
  Divulgação: p.divulgacao,
  Amostra: p.amostra,
})));

function printResult(w: WikiPoll): void {
  const entries = Object.entries(w.values)
    .filter((e): e is [string, number] => e[1] !== null)
    .sort((a, b) => b[1] - a[1]);
  const title = w.round === 1 ? 'First round' : `Second round: ${entries.map(([k]) => k.replace(/ \S+$/, '')).join(' vs ')}`;
  console.log(`\n  ${title}  ·  Wikipedia: ${w.pollster}, ${w.period}, n=${w.sample?.toLocaleString() ?? '?'}, ${w.margin}`);
  for (const [name, v] of entries) console.log(`    ${name.padEnd(24)} ${pct(v)}  ${bar(v)}`);
  if (w.others !== null) console.log(`    ${'Others'.padEnd(24)} ${pct(w.others)}`);
  if (w.undecided !== null) console.log(`    ${'Blank/null/undecided'.padEnd(24)} ${pct(w.undecided)}`);
}

const rl = readline.createInterface({ input: process.stdin });
const prompt = () => process.stdout.write('\nPoll index (q to quit): ');
prompt();
for await (const line of rl) {
  const answer = line.trim();
  if (answer === 'q' || answer === '') break;
  const poll = polls[Number(answer)];
  if (!poll) console.log(`No poll with index "${answer}".`);
  else {
    console.log(`\n${poll.registro} · ${poll.instituto} · fieldwork ${poll.inicio} → ${poll.fim} · TSE sample ${poll.amostra}`);
    const matches = wikiPolls.filter((w) => matchesPoll(poll, w));
    if (!matches.length) console.log('  No matching row on Wikipedia (poll not released yet, or listed under a different name/date).');
    for (const w of matches.sort((a, b) => a.round - b.round)) printResult(w);
  }
  prompt();
}
rl.close();
