import { fetchPresidentialPolls, fetchPolls } from './tse.ts';
import { fetchWikipediaPolls, matchesPoll } from './wikipedia.ts';
import { fetchStatePolls } from './senate-wikipedia.ts';
import { HALF_LIFE_DAYS } from './forecast.ts';
import { fetchFirstRound, type FirstRound } from './tse-results.ts';
import type { State } from './states.ts';

/**
 * Second-round odds for a two-candidate runoff, built from two ingredients:
 *
 *  1. the first-round result, restricted to the two finalists (each one's share of their combined votes);
 *  2. runoff polls taken before the first round, converted to the same two-way shares, adjusted for
 *     institute bias (see the adjustments below) and averaged (log of sample size x recency).
 *
 * The estimate is a 80/20 blend of the two. The finalists' share of the runoff vote is then taken as
 * normally distributed around that blend, with a spread (sdPoints) that stands for what neither ingredient
 * knows: where the eliminated candidates' voters go (more uncertainty the more voters were eliminated), and who turns out.
 *
 * Only RUNOFF polls count (tables of the two finalists head to head), never first-round "big field" polls.
 * If a state has too few runoff polls to rely on (fewer than MIN_POLLS polls or MIN_POLLSTERS institutes in the window),
 * the polls are ignored and the estimate is the first-round result alone; the page says so.
 *
 * Polls whose fieldwork ended after the first round are post-election polls: they enter the same average
 * without the pre-election adjustments, and the run prints a warning because the blend should be revisited.
 */

export const RUNOFF_DATE = '2026-10-25';
const FIRST_ROUND = '2026-10-04';

/** weight of the first-round result in the blend; the rest goes to the polls */
export const ELECTION_WEIGHT = 0.8;
/**
 * 1 standard deviation of the finalists' two-way share, in points. Two independent parts:
 *  - where the eliminated candidates' voters go: they hold `eliminated` % of the valid vote and we are unsure of the
 *    split by about 20 points (ELIMINATED_SPLIT_SD), so this part is 0.20 x eliminated (1.6 in Rio, 5.4 in Rio Grande do Norte);
 *  - who turns out and other late shifts: a flat 1.2 (TURNOUT_SD).
 */
const ELIMINATED_SPLIT_SD = 0.2;
const TURNOUT_SD = 1.2;
export const sdPoints = (eliminatedPct: number) => Math.sqrt((ELIMINATED_SPLIT_SD * eliminatedPct) ** 2 + TURNOUT_SD ** 2);
/** pre-election runoff polls count when their fieldwork ended in the two weeks before the first round */
const WINDOW_DAYS = 14;
/** fewer runoff polls than this, or from fewer institutes, and the polls are not used */
const MIN_POLLS = 3;
const MIN_POLLSTERS = 2;
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
  firstRound: FirstRound;
  /** display names and parties, A first (A = the candidate shown on the left) */
  a: { name: string; party: string };
  b: { name: string; party: string };
  /** TSE-registered RUNOFF polls of the race, as (pollster, last fieldwork day, sample, A %, B %) */
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
  /** weight of the first-round result in the blend (1 when the polls were not used) */
  electionWeight: number;
  /** runoff polls found in the window, and whether there were enough of them to use */
  pollsFound: number;
  pollsReliable: boolean;
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

async function build(spec: Spec, votes: { a: number; b: number }): Promise<RunoffOdds> {
  const validVotes = spec.firstRound.validVotes;
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

  const found = rows.length;
  const reliable = found >= MIN_POLLS && new Set(rows.map((r) => r.pollster.toLowerCase())).size >= MIN_POLLSTERS;
  if (!reliable) rows.length = 0; // too thin: first-round result alone

  const wSum = rows.reduce((s, r) => s + r.weight, 0);
  const pollA = rows.length ? rows.reduce((s, r) => s + r.weight * r.adjusted, 0) / wSum : null;

  const totalTwo = votes.a + votes.b;
  const electA = (100 * votes.a) / totalTwo;
  const weight = pollA === null ? 1 : ELECTION_WEIGHT;
  const blendA = weight * electA + (1 - weight) * (pollA ?? 0);
  const eliminated = 100 - (100 * (votes.a + votes.b)) / validVotes;
  const sd = sdPoints(eliminated);
  const pA = phi((blendA - 50) / sd);
  const margin = 1.96 * sd / 100;

  return {
    generatedAt: new Date().toISOString(),
    runoffDate: RUNOFF_DATE,
    electionWeight: weight,
    pollsFound: found,
    pollsReliable: reliable,
    sdPoints: Math.round(sd * 10) / 10,
    firstRound: {
      a: { valid: votes.a / validVotes, twoWay: electA / 100 },
      b: { valid: votes.b / validVotes, twoWay: 1 - electA / 100 },
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
  const firstRound = await fetchFirstRound('br', 'president');
  // Lula on the left, as on the page's portraits
  const lula = firstRound.finalists.find((f) => /lula/i.test(f.name))!;
  const flavio = firstRound.finalists.find((f) => /bols/i.test(f.name))!;
  const spec: Spec = {
    uf: 'BR',
    firstRound,
    a: { name: 'Lula', party: lula.party },
    b: { name: 'Flávio Bolsonaro', party: flavio.party },
    allowed: PRESIDENT_ALLOWED,
    adjust: (p) => PRESIDENT_PENALTY.find(([re]) => re.test(p.pollster))?.[1] ?? 0,
    load: async () => {
      const [tse, wiki] = await Promise.all([fetchPresidentialPolls(), fetchWikipediaPolls()]);
      const find = (w: (typeof wiki)[number], key: string) => Object.entries(w.values).find(([n]) => n.includes(key))?.[1] ?? null;
      // round 2 = the runoff tables; pairings against other candidates have a null Lula or Flávio column
      return wiki.filter((w) => w.round === 2 && w.sample && tse.some((t) => matchesPoll(t, w))).flatMap((w): RawPoll[] => {
        const a = find(w, 'Lula'), b = find(w, 'Bolsonaro');
        const others = Object.entries(w.values).filter(([n, v]) => !/Lula|Bolsonaro/.test(n) && v !== null);
        return a !== null && b !== null && !others.length ? [{ pollster: w.pollster, end: w.end, sample: w.sample as number, a, b }] : [];
      });
    },
  };
  return build(spec, { a: lula.votes, b: flavio.votes });
}

// ---- Governors ----

/** points of two-way share moved from Paes to Ruas in every pre-election Rio runoff poll (the first-round polls missed Ruas by roughly this much once restated as a two-way split) */
export const RIO_RUAS_BOOST = 10;

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** a poll column / heading names a finalist when one contains the other ("Allyson" vs "Allyson", "Professora Dorinha") */
const same = (label: string, name: string) => { const a = plain(label), b = plain(name); return a.includes(b) || b.includes(a); };

export async function computeStateRunoff(state: State): Promise<RunoffOdds> {
  const firstRound = await fetchFirstRound(state.uf, 'governor');
  const [a, b] = firstRound.finalists;
  const spec: Spec = {
    uf: state.uf,
    firstRound,
    a: { name: a.name, party: a.party },
    b: { name: b.name, party: b.party },
    // only Rio has a bias estimate (see RIO_RUAS_BOOST); everywhere else the polls enter as published
    adjust: () => (state.uf === 'RJ' ? -RIO_RUAS_BOOST : 0),
    load: async () => {
      const [rows, tse] = await Promise.all([
        // the section of the two finalists head to head; never the first-round tables
        fetchStatePolls(state.wikiPage, 'governor-runoff', (h3) => same(h3, a.name) && same(h3, b.name)),
        fetchPolls({ scope: state.uf, cargo: /governador/i }),
      ]);
      return rows.filter((r) => r.sample && tse.some((t) => matchesPoll(t, r))).flatMap((r): RawPoll[] => {
        const get = (name: string) => Object.entries(r.values).find(([n]) => same(n, name))?.[1] ?? null;
        const va = get(a.name), vb = get(b.name);
        return va !== null && vb !== null ? [{ pollster: r.pollster, end: r.end, sample: r.sample as number, a: va, b: vb }] : [];
      });
    },
  };
  return build(spec, { a: a.votes, b: b.votes });
}
