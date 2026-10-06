import { fetchPresidentialPolls, fetchPolls } from './tse.ts';
import { fetchWikipediaPolls, matchesPoll, type WikiPoll } from './wikipedia.ts';
import { fetchPresidentPtPolls } from './president-pt.ts';
import { fetchStatePolls } from './senate-wikipedia.ts';
import { applyCorrections } from './corrections.ts';
import { HALF_LIFE_DAYS } from './forecast.ts';
import { STATES } from './states.ts';

// Pollster bias against the first-round result (TSE count via Wikipedia, 2026-10-04).
// Error = poll share of the valid vote minus the actual share of the valid vote, in points.
// Polls enter on the same terms as the forecast: registered with the TSE, matched to a Wikipedia row.

const ELECTION = '2026-10-04';
const WINDOW_DAYS = 21;
const DAY = 86_400_000;
const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Wikipedia lists partnerships and short names separately; fold them into one institute
const ALIASES: [RegExp, string][] = [[/ideia/, 'meio/ideia'], [/poderdata/, 'poderdata'], [/nexus/, 'nexus'], [/mda/, 'cnt/mda'], [/^vox/, 'vox'], [/^real time/, 'real time big data'], [/futura|apex/, 'futura'], [/alfa/, 'alfa']];
const norm = (s: string) => { const n = plain(s); return ALIASES.find(([re]) => re.test(n))?.[1] ?? n; };

type Poll = Pick<WikiPoll, 'pollster' | 'end' | 'sample' | 'values' | 'others'>;

interface Race {
  label: string;
  actual: Record<string, number>; // matcher (regex source on the column name) -> actual % of valid votes
  polls: Poll[];
}

const ACTUAL_PRESIDENT = { 'Lula': 45.16, 'Bolsonaro': 47.03 };
const ACTUAL_RJ_GOV = { 'Paes': 42.76, 'Ruas': 49.27 };

async function presidentPolls(): Promise<WikiPoll[]> {
  const [tse, en] = await Promise.all([fetchPresidentialPolls(), fetchWikipediaPolls()]);
  const e = en.filter((w) => w.round === 1);
  const pt = await fetchPresidentPtPolls(Object.keys(e[0]?.values ?? {})).catch(() => [] as WikiPoll[]);
  const wiki = applyCorrections([...e, ...pt.filter((p) => !e.some((x) => norm(x.pollster) === norm(p.pollster) && x.end === p.end))]);
  return wiki.filter((w) => tse.some((t) => matchesPoll(t, w)));
}

async function rjGovernorPolls(): Promise<Poll[]> {
  const st = STATES.RJ;
  const [rows, tse] = await Promise.all([fetchStatePolls(st.wikiPage, 'governor'), fetchPolls({ scope: 'RJ', cargo: /governador/i })]);
  return rows.filter((r) => r.scenario === '1' && tse.some((t) => matchesPoll(t, r)));
}

const races: Race[] = [
  { label: 'President', actual: ACTUAL_PRESIDENT, polls: await presidentPolls() },
  { label: 'RJ governor', actual: ACTUAL_RJ_GOV, polls: await rjGovernorPolls() },
];

for (const race of races) {
  const [kA, kB] = Object.keys(race.actual);
  const col = (p: Poll, k: string) => Object.entries(p.values).find(([n]) => n.includes(k))?.[1] ?? null;
  const rows = race.polls
    .filter((p) => p.end <= '2026-10-03' && days(p.end, ELECTION) <= WINDOW_DAYS && p.sample)
    .map((p) => {
      const named = Object.values(p.values).reduce<number>((s, v) => s + (v ?? 0), 0);
      const valid = named + (p.others ?? 0);
      const a = col(p, kA), b = col(p, kB);
      if (a == null || b == null || valid <= 0) return null;
      const ea = (100 * a) / valid - race.actual[kA];
      const eb = (100 * b) / valid - race.actual[kB];
      const age = days(p.end, ELECTION);
      return { pollster: norm(p.pollster), end: p.end, n: p.sample as number, ea, eb, margin: eb - ea, age, w: Math.log(p.sample as number) * 0.5 ** (age / HALF_LIFE_DAYS) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // only each institute's final poll: it is the one closest to the vote, so the bias is not blurred by real movement
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = latest.get(r.pollster);
    if (!cur || r.end > cur.end || (r.end === cur.end && r.n > cur.n)) latest.set(r.pollster, r);
  }
  const by = new Map([...latest].map(([k, r]) => [k, [r]]));
  rows.splice(0, rows.length, ...latest.values());
  const wmean = (rs: typeof rows, f: (r: (typeof rows)[number]) => number) => rs.reduce((s, r) => s + r.w * f(r), 0) / rs.reduce((s, r) => s + r.w, 0);

  console.log(`\n== ${race.label}: ${rows.length} institutes' final polls in the last ${WINDOW_DAYS} days, ${by.size} pollsters`);
  console.log(`   actual: ${kA} ${race.actual[kA]}%, ${kB} ${race.actual[kB]}% (margin ${(race.actual[kB] - race.actual[kA]).toFixed(1)})`);
  console.log(`   all polls, weighted: ${kA} ${wmean(rows, (r) => r.ea).toFixed(1)}, ${kB} ${wmean(rows, (r) => r.eb).toFixed(1)}, margin(${kB}-${kA}) ${wmean(rows, (r) => r.margin).toFixed(1)}`);
  // how prolific each institute was over the campaign (matched polls ending since 16 Aug), and whether it published in October
  const volume = new Map<string, number>();
  for (const p of race.polls) if (p.end >= '2026-08-16' && p.end <= '2026-10-03') volume.set(norm(p.pollster), (volume.get(norm(p.pollster)) ?? 0) + 1);
  const industry = wmean(rows, (r) => r.margin);
  console.log(`   ${'pollster'.padEnd(20)} since16Aug  Oct?  last   ${kA.padStart(8)} ${kB.padStart(8)}  margin err  vs industry  ~SE(2-sigma)`);
  for (const [name, rs] of [...by].sort((x, y) => wmean(y[1], (r) => r.margin) - wmean(x[1], (r) => r.margin))) {
    const last = rs.reduce((m, r) => (r.end > m ? r.end : m), '');
    const m = wmean(rs, (r) => r.margin);
    // sampling error of a lead from one poll of size n (design effect 2), shrinking with the number of polls
    const nTot = rs[0].n;
    const se = 2 * Math.sqrt((2 * (race.actual[kA] + race.actual[kB]) / 100) / nTot) * 100;
    console.log(`   ${name.slice(0, 20).padEnd(20)} ${String(volume.get(name) ?? 0).padStart(9)}  ${last >= '2026-10-01' ? 'yes' : 'no '}   ${last.slice(5)}  ${wmean(rs, (r) => r.ea).toFixed(1).padStart(8)} ${wmean(rs, (r) => r.eb).toFixed(1).padStart(8)}  ${m.toFixed(1).padStart(9)}  ${(m - industry).toFixed(1).padStart(10)}  ±${se.toFixed(1)}`);
  }
}
