import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { TsePoll } from './tse.ts';

const API = 'https://en.wikipedia.org/w/api.php?action=parse&page=Opinion_polling_for_the_2026_Brazilian_presidential_election&prop=text&format=json&formatversion=2';
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export interface WikiPoll {
  round: 1 | 2;
  pollster: string;
  period: string;
  /** ISO date of the last fieldwork day */
  end: string;
  /** candidate label -> percentage (null when not part of the scenario) */
  values: Record<string, number | null>;
  others: number | null;
  undecided: number | null;
  margin: string;
  sample: number | null;
}

interface Cell { text: string; th: boolean }
interface Column { j: number; label: string; candidate: boolean }

const clean = (s: string) => s.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

// Expands rowspan/colspan into a rectangular grid of cells
function toGrid($: cheerio.CheerioAPI, table: cheerio.Cheerio<Element>): Cell[][] {
  const grid: Cell[][] = [];
  table.find('tr').each((r, tr) => {
    grid[r] ??= [];
    let c = 0;
    $(tr).children('th,td').each((_, cell) => {
      while (grid[r][c]) c++;
      const rs = Number($(cell).attr('rowspan') || 1);
      const cs = Number($(cell).attr('colspan') || 1);
      $(cell).find('br').replaceWith(' ');
      const value: Cell = { text: clean($(cell).text()), th: cell.tagName === 'th' };
      for (let i = 0; i < rs; i++) {
        grid[r + i] ??= [];
        for (let j = 0; j < cs; j++) grid[r + i][c + j] = value;
      }
      c += cs;
    });
  });
  return grid;
}

// "28–30 Sep", "29 Sep–1 Oct", "1 Oct" -> ISO end date
function parseEndDate(period: string, year: number): string | null {
  const m = period.match(/(\d{1,2})\s+([A-Za-z]+)\s*$/);
  const month = m && MONTHS[m[2].toLowerCase()];
  if (!m || !month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const number = (s: string): number | null => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isNaN(n) || /N\/a/.test(s) ? null : n;
};

function parseTable($: cheerio.CheerioAPI, table: cheerio.Cheerio<Element>, round: 1 | 2, year: number): WikiPoll[] {
  const grid = toGrid($, table);
  const headerRows = grid.findIndex((row) => row.some((c) => !c.th));
  const label = (j: number) => grid[0][j].text || grid[1][j].text;
  const cols: Column[] = grid[0].map((_, j) => ({ j, label: label(j), candidate: !grid[0][j].text && !!grid[1][j].text }));
  const col = (re: RegExp) => cols.find((c) => !c.candidate && re.test(c.label))?.j;
  const idx = { pollster: col(/Pollster/)!, period: col(/period/i)!, blank: col(/Blank/)!, margin: col(/Margin/)!, sample: col(/Sample/)!, others: col(/Others/) };

  return grid.slice(headerRows).flatMap((row): WikiPoll[] => {
    const period = row[idx.period].text;
    const end = parseEndDate(period, year);
    if (!end) return [];
    return [{
      round,
      pollster: row[idx.pollster].text,
      period,
      end,
      values: Object.fromEntries(cols.filter((c) => c.candidate).map((c) => [c.label, number(row[c.j].text)])),
      others: idx.others === undefined ? null : number(row[idx.others].text),
      undecided: number(row[idx.blank].text),
      margin: row[idx.margin].text,
      sample: number(row[idx.sample].text),
    }];
  });
}

export async function fetchWikipediaPolls(): Promise<WikiPoll[]> {
  const res = await fetch(API, { headers: { 'User-Agent': 'tse-results-cli/1.0 (poc)' } });
  if (!res.ok) throw new Error(`Wikipedia fetch failed: HTTP ${res.status}`);
  const { parse } = (await res.json()) as { parse: { text: string } };
  const $ = cheerio.load(parse.text);

  const polls: WikiPoll[] = [];
  let h2 = '', h3 = '';
  $('.mw-parser-output').children().each((_, el) => {
    const e = $(el);
    if (e.hasClass('mw-heading')) {
      const t = e.find('h2,h3,h4').first();
      if (t.prop('tagName') === 'H2') h2 = t.text();
      if (t.prop('tagName') === 'H3') h3 = t.text();
    } else if (el.type === 'tag' && el.tagName === 'table' && e.hasClass('wikitable') && h3 === '2026') {
      polls.push(...parseTable($, e as cheerio.Cheerio<Element>, h2.startsWith('First') ? 1 : 2, 2026));
    }
  });
  return polls;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
const tokens = (s: string) => norm(s).split(/\s+/).filter(Boolean);

function sameDay(a: string, b: string, toleranceDays: number): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= toleranceDays * 86_400_000;
}

// Wikipedia has no TSE registration number, so match on pollster + fieldwork end date
export function matchesPoll(tsePoll: TsePoll, wikiPoll: WikiPoll): boolean {
  const wiki = tokens(wikiPoll.pollster);
  const nameOk = tsePoll.names.some((n) => {
    const t = tokens(n);
    return wiki.every((w) => t.some((x) => x.startsWith(w)));
  });
  return nameOk && sameDay(tsePoll.fim, wikiPoll.end, 1);
}
