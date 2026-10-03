import type { WikiPoll } from './wikipedia.ts';

/**
 * Poll-aggregation + Monte Carlo forecast.
 *
 * 1. Each poll is converted to shares of the valid vote (candidates + others; blank/null/undecided
 *    are dropped, i.e. assumed to split like decided voters).
 * 2. Polls are averaged, weighted by sample size and recency (exponential decay).
 * 3. The average is turned into a Dirichlet distribution whose concentration reflects the effective
 *    sample size, capped to account for non-sampling error (house effects, turnout, late swing),
 *    and widened the further away the election is.
 * 4. Each simulated election is checked against the Brazilian rule: more than 50% of valid votes
 *    wins in the first round, otherwise the top two go to a runoff.
 */

/** Aggregated vote intention shown at the bottom of each page */
export interface Intention {
  /** 'valid': share of the valid vote; 'named': share of all votes named (Senate, two votes per voter) */
  basis: 'valid' | 'named';
  rows: { name: string; party: string; share: number; /** 95% half-width, as a fraction */ margin: number }[];
  others: { share: number; margin: number } | null;
}

/**
 * Sampling error stops mattering long before a poll reaches 40,000 interviews (house effects and other
 * non-sampling error dominate), so a poll never counts for more than this many respondents.
 */
const MAX_WEIGHTED_SAMPLE = 5000;

export const ELECTION_DATE = '2026-10-04';

export interface ForecastOptions {
  today: string;
  sims: number;
  seed: number;
  /** cap on the Dirichlet concentration (smaller = more uncertainty) */
  concentration: number;
  halfLifeDays: number;
  /** assumed design effect of the polls (quota/cluster samples are less efficient than SRS) */
  designEffect: number;
}

export interface Forecast {
  pollsUsed: number;
  oldest: string;
  newest: string;
  concentration: number;
  /** aggregated share of the valid vote, per candidate */
  shares: { name: string; share: number; /** 95% half-width of the simulated share, as a fraction */ margin: number }[];
  othersShare: number;
  othersMargin: number;
  /** probability of winning outright (> 50% of valid votes) */
  firstRoundWin: { name: string; p: number }[];
  /** probability that nobody wins outright */
  runoffNeeded: number;
  /** probability of each runoff pairing (unordered); sums to runoffNeeded */
  pairings: { a: string; b: string; p: number }[];
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Marsaglia–Tsang gamma sampler (shape > 0, scale 1)
export function gamma(shape: number, rand: () => number): number {
  if (shape < 1) return gamma(shape + 1, rand) * Math.pow(rand(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = rand() || Number.MIN_VALUE, u2 = rand();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function forecast(polls: WikiPoll[], opt: ForecastOptions): Forecast {
  if (!polls.length) throw new Error('No polls to aggregate.');
  const names = Object.keys(polls[0].values);
  // polls that did not test every candidate cannot be put on the same footing
  const usable = polls.filter((p) => names.every((n) => p.values[n] != null));
  if (!usable.length) throw new Error('No poll covers the full candidate list.');

  // 1–2. valid-vote shares, weighted average (last bucket = others)
  const avg = new Array<number>(names.length + 1).fill(0);
  let weightSum = 0, nEff = 0;
  for (const p of usable) {
    const raw = [...names.map((n) => p.values[n] as number), p.others ?? 0];
    const total = raw.reduce((s, v) => s + v, 0);
    const n = Math.min(p.sample ?? 1000, MAX_WEIGHTED_SAMPLE);
    const decay = Math.pow(0.5, Math.max(0, daysBetween(p.end, opt.today)) / opt.halfLifeDays);
    const w = n * decay;
    raw.forEach((v, i) => (avg[i] += (w * v) / total));
    weightSum += w;
    nEff += w / opt.designEffect;
  }
  const mean = avg.map((v) => v / weightSum);

  // 3. uncertainty: sampling error floor, capped, inflated by time to election
  const daysToElection = Math.max(0, daysBetween(opt.today, ELECTION_DATE));
  const concentration = Math.min(opt.concentration, nEff) / (1 + daysToElection / 30);

  // 4. simulate
  const rand = mulberry32(opt.seed);
  const k = names.length;
  const wins = new Array<number>(k).fill(0);
  const pairs = new Map<string, number>();
  let runoffs = 0;
  const g = new Array<number>(k + 1);
  // running sums of each simulated share, for the 95% margin
  const sum = new Array<number>(k + 1).fill(0), sumSq = new Array<number>(k + 1).fill(0);
  for (let s = 0; s < opt.sims; s++) {
    let total = 0;
    for (let i = 0; i <= k; i++) total += g[i] = gamma(Math.max(concentration * mean[i], 1e-6), rand);
    for (let i = 0; i <= k; i++) { const x = g[i] / total; sum[i] += x; sumSq[i] += x * x; }
    let first = -1, second = -1;
    for (let i = 0; i < k; i++) {
      if (first < 0 || g[i] > g[first]) { second = first; first = i; }
      else if (second < 0 || g[i] > g[second]) second = i;
    }
    if (g[first] / total > 0.5) wins[first]++;
    else {
      runoffs++;
      const key = first < second ? `${first},${second}` : `${second},${first}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }

  const margin = (i: number) => 1.96 * Math.sqrt(Math.max(0, sumSq[i] / opt.sims - (sum[i] / opt.sims) ** 2));

  const dates = usable.map((p) => p.end).sort();
  return {
    pollsUsed: usable.length,
    oldest: dates[0],
    newest: dates[dates.length - 1],
    concentration,
    shares: names.map((name, i) => ({ name, share: mean[i], margin: margin(i) })).sort((a, b) => b.share - a.share),
    othersShare: mean[k],
    othersMargin: margin(k),
    firstRoundWin: names.map((name, i) => ({ name, p: wins[i] / opt.sims })).sort((a, b) => b.p - a.p),
    runoffNeeded: runoffs / opt.sims,
    pairings: [...pairs].map(([key, c]) => {
      const [i, j] = key.split(',').map(Number).sort((x, y) => mean[y] - mean[x]);
      return { a: names[i], b: names[j], p: c / opt.sims };
    }).sort((x, y) => y.p - x.p),
  };
}
