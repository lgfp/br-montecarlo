import { gamma, mulberry32 } from './forecast.ts';
import { ELECTION_DATE } from './forecast.ts';
import type { SenatePoll } from './senate-wikipedia.ts';

/**
 * Two Senate seats, two votes per voter, no runoff: the two candidates with the most votes win.
 *
 * Polls come in two formats, and only one of them measures what decides the race:
 *  - two-vote polls (respondents name two candidates; rows sum to well over 100%) give each
 *    candidate's share of ballots naming them, which is what the seats are decided on;
 *  - first-choice polls (rows sum to ~100%) cannot see second votes, e.g. voters of one party
 *    naming both of its candidates, so they are not used.
 * Polls that did not report every candidate are also left out (no honest way to fill the gaps).
 *
 * Each remaining poll is turned into shares of all named votes (this cancels a pollster that
 * inflates everyone), the polls are averaged (sample size x recency), and the result drives a
 * Dirichlet simulation. Winners of each simulated election: the top two shares.
 */

export interface SenateOptions {
  today: string;
  sims: number;
  seed: number;
  /** cap on the Dirichlet concentration (smaller = more uncertainty) */
  concentration: number;
  halfLifeDays: number;
  designEffect: number;
}

export interface SenateForecast {
  names: string[];
  parties: Record<string, string>;
  pollsUsed: number;
  excluded: { firstChoice: number; partial: number };
  pollsters: string[];
  oldest: string;
  newest: string;
  concentration: number;
  /** aggregated share of all named votes, per candidate */
  shares: { name: string; share: number }[];
  /** probability of finishing in the top two */
  win: { name: string; p: number }[];
  /** probability of each pair taking the two seats (unordered) */
  pairs: { a: string; b: string; p: number }[];
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;

/** a two-vote poll cannot sum to more than 100% unless respondents named several candidates */
const TWO_VOTE_SUM = 105;

export function forecastSenate(polls: SenatePoll[], opt: SenateOptions): SenateForecast {
  if (!polls.length) throw new Error('No polls to aggregate.');
  const names = Object.keys(polls[0].values);

  const total = (p: SenatePoll) => Object.values(p.values).reduce<number>((s, v) => s + (v ?? 0), 0) + (p.others ?? 0);
  const twoVote = polls.filter((p) => total(p) > TWO_VOTE_SUM);
  const usable = twoVote.filter((p) => names.every((n) => p.values[n] != null));
  if (!usable.length) throw new Error('No complete two-vote poll available.');

  const k = names.length;
  const avg = new Array<number>(k + 1).fill(0);
  let weightSum = 0, nEff = 0;
  for (const p of usable) {
    const raw = [...names.map((n) => p.values[n] as number), p.others ?? 0];
    const sum = raw.reduce((s, v) => s + v, 0);
    const n = p.sample ?? 1000;
    const w = n * Math.pow(0.5, Math.max(0, daysBetween(p.end, opt.today)) / opt.halfLifeDays);
    raw.forEach((v, i) => (avg[i] += (w * v) / sum));
    weightSum += w;
    nEff += w / opt.designEffect;
  }
  const mean = avg.map((v) => v / weightSum);

  const daysToElection = Math.max(0, daysBetween(opt.today, ELECTION_DATE));
  const concentration = Math.min(opt.concentration, nEff) / (1 + daysToElection / 30);

  const rand = mulberry32(opt.seed);
  const wins = new Array<number>(k).fill(0);
  const pairs = new Map<string, number>();
  const g = new Array<number>(k + 1);
  for (let s = 0; s < opt.sims; s++) {
    for (let i = 0; i <= k; i++) g[i] = gamma(Math.max(concentration * mean[i], 1e-6), rand);
    let first = -1, second = -1;
    for (let i = 0; i < k; i++) {
      if (first < 0 || g[i] > g[first]) { second = first; first = i; }
      else if (second < 0 || g[i] > g[second]) second = i;
    }
    wins[first]++; wins[second]++;
    const key = first < second ? `${first},${second}` : `${second},${first}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }

  const dates = usable.map((p) => p.end).sort();
  return {
    names,
    parties: polls[0].parties,
    pollsUsed: usable.length,
    excluded: { firstChoice: polls.length - twoVote.length, partial: twoVote.length - usable.length },
    pollsters: [...new Set(usable.map((p) => p.pollster))],
    oldest: dates[0],
    newest: dates[dates.length - 1],
    concentration,
    shares: names.map((name, i) => ({ name, share: mean[i] })).sort((a, b) => b.share - a.share),
    win: names.map((name, i) => ({ name, p: wins[i] / opt.sims })).sort((a, b) => b.p - a.p),
    pairs: [...pairs].map(([key, c]) => {
      const [i, j] = key.split(',').map(Number).sort((x, y) => mean[y] - mean[x]);
      return { a: names[i], b: names[j], p: c / opt.sims };
    }).sort((x, y) => y.p - x.p),
  };
}
