import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { pageHtml } from './senate-wikipedia.ts';
import { toGrid, type WikiPoll } from './wikipedia.ts';

// pt.wikipedia's presidential polling page: one table per month. It is often a day ahead of the English page.
const PAGE = 'Pesquisas_de_opini%C3%A3o_para_a_elei%C3%A7%C3%A3o_presidencial_no_Brasil_em_2026';
export const PRESIDENT_PT_URL = `https://pt.wikipedia.org/wiki/${PAGE}`;

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

// pt label (first word) -> a word of the label the English table uses, so both sources share candidate keys
const CANONICAL: [string, string][] = [['Lula', 'Lula'], ['Flávio', 'Bolsonaro'], ['Caiado', 'Caiado'], ['Zema', 'Zema'], ['Renan', 'Santos'], ['Cury', 'Cury']];

const strip = (s: string) => s.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

function endDate(period: string, year: number): string | null {
  const m = strip(period).match(/(\d{1,2})\s+([A-Za-zçÇ]+)\.?\s*$/);
  const month = m && MONTHS[m[2].toLowerCase().slice(0, 3)];
  return m && month ? `${year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** "43,8%" -> 43.8, "<1%" -> 0.5 (below the reported precision), "-" / "—" / text -> null */
function percent(raw: string): number | null {
  const s = strip(raw).replace(/\s| /g, '');
  const below = s.startsWith('<');
  const n = parseFloat(s.replace(/^</, '').replace('%', '').replace(',', '.'));
  if (Number.isNaN(n) || !/^<?\d/.test(s)) return null;
  return below ? n / 2 : n;
}

const integer = (raw: string): number | null => {
  const s = strip(raw).replace(/[\s ]/g, '');
  return /^\d{3,}$/.test(s) ? Number(s) : null;
};

/**
 * First-round 2026 polls from pt.wikipedia, shaped like the English rows (same candidate keys).
 * `keys` are the English table's candidate labels; candidates without a counterpart are summed into `others`.
 * Rows without numbers yet ("Resultado da pesquisa…") and second scenarios of the same poll are skipped.
 */
export async function fetchPresidentPtPolls(keys: string[]): Promise<WikiPoll[]> {
  const canon = new Map<string, string>();
  for (const [ptWord, enWord] of CANONICAL) {
    const key = keys.find((k) => k.includes(enWord));
    if (key) canon.set(ptWord, key);
  }

  const $ = cheerio.load(await pageHtml(PAGE));
  const polls: WikiPoll[] = [];
  const seen = new Set<string>();
  let h2 = '', h3 = '';
  $('.mw-parser-output').children().each((_, el) => {
    const e = $(el);
    if (e.hasClass('mw-heading')) {
      const t = e.find('h2,h3,h4').first();
      if (t.prop('tagName') === 'H2') { h2 = strip(t.text()); h3 = ''; }
      if (t.prop('tagName') === 'H3') h3 = strip(t.text());
      return;
    }
    if (el.type !== 'tag' || el.tagName !== 'table' || !e.hasClass('wikitable') || h2 !== 'Primeiro turno' || h3 !== '2026') return;

    const grid = toGrid($, e as cheerio.Cheerio<Element>);
    const head = grid.findIndex((r) => r.some((c) => !c.th));
    if (head < 2) return;
    const labels = grid[1].map((c) => strip(c.text));
    const candidates = labels.map((label, j) => ({ j, label })).filter((c) => !strip(grid[0][c.j].text) && c.label);
    const othersCol = labels.findIndex((l) => /^Outros/i.test(l));
    const undecidedCol = labels.findIndex((l) => /^Indecisos/i.test(l));

    for (const row of grid.slice(head)) {
      const end = endDate(row[1].text, 2026);
      const sample = integer(row[2].text);
      if (!end || sample === null) continue;
      const pollster = strip(row[0].text);
      const id = `${pollster}|${end}`;
      if (seen.has(id)) continue; // later rows of the same poll are other scenarios

      const values: Record<string, number | null> = Object.fromEntries([...canon.values()].map((k) => [k, null]));
      let others = 0;
      for (const c of candidates) {
        const key = canon.get(c.label.split(' ')[0]);
        const v = percent(row[c.j].text);
        if (key) values[key] = v;
        else others += v ?? 0;
      }
      if (othersCol >= 0) others += percent(row[othersCol].text) ?? 0;
      // a placeholder row has no numbers for the main candidates
      if (Object.values(values).every((v) => v === null)) continue;

      seen.add(id);
      polls.push({
        round: 1,
        pollster,
        period: strip(row[1].text),
        end,
        values,
        others,
        undecided: undecidedCol >= 0 ? percent(row[undecidedCol].text) : null,
        margin: strip(row[3].text),
        sample,
      });
    }
  });
  return polls;
}
