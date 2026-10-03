#!/usr/bin/env node
import readline from 'node:readline';
import { fetchPresidentialPolls } from './tse.js';
import { fetchWikipediaPolls, matchesPoll } from './wikipedia.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const limit = Number(opt('limit', 20));
const pollster = opt('pollster', '');

const [allPolls, wikiPolls] = await Promise.all([fetchPresidentialPolls({ pollster }), fetchWikipediaPolls()]);
const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const onlyMatched = args.includes('--matched');
const released = allPolls
  .filter((p) => p.divulgacao <= today)
  .filter((p) => !onlyMatched || wikiPolls.some((w) => matchesPoll(p, w)));
const polls = released.slice(0, limit);

console.log(`Presidential polls registered with TSE and released by ${today}${onlyMatched ? ' with results on Wikipedia' : ''}: ${released.length} (showing ${polls.length}, newest release first)`);
console.table(polls.map((p) => ({
  Registro: p.registro,
  Instituto: p.instituto,
  UF: p.uf,
  Campo: `${p.inicio} → ${p.fim}`,
  Divulgação: p.divulgacao,
  Amostra: p.amostra,
})));

const pct = (v) => (v === null ? '  —  ' : `${v.toFixed(1).padStart(5)}%`);
const bar = (v) => (v === null ? '' : '█'.repeat(Math.round(v / 2)));

function printResult(round, w) {
  const entries = Object.entries(w.values).filter(([, v]) => v !== null).sort((a, b) => b[1] - a[1]);
  const title = round === 1 ? 'First round' : `Second round: ${entries.map(([k]) => k.replace(/ \S+$/, '')).join(' vs ')}`;
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
    for (const w of matches.sort((a, b) => a.round - b.round)) printResult(w.round, w);
  }
  prompt();
}
rl.close();
