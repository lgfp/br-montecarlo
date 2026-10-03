import { fetchPolls } from './tse.ts';
import { matchesPoll } from './wikipedia.ts';
import { fetchSantaCatarinaSenatePolls } from './senate-wikipedia.ts';
import { ELECTION_DATE } from './forecast.ts';
import { forecastSenate, type SenateForecast } from './senate-forecast.ts';

// Default model parameters. The concentration cap is lower than the presidential one (300):
// state polls are small, there are few pollsters, and second-vote behavior is uncertain.
const SIMS = 200_000;
const SEED = 2026;
const CONCENTRATION = 150;

export interface SenateOdds {
  generatedAt: string;
  electionDate: string;
  seats: 2;
  simulations: number;
  pollsUsed: number;
  pollsters: string[];
  excluded: { firstChoice: number; partial: number; unregistered: number };
  oldestPoll: string;
  newestPoll: string;
  /** probability of winning a seat, most likely first */
  candidates: { name: string; party: string; p: number; share: number }[];
  /** probability of each pair taking the two seats */
  pairs: { a: string; b: string; p: number }[];
}

export async function computeSenateOdds(): Promise<{ odds: SenateOdds; forecast: SenateForecast }> {
  const [wikiPolls, tsePolls] = await Promise.all([
    fetchSantaCatarinaSenatePolls(),
    fetchPolls({ scope: 'SC', cargo: /senador/i }),
  ]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // only polls that are registered with the TSE and already released
  const released = tsePolls.filter((t) => t.divulgacao <= today);
  const matched = wikiPolls.filter((w) => released.some((t) => matchesPoll(t, w)));

  const f = forecastSenate(matched, { today, sims: SIMS, seed: SEED, concentration: CONCENTRATION, halfLifeDays: 7, designEffect: 2 });
  const share = new Map(f.shares.map((s) => [s.name, s.share]));

  return {
    forecast: f,
    odds: {
      generatedAt: new Date().toISOString(),
      electionDate: ELECTION_DATE,
      seats: 2,
      simulations: SIMS,
      pollsUsed: f.pollsUsed,
      pollsters: f.pollsters,
      excluded: { ...f.excluded, unregistered: wikiPolls.length - matched.length },
      oldestPoll: f.oldest,
      newestPoll: f.newest,
      candidates: f.win.map((c) => ({ name: c.name, party: f.parties[c.name] ?? '', p: c.p, share: share.get(c.name)! })),
      pairs: f.pairs,
    },
  };
}
