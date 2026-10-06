import { fetchPresidentialPolls, fetchPolls } from './tse.ts';
import { fetchWikipediaPolls, matchesPoll } from './wikipedia.ts';
import { fetchStatePolls } from './senate-wikipedia.ts';
import { HALF_LIFE_DAYS } from './forecast.ts';
import { STATES } from './states.ts';

/**
 * Second-round odds for a two-candidate runoff, built from two ingredients:
 *
 *  1. the first-round result, restricted to the two finalists (each one's share of their combined votes);
 *  2. runoff polls taken before the first round, converted to the same two-way shares, adjusted for
 *     institute bias (see the adjustments below) and averaged (log of sample size x recency).
 *
 * The estimate is a 80/20 blend of the two. The finalists' share of the runoff vote is then taken as
 * normally distributed around that blend, with a fixed spread (SD_POINTS) that stands for what neither
 * ingredient knows: where the eliminated candidates' voters go, and who turns out.
 *
 * Polls whose fieldwork ended after the first round are post-election polls: they enter the same average
 * without the pre-election adjustments, and the run prints a warning because the blend should be revisited.
 */

export const RUNOFF_DATE = '2026-10-25';
const FIRST_ROUND = '2026-10-04';

/** weight of the first-round result in the blend; the rest goes to the polls */
export const ELECTION_WEIGHT = 0.8;
/** 1 standard deviation of the finalists' two-way share, in points: ~1.6 from reallocating the eliminated candidates' votes (~8% of the valid vote, ~20 points of uncertainty over where it goes) plus ~1.2 for turnout shifts */
export const SD_POINTS = 2.0;
/** pre-election runoff polls count when their fieldwork ended in the two weeks before the first round */
const WINDOW_DAYS = 14;
const DAY = 86_400_000;
const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;

/** standard normal CDF (Abramowitz-Stegun 7.1.26) */
const phi = (z: number) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return 0.5 * (1 + (z < 0 ? -erf : erf));
};

interface RawPoll { pollster: string; end: string; sample: number; a: number; b: number }

interface Spec {
  uf: string;
  a: { name: string; party: string; match: string; votes: number };
  b: { name: string; party: string; match: string; votes: number };
  /** TSE-registered runoff polls of the race, as (pollster, last fieldwork day, sample, A %, B %) */
  load: () => Promise<RawPoll[]>;
  /** which pollsters count; absent = all */
  allowed?: RegExp;
  /** points of two-way share moved from A to B in a pre-election poll (negative moves them from B to A) */
  adjust: (poll: RawPoll) => number;
}

export interface RunoffPollRow {
  pollster: string;
  end: string;
  sample: number;
  /** A's raw two-way share (%), A's share after the adjustment, the adjustment moved from A to B, and the poll's weight */
  raw: number;
  adjusted: number;
  shift: number;
  weight: number;
  preElection: boolean;
}

export interface RunoffOdds {
  generatedAt: string;
  runoffDate: string;
  electionWeight: number;
  sdPoints: number;
  /** each finalist's first-round share, of all valid votes and of the two finalists' votes only */
  firstRound: { a: { valid: number; twoWay: number }; b: { valid: number; twoWay: number } };
  pollsUsed: number;
  effectivePolls: number;
  oldestPoll: string | null;
  newestPoll: string | null;
  /** polls' average two-way share, after adjustments (null when no poll qualifies) */
  polls: { a: number; b: number } | null;
  blend: { a: number; b: number };
  /** probability of winning the runoff */
  p: { a: number; b: number };
  pollRows: RunoffPollRow[];
  postElectionPolls: number;
  intention: { basis: 'twoWay'; rows: { name: string; party: string; share: number; margin: number }[]; others: null };
}

async function build(spec: Spec, validVotes: number): Promise<RunoffOdds> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const cutoff = new Date(new Date(FIRST_ROUND).getTime() - WINDOW_DAYS * DAY).toISOString().slice(0, 10);

  const raw = (await spec.load())
    .filter((p) => p.end >= cutoff && p.end <= today && (!spec.allowed || spec.allowed.test(p.pollster)));
  const rows: RunoffPollRow[] = raw.map((p) => {
    const preElection = p.end <= FIRST_ROUND;
    const twoWay = (100 * p.a) / (p.a + p.b);
    const shift = preElection ? spec.adjust(p) : 0;
    const age = Math.max(0, days(p.end, today));
    return { pollster: p.pollster, end: p.end, sample: p.sample, raw: twoWay, adjusted: twoWay - shift, shift, weight: Math.log(Math.max(p.sample, 2)) * 0.5 ** (age / HALF_LIFE_DAYS), preElection };
  }).sort((x, y) => y.end.localeCompare(x.end));

  const wSum = rows.reduce((s, r) => s + r.weight, 0);
  const pollA = rows.length ? rows.reduce((s, r) => s + r.weight * r.adjusted, 0) / wSum : null;

  const totalTwo = spec.a.votes + spec.b.votes;
  const electA = (100 * spec.a.votes) / totalTwo;
  const blendA = pollA === null ? electA : ELECTION_WEIGHT * electA + (1 - ELECTION_WEIGHT) * pollA;
  const pA = phi((blendA - 50) / SD_POINTS);
  const margin = 1.96 * SD_POINTS / 100;

  return {
    generatedAt: new Date().toISOString(),
    runoffDate: RUNOFF_DATE,
    electionWeight: ELECTION_WEIGHT,
    sdPoints: SD_POINTS,
    firstRound: {
      a: { valid: spec.a.votes / validVotes, twoWay: electA / 100 },
      b: { valid: spec.b.votes / validVotes, twoWay: 1 - electA / 100 },
    },
    pollsUsed: rows.length,
    effectivePolls: rows.length ? Math.round(((wSum * wSum) / rows.reduce((s, r) => s + r.weight ** 2, 0)) * 10) / 10 : 0,
    oldestPoll: rows.length ? rows[rows.length - 1].end : null,
    newestPoll: rows.length ? rows[0].end : null,
    polls: pollA === null ? null : { a: pollA / 100, b: 1 - pollA / 100 },
    blend: { a: blendA / 100, b: 1 - blendA / 100 },
    p: { a: pA, b: 1 - pA },
    pollRows: rows,
    postElectionPolls: rows.filter((r) => !r.preElection).length,
    intention: {
      basis: 'twoWay',
      rows: [
        { name: spec.a.name, party: spec.a.party, share: blendA / 100, margin },
        { name: spec.b.name, party: spec.b.party, share: 1 - blendA / 100, margin },
      ],
      others: null,
    },
  };
}

// ---- President: Lula x Flávio Bolsonaro ----

/**
 * Only institutes that kept publishing into October and have a track record over the campaign (6+ polls,
 * or 3+ with no sign of bias) count. Their first-round miss on Lula (final poll against the result, points of
 * the valid vote) was: Datafolha +0.5, Quaest +0.8, AtlasIntel +1.8 (overstated), Palver -1.7, Futura -2.5
 * (understated), the rest within 0.2 of zero or too noisy. The adjustments below are about half of the
 * measured miss, since one poll's error is mostly noise; Datafolha's also reflects its history of overstating Lula.
 * Positive = points of two-way share moved from Lula to Flávio.
 */
const PRESIDENT_PENALTY: [RegExp, number][] = [
  [/datafolha/i, 0.7],
  [/quaest/i, 0.5],
  [/atlas/i, 1.0],
  [/palver/i, -1.0],
  [/futura|apex/i, -1.5],
];
const PRESIDENT_ALLOWED = /datafolha|quaest|atlas|palver|futura|apex|verit|poderdata|gerp|vox/i;

export async function computePresidentRunoff(): Promise<RunoffOdds> {
  const spec: Spec = {
    uf: 'BR',
    a: { name: 'Lula', party: 'PT', match: 'Lula', votes: 53_879_538 },
    b: { name: 'Flávio Bolsonaro', party: 'PL', match: 'Bolsonaro', votes: 56_104_503 },
    allowed: PRESIDENT_ALLOWED,
    adjust: (p) => PRESIDENT_PENALTY.find(([re]) => re.test(p.pollster))?.[1] ?? 0,
    load: async () => {
      const [tse, wiki] = await Promise.all([fetchPresidentialPolls(), fetchWikipediaPolls()]);
      const find = (w: (typeof wiki)[number], key: string) => Object.entries(w.values).find(([n]) => n.includes(key))?.[1] ?? null;
      return wiki.filter((w) => w.round === 2 && w.sample && tse.some((t) => matchesPoll(t, w))).flatMap((w): RawPoll[] => {
        const a = find(w, 'Lula'), b = find(w, 'Bolsonaro');
        // pairings against other candidates have a null Lula or Flávio column
        const others = Object.entries(w.values).filter(([n, v]) => !/Lula|Bolsonaro/.test(n) && v !== null);
        return a !== null && b !== null && !others.length ? [{ pollster: w.pollster, end: w.end, sample: w.sample as number, a, b }] : [];
      });
    },
  };
  return build(spec, 119_300_788);
}

// ---- Rio de Janeiro governor: Ruas x Paes ----

/** points of two-way share moved from Paes to Ruas in every pre-election Rio runoff poll (the first-round polls missed Ruas by roughly this much once restated as a two-way split) */
export const RIO_RUAS_BOOST = 10;

export async function computeRioRunoff(): Promise<RunoffOdds> {
  const state = STATES.RJ;
  const spec: Spec = {
    uf: 'RJ',
    a: { name: 'Douglas Ruas', party: 'PL', match: 'Ruas', votes: 4_271_199 },
    b: { name: 'Eduardo Paes', party: 'PSD', match: 'Paes', votes: 3_706_984 },
    adjust: () => -RIO_RUAS_BOOST,
    load: async () => {
      const [rows, tse] = await Promise.all([
        fetchStatePolls(state.wikiPage, 'governor-runoff', /Paes e Douglas Ruas/i),
        fetchPolls({ scope: 'RJ', cargo: /governador/i }),
      ]);
      return rows.filter((r) => r.sample && tse.some((t) => matchesPoll(t, r))).flatMap((r): RawPoll[] => {
        const get = (key: string) => Object.entries(r.values).find(([n]) => n.includes(key))?.[1] ?? null;
        const a = get('Ruas'), b = get('Paes');
        return a !== null && b !== null ? [{ pollster: r.pollster, end: r.end, sample: r.sample as number, a, b }] : [];
      });
    },
  };
  return build(spec, 8_669_038);
}
