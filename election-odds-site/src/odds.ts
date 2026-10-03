import { fetchPresidentialPolls } from './tse.ts';
import { fetchWikipediaPolls, matchesPoll, samePollster, type WikiPoll } from './wikipedia.ts';
import { fetchPresidentPtPolls } from './president-pt.ts';
import { ELECTION_DATE, forecast, type Forecast, type Intention } from './forecast.ts';

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
  /** how many first-round rows each Wikipedia page contributed after removing duplicates */
  sources: { en: number; pt: number };
  intention: Intention;
}

const find = (names: string[], needle: string) => {
  const name = names.find((n) => n.includes(needle));
  if (!name) throw new Error(`Candidate "${needle}" not found in the poll tables (found: ${names.join(', ')})`);
  return name;
};

// Lula's and Flávio's numbers identify a poll's result regardless of column order
const lead = (p: WikiPoll) => Object.entries(p.values).filter(([k]) => /Lula|Bolsonaro/.test(k)).map(([, v]) => v).join('/');

/**
 * English rows first; Portuguese rows are added only for polls the English page does not have yet.
 * Same poll = same pollster and the same last fieldwork day (or a day apart with identical numbers).
 */
function mergePolls(en: WikiPoll[], pt: WikiPoll[]): { merged: WikiPoll[]; added: number } {
  const dayApart = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= 86_400_000;
  const extra = pt.filter((p) => !en.some((e) => samePollster(e.pollster, p.pollster) && (e.end === p.end || (dayApart(e.end, p.end) && lead(e) === lead(p)))));
  return { merged: [...en, ...extra], added: extra.length };
}

export async function computeOdds(): Promise<{ odds: Odds; forecast: Forecast }> {
  const [allPolls, wikiEn] = await Promise.all([fetchPresidentialPolls(), fetchWikipediaPolls()]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // The Portuguese page is a fresher, optional second source: if it fails or changes layout, use English alone.
  const en = wikiEn.filter((w) => w.round === 1);
  const pt = await fetchPresidentPtPolls(Object.keys(en[0]?.values ?? {})).catch((err) => {
    console.warn(`pt.wikipedia presidential page skipped: ${err instanceof Error ? err.message : err}`);
    return [] as WikiPoll[];
  });
  const { merged: wikiPolls, added } = mergePolls(en, pt);

  // the last N distinct Wikipedia first-round rows behind released TSE polls (newest release first)
  const rows = new Set<WikiPoll>();
  for (const p of allPolls.filter((p) => p.divulgacao <= today)) {
    for (const w of wikiPolls) if (matchesPoll(p, w)) rows.add(w);
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
      sources: { en: en.length, pt: added },
      intention: {
        basis: 'valid',
        // labels are "Lula PT", "F. Bolsonaro PL": the last word is the party
        rows: f.shares.map((c) => {
          const m = c.name.match(/^(.*)\s(\S+)$/);
          return { name: m ? m[1] : c.name, party: m ? m[2] : '', share: c.share, margin: c.margin };
        }),
        others: { share: f.othersShare, margin: f.othersMargin },
      },
    },
  };
}
