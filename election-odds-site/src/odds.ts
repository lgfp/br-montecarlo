import { fetchPresidentialPolls } from './tse.ts';
import { fetchWikipediaPolls, matchesPoll, type WikiPoll } from './wikipedia.ts';
import { ELECTION_DATE, forecast, type Forecast } from './forecast.ts';

// Default model parameters (same defaults as the CLI's --forecast mode)
const POLLS = 50;
const SIMS = 200_000;
const SEED = 2026;
const CONCENTRATION = 300;

export interface Odds {
  generatedAt: string;
  electionDate: string;
  simulations: number;
  pollsRequested: number;
  pollsUsed: number;
  oldestPoll: string;
  newestPoll: string;
  /** probability that each candidate wins outright (> 50% of valid votes) */
  firstRoundWin: { flavio: number; lula: number };
  /** probability that the runoff is exactly Lula vs Flávio Bolsonaro */
  runoffLulaFlavio: number;
}

const find = (names: string[], needle: string) => {
  const name = names.find((n) => n.includes(needle));
  if (!name) throw new Error(`Candidate "${needle}" not found in the poll tables (found: ${names.join(', ')})`);
  return name;
};

export async function computeOdds(): Promise<{ odds: Odds; forecast: Forecast }> {
  const [allPolls, wikiPolls] = await Promise.all([fetchPresidentialPolls(), fetchWikipediaPolls()]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // the last N distinct Wikipedia first-round rows behind released TSE polls (newest release first)
  const rows = new Set<WikiPoll>();
  for (const p of allPolls.filter((p) => p.divulgacao <= today)) {
    for (const w of wikiPolls) if (w.round === 1 && matchesPoll(p, w)) rows.add(w);
    if (rows.size >= POLLS) break;
  }
  const matched = [...rows].sort((a, b) => b.end.localeCompare(a.end)).slice(0, POLLS);

  const f = forecast(matched, { today, sims: SIMS, seed: SEED, concentration: CONCENTRATION, halfLifeDays: 7, designEffect: 2 });

  const names = f.shares.map((s) => s.name);
  const lula = find(names, 'Lula');
  const flavio = find(names, 'Bolsonaro');
  const win = (name: string) => f.firstRoundWin.find((c) => c.name === name)!.p;
  const runoff = f.pairings.find((x) => [x.a, x.b].includes(lula) && [x.a, x.b].includes(flavio))?.p ?? 0;

  return {
    forecast: f,
    odds: {
      generatedAt: new Date().toISOString(),
      electionDate: ELECTION_DATE,
      simulations: SIMS,
      pollsRequested: POLLS,
      pollsUsed: f.pollsUsed,
      oldestPoll: f.oldest,
      newestPoll: f.newest,
      firstRoundWin: { flavio: win(flavio), lula: win(lula) },
      runoffLulaFlavio: runoff,
    },
  };
}
