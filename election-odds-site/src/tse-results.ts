import { fetchRetry } from './http.ts';

/**
 * Official first-round results, straight from the TSE's results service (resultados.tse.jus.br), the same JSON the
 * public results app reads. 6257 is the federal election (president), 6259 the state election (governors).
 * The finalists are the candidates the TSE marks "2º turno".
 */
export interface Finalist {
  /** ballot name as the TSE writes it, title-cased ("Douglas Ruas") */
  name: string;
  party: string;
  votes: number;
}

export interface FirstRound {
  /** share of polling stations counted (100 once the count is final) */
  counted: number;
  validVotes: number;
  /** highest vote first */
  finalists: [Finalist, Finalist];
}

interface Candidate { nmu: string; vap: string; st: string; dvt: string }
interface Party { sg: string; cand: Candidate[] }
interface Result {
  s: { pst: string };
  v: { vvc: string };
  carg: { cd: string; agr: { par: Party[] }[] }[];
}

const SMALL = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
const title = (s: string) => s.toLowerCase().split(' ').map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
const num = (s: string) => Number(s.replace(',', '.'));

export async function fetchFirstRound(scope: 'br' | string, office: 'president' | 'governor'): Promise<FirstRound> {
  const [election, cargo] = office === 'president' ? ['6257', '1'] : ['6259', '3'];
  const uf = scope.toLowerCase();
  const url = `https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${uf}/${uf}-c000${cargo}-e00${election}-u.json`;
  const res = await fetchRetry(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; br-montecarlo/1.0)' } });
  if (!res.ok) throw new Error(`TSE results fetch failed: HTTP ${res.status} for ${url}`);
  const data = (await res.json()) as Result;

  const counted = num(data.s.pst);
  if (counted < 100) throw new Error(`TSE count for ${scope} is not final (${counted}% of polling stations)`);
  const race = data.carg.find((c) => c.cd === cargo);
  if (!race) throw new Error(`No ${office} race in the TSE results for ${scope}`);
  const finalists = race.agr
    .flatMap((a) => a.par.flatMap((p) => p.cand.map((c) => ({ c, party: p.sg }))))
    .filter(({ c }) => c.st === '2º turno')
    .map(({ c, party }): Finalist => ({ name: title(c.nmu), party, votes: Number(c.vap) }))
    .sort((a, b) => b.votes - a.votes);
  if (finalists.length !== 2) throw new Error(`${scope} ${office}: expected 2 runoff finalists in the TSE results, found ${finalists.length}`);
  return { counted, validVotes: Number(data.v.vvc), finalists: [finalists[0], finalists[1]] };
}
