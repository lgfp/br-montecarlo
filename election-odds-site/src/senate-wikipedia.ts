import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { toGrid } from './wikipedia.ts';

const api = (page: string) => `https://pt.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&format=json&formatversion=2&redirects=1`;
const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

/** one row of a pt.wikipedia state poll table (Senate, or governor first round) */
export interface SenatePoll {
  pollster: string;
  period: string;
  /** ISO date of the last fieldwork day */
  end: string;
  sample: number | null;
  scenario: string;
  /** candidate -> % of respondents naming them (null when the poll did not report the candidate) */
  values: Record<string, number | null>;
  parties: Record<string, string>;
  others: number | null;
  undecided: number | null;
}

const text = (s: string) => s.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

// "30 Set", "24 – 26 Set", "30 Ago – 2 Set" -> ISO end date
function parseEndDate(period: string, year: number): string | null {
  const m = period.match(/(\d{1,2})\s+([A-Za-zçÇ]+)\s*$/);
  const month = m && MONTHS[m[2].toLowerCase().slice(0, 3)];
  if (!m || !month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// "43,8%", "1 008", "—", "-" -> number | null
const num = (s: string): number | null => {
  const n = parseFloat(s.replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};

function parseTable($: cheerio.CheerioAPI, table: cheerio.Cheerio<Element>, year: number): SenatePoll[] {
  const grid = toGrid($, table);
  const headerRows = grid.findIndex((row) => row.some((c) => !c.th));
  const cols = grid[0].map((_, j) => ({ j, label: grid[0][j].text, candidate: !grid[0][j].text && !!grid[1][j].text }));
  const col = (re: RegExp) => cols.find((c) => !c.candidate && re.test(c.label))?.j;
  const idx = {
    pollster: col(/Contratante|Pesquisa/i)!,
    period: col(/Datas/i)!,
    sample: col(/Amostra/i)!,
    scenario: col(/Cen/i),
    others: col(/Outros/i),
    undecided: col(/Indecisos/i),
  };
  const candidates = cols.filter((c) => c.candidate).map((c) => {
    const m = grid[1][c.j].text.match(/^(.*?)\s*\(([^)]+)\)$/);
    return { j: c.j, name: m ? m[1] : grid[1][c.j].text, party: m ? m[2] : '' };
  });

  return grid.slice(headerRows).flatMap((row): SenatePoll[] => {
    const period = text(row[idx.period].text);
    const end = parseEndDate(period, year);
    if (!end || num(row[idx.sample].text) === null) return [];
    return [{
      pollster: text(row[idx.pollster].text),
      period,
      end,
      sample: num(row[idx.sample].text),
      scenario: idx.scenario === undefined ? '1' : text(row[idx.scenario].text),
      values: Object.fromEntries(candidates.map((c) => [c.name, num(text(row[c.j].text))])),
      parties: Object.fromEntries(candidates.map((c) => [c.name, c.party])),
      others: idx.others === undefined ? null : num(text(row[idx.others].text)),
      undecided: idx.undecided === undefined ? null : num(text(row[idx.undecided].text)),
    }];
  });
}

type Race = 'senate' | 'governor';

/**
 * Campaign-period ("Agosto - Outubro") first-round governor table, or Senate table, of a state page such as
 * "Pesquisas eleitorais para a eleição estadual de 2026 em Santa Catarina" (already URL-encoded in `page`).
 */
const pages = new Map<string, Promise<string>>();
const pageHtml = (page: string) => {
  let html = pages.get(page);
  if (!html) {
    html = (async () => {
      const res = await fetch(api(page), { headers: { 'User-Agent': 'br-montecarlo/1.0 (https://github.com/lgfp/br-montecarlo)' } });
      if (!res.ok) throw new Error(`Wikipedia (pt) fetch failed: HTTP ${res.status} for ${page}`);
      return ((await res.json()) as { parse: { text: string } }).parse.text;
    })();
    pages.set(page, html);
  }
  return html;
};

export async function fetchStatePolls(page: string, race: Race): Promise<SenatePoll[]> {
  const $ = cheerio.load(await pageHtml(page));
  const wantH2 = race === 'senate' ? /^Senador$/i : /^Primeiro Turno \(Governador\)/i;

  const polls: SenatePoll[] = [];
  let h2 = '', h4 = '';
  $('.mw-parser-output').children().each((_, el) => {
    const e = $(el);
    if (e.hasClass('mw-heading')) {
      const t = e.find('h2,h3,h4').first();
      if (t.prop('tagName') === 'H2') { h2 = text(t.text()); h4 = ''; }
      if (t.prop('tagName') === 'H4') h4 = text(t.text());
    } else if (el.type === 'tag' && el.tagName === 'table' && e.hasClass('wikitable') && wantH2.test(h2) && /^Agosto/i.test(h4)) {
      polls.push(...parseTable($, e as cheerio.Cheerio<Element>, 2026));
    }
  });
  if (!polls.length) throw new Error(`No ${race} polls parsed from pt.wikipedia page ${page} (page layout changed?)`);
  return polls;
}

