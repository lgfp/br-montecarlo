import { fetchPolls } from './tse.ts';
import { matchesPoll, type WikiPoll } from './wikipedia.ts';
import { fetchStatePolls } from './senate-wikipedia.ts';
import { ELECTION_DATE, forecast, type Intention } from './forecast.ts';
import type { State } from './states.ts';

// Same method as the presidential page (valid-vote average -> Dirichlet simulation -> 50% rule),
// fed with a state's governor polls. The concentration cap is lower than the presidential
// one (300): state polls are smaller and tend to miss by more than national ones.
const POLLS = 50;
const SIMS = 200_000;
const SEED = 2026;
const CONCENTRATION = 200;

export interface Leader {
  name: string;
  party: string;
  /** probability of winning outright in the first round (> 50% of valid votes) */
  p: number;
  /** aggregated share of the valid vote */
  share: number;
}

export interface GovernorOdds {
  uf: string;
  generatedAt: string;
  electionDate: string;
  simulations: number;
  pollsRequested: number;
  pollsUsed: number;
  oldestPoll: string;
  newestPoll: string;
  /** the two candidates with the highest aggregated share */
  leaders: [Leader, Leader];
  /** probability that nobody passes 50% of valid votes */
  runoffNeeded: number;
  /** probability that the runoff is exactly leaders[0] vs leaders[1] */
  runoffLeaders: number;
  /** every other runoff pairing, most likely first */
  otherRunoffs: { a: string; b: string; p: number }[];
  intention: Intention;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export async function computeGovernorOdds(state: State): Promise<GovernorOdds> {
  const [wikiRows, tsePolls] = await Promise.all([
    fetchStatePolls(state.wikiPage, 'governor'),
    fetchPolls({ scope: state.uf, cargo: /governador/i }),
  ]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // scenario 1 is the full ballot (e.g. in Rio it lists Garotinho, who is assumed to be a valid candidate)
  const scenario1 = wikiRows.filter((r) => r.scenario === '1');

  // the last N distinct poll rows behind released TSE polls (newest release first)
  const rows = new Set<(typeof scenario1)[number]>();
  for (const t of tsePolls.filter((t) => t.divulgacao <= today)) {
    for (const w of scenario1) if (matchesPoll(t, w)) rows.add(w);
    if (rows.size >= POLLS) break;
  }
  const picked = [...rows].sort((a, b) => b.end.localeCompare(a.end)).slice(0, POLLS);
  if (!picked.length) throw new Error(`No ${state.uf} governor polls matched a TSE registration`);

  // "-" means a candidate was not listed. For minor candidates (typically under 2%) that is read as ~0;
  // a poll that omits a major candidate stays incomplete and is skipped by the model.
  const names = Object.keys(picked[0].values);
  const parties = picked[0].parties;
  const minor = new Set(names.filter((n) => median(picked.map((p) => p.values[n]).filter((v): v is number => v !== null)) < 2));
  const polls: WikiPoll[] = picked.map((p) => ({
    round: 1,
    pollster: p.pollster,
    period: p.period,
    end: p.end,
    values: Object.fromEntries(names.map((n) => [n, p.values[n] ?? (minor.has(n) ? 0 : null)])),
    others: p.others ?? 0,
    undecided: p.undecided,
    margin: '',
    sample: p.sample,
  }));

  const f = forecast(polls, { today, sims: SIMS, seed: SEED, concentration: CONCENTRATION, halfLifeDays: 7, designEffect: 2 });

  const win = new Map(f.firstRoundWin.map((c) => [c.name, c.p]));
  const [a, b] = f.shares;
  const leader = (s: { name: string; share: number }): Leader => ({ name: s.name, party: parties[s.name] ?? '', p: win.get(s.name) ?? 0, share: s.share });
  const isMain = (x: { a: string; b: string }) => [x.a, x.b].includes(a.name) && [x.a, x.b].includes(b.name);

  return {
    uf: state.uf,
    generatedAt: new Date().toISOString(),
    electionDate: ELECTION_DATE,
    simulations: SIMS,
    pollsRequested: POLLS,
    pollsUsed: f.pollsUsed,
    oldestPoll: f.oldest,
    newestPoll: f.newest,
    leaders: [leader(a), leader(b)],
    runoffNeeded: f.runoffNeeded,
    runoffLeaders: f.pairings.find(isMain)?.p ?? 0,
    otherRunoffs: f.pairings.filter((x) => !isMain(x)),
    intention: {
      basis: 'valid',
      rows: f.shares.map((c) => ({ name: c.name, party: parties[c.name] ?? '', share: c.share, margin: c.margin })),
      others: { share: f.othersShare, margin: f.othersMargin },
    },
  };
}
