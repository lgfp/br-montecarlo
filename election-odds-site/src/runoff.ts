import { fetchPresidentialPolls, fetchPolls } from './tse.ts';
import { fetchWikipediaPolls, matchesPoll } from './wikipedia.ts';
import { fetchStatePolls } from './senate-wikipedia.ts';
import { HALF_LIFE_DAYS } from './forecast.ts';
import { fetchFirstRound, type FirstRound } from './tse-results.ts';
import type { State } from './states.ts';

/**
 * Second-round odds for a two-candidate runoff, from one weighted average of "polls":
 *
 *  - the runoff polls taken in the two weeks before the first round, plus any taken after it, each as the first finalist's
 *    share of the two finalists' support (undecided dropped), adjusted for institute bias (see below);
 *  - the first-round RESULT, treated as one more poll: dated election day, with the votes of the two finalists combined as its sample
 *    (millions of voters) and each finalist's valid-vote share with the eliminated candidates' voters split evenly.
 *
 * Every entry weighs log(sample size) x 0.5^(age / HALF_LIFE_DAYS). The result's log weight is only about twice a typical poll's,
 * so it does not drown a pile of recent polls, and it fades with the same half-life until real runoff polls overtake it.
 * The finalists' share of the runoff vote is then taken as normally distributed around that average, with a spread
 * (sdPoints) for what the average does not know: where the eliminated candidates' voters go (more uncertainty the more
 * voters were eliminated), and who turns out.
 *
 * Only RUNOFF polls count (tables of the two finalists head to head), never first-round "big field" polls.
 * If a state has too few runoff polls to rely on (fewer than MIN_POLLS polls or MIN_POLLSTERS institutes in the window),
 * the polls are ignored, so the first-round result is the whole average; the page says so.
 */

export const RUNOFF_DATE = '2026-10-25';
const FIRST_ROUND = '2026-10-04';

/**
 * 1 standard deviation of the finalists' two-way share, in points. Two independent parts:
 *  - where the eliminated candidates' voters go: they hold `eliminated` % of the valid vote and we are unsure of the
 *    split by about 20 points (ELIMINATED_SPLIT_SD), so this part is 0.20 x eliminated (1.6 for the president, 5.4 in Rio Grande do Norte);
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
  /** 'result' is the first-round result, entered as a poll whose sample is the two finalists' votes combined */
  kind: 'poll' | 'result';
  pollster: string;
  end: string;
  sample: number;
  /** A's raw two-way share (%), A's share after the adjustment, the adjustment moved from A to B, and the entry's weight */
  raw: number;
  adjusted: number;
  shift: number;
  weight: number;
  preElection: boolean;
}

export interface RunoffOdds {
  generatedAt: string;
  runoffDate: string;
  /** runoff polls found in the window, and whether there were enough of them to use */
  pollsFound: number;
  pollsReliable: boolean;
  sdPoints: number;
  /** each finalist's first-round share of all valid votes, and the share of the runoff vote that implies if the eliminated voters split evenly */
  firstRound: { a: { valid: number; evenSplit: number }; b: { valid: number; evenSplit: number } };
  /** the first-round result's share of the total weight today */
  firstRoundWeight: number;
  /** runoff polls used (the first-round result is not counted here) */
  pollsUsed: number;
  effectivePolls: number;
  oldestPoll: string | null;
  newestPoll: string | null;
  /** the runoff polls' own average two-way share, after adjustments (null when no poll qualifies) */
  polls: { a: number; b: number } | null;
  /** the weighted average of the polls and the first-round result: the estimate */
  estimate: { a: number; b: number };
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
  const weightOf = (sample: number, end: string) => Math.log(Math.max(sample, 2)) * 0.5 ** (Math.max(0, days(end, today)) / HALF_LIFE_DAYS);

  const raw = (await spec.load())
    .filter((p) => p.end >= cutoff && p.end <= today && (!spec.allowed || spec.allowed.test(p.pollster)));
  const polls: RunoffPollRow[] = raw.map((p) => {
    const preElection = p.end <= FIRST_ROUND;
    const twoWay = (100 * p.a) / (p.a + p.b);
    const shift = preElection ? spec.adjust(p) : 0;
    return { kind: 'poll' as const, pollster: p.pollster, end: p.end, sample: p.sample, raw: twoWay, adjusted: twoWay - shift, shift, weight: weightOf(p.sample, p.end), preElection };
  }).sort((x, y) => y.end.localeCompare(x.end));

  const found = polls.length;
  const reliable = found >= MIN_POLLS && new Set(polls.map((r) => r.pollster.toLowerCase())).size >= MIN_POLLSTERS;
  if (!reliable) polls.length = 0; // too thin: the first-round result is the whole average

  // The first-round result as a poll. The eliminated candidates' voters are assumed to split evenly between the finalists, so
  // A's share of the two-way vote is 50 + (A's valid-vote share - B's) / 2. (Splitting them in proportion to the finalists'
  // own votes would flatter the front-runner: those voters have already shown they did not pick her.)
  const validA = (100 * votes.a) / validVotes, validB = (100 * votes.b) / validVotes;
  const electA = 50 + (validA - validB) / 2;
  const result: RunoffPollRow = { kind: 'result', pollster: 'Resultado do 1º turno', end: FIRST_ROUND, sample: votes.a + votes.b, raw: electA, adjusted: electA, shift: 0, weight: weightOf(votes.a + votes.b, FIRST_ROUND), preElection: true };

  const all = [...polls, result].sort((x, y) => y.end.localeCompare(x.end) || (x.kind === 'result' ? 1 : -1));
  const wAll = all.reduce((s, r) => s + r.weight, 0);
  const estA = all.reduce((s, r) => s + r.weight * r.adjusted, 0) / wAll;

  const wPolls = polls.reduce((s, r) => s + r.weight, 0);
  const pollA = polls.length ? polls.reduce((s, r) => s + r.weight * r.adjusted, 0) / wPolls : null;

  const eliminated = 100 - (100 * (votes.a + votes.b)) / validVotes;
  const sd = sdPoints(eliminated);
  const pA = phi((estA - 50) / sd);
  const margin = 1.96 * sd / 100;

  return {
    generatedAt: new Date().toISOString(),
    runoffDate: RUNOFF_DATE,
    pollsFound: found,
    pollsReliable: reliable,
    sdPoints: Math.round(sd * 10) / 10,
    firstRound: {
      a: { valid: votes.a / validVotes, evenSplit: electA / 100 },
      b: { valid: votes.b / validVotes, evenSplit: 1 - electA / 100 },
    },
    firstRoundWeight: result.weight / wAll,
    pollsUsed: polls.length,
    effectivePolls: polls.length ? Math.round(((wPolls * wPolls) / polls.reduce((s, r) => s + r.weight ** 2, 0)) * 10) / 10 : 0,
    oldestPoll: polls.length ? polls[polls.length - 1].end : null,
    newestPoll: polls.length ? polls[0].end : null,
    polls: pollA === null ? null : { a: pollA / 100, b: 1 - pollA / 100 },
    estimate: { a: estA / 100, b: 1 - estA / 100 },
    p: { a: pA, b: 1 - pA },
    pollRows: all,
    postElectionPolls: polls.filter((r) => !r.preElection).length,
    intention: {
      basis: 'twoWay',
      rows: [
        { name: spec.a.name, party: spec.a.party, share: estA / 100, margin },
        { name: spec.b.name, party: spec.b.party, share: 1 - estA / 100, margin },
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
    // no bias was measured in the states: the polls enter as published
    adjust: () => 0,
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
