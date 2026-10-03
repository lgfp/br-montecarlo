import * as cheerio from 'cheerio';

const API = 'https://en.wikipedia.org/w/api.php?action=parse&page=Opinion_polling_for_the_2026_Brazilian_presidential_election&prop=text&format=json&formatversion=2';
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

const clean = (s) => s.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

// Expands rowspan/colspan into a rectangular grid of { text, th }
function toGrid($, table) {
  const grid = [];
  table.find('tr').each((r, tr) => {
    grid[r] ??= [];
    let c = 0;
    $(tr).children('th,td').each((_, cell) => {
      while (grid[r][c]) c++;
      const rs = Number($(cell).attr('rowspan') || 1);
      const cs = Number($(cell).attr('colspan') || 1);
      $(cell).find('br').replaceWith(' ');
      const value = { text: clean($(cell).text()), th: cell.tagName === 'th' };
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
function parseEndDate(period, year) {
  const m = period.match(/(\d{1,2})\s+([A-Za-z]+)\s*$/);
  const month = m && MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

const number = (s) => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isNaN(n) || /N\/a/.test(s) ? null : n;
};

function parseTable($, table, round, year) {
  const grid = toGrid($, table);
  const headerRows = grid.findIndex((row) => row.some((c) => !c.th));
  const label = (j) => grid[0][j].text || grid[1][j].text;
  const cols = grid[0].map((_, j) => ({ j, label: label(j), candidate: !grid[0][j].text && !!grid[1][j].text }));
  const col = (re) => cols.find((c) => !c.candidate && re.test(c.label))?.j;
  const idx = { pollster: col(/Pollster/), period: col(/period/i), blank: col(/Blank/), margin: col(/Margin/), sample: col(/Sample/), others: col(/Others/) };

  return grid.slice(headerRows).map((row) => {
    const period = row[idx.period].text;
    const values = Object.fromEntries(cols.filter((c) => c.candidate).map((c) => [c.label, number(row[c.j].text)]));
    return {
      round,
      pollster: row[idx.pollster].text,
      period,
      end: parseEndDate(period, year),
      values,
      others: idx.others === undefined ? null : number(row[idx.others].text),
      undecided: number(row[idx.blank].text),
      margin: row[idx.margin].text,
      sample: number(row[idx.sample].text),
    };
  }).filter((r) => r.end);
}

export async function fetchWikipediaPolls() {
  const res = await fetch(API, { headers: { 'User-Agent': 'tse-results-cli/1.0 (poc)' } });
  if (!res.ok) throw new Error(`Wikipedia fetch failed: HTTP ${res.status}`);
  const $ = cheerio.load((await res.json()).parse.text);

  const polls = [];
  let h2 = '', h3 = '';
  $('.mw-parser-output').children().each((_, el) => {
    const e = $(el);
    if (e.hasClass('mw-heading')) {
      const t = e.find('h2,h3,h4').first();
      if (t.prop('tagName') === 'H2') h2 = t.text();
      if (t.prop('tagName') === 'H3') h3 = t.text();
    } else if (el.tagName === 'table' && e.hasClass('wikitable') && h3 === '2026') {
      polls.push(...parseTable($, e, h2.startsWith('First') ? 1 : 2, 2026));
    }
  });
  return polls;
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
const tokens = (s) => norm(s).split(/\s+/).filter(Boolean);

function sameDay(a, b, tolerance) {
  return Math.abs(new Date(a) - new Date(b)) <= tolerance * 86_400_000;
}

// Wikipedia has no TSE registration number, so match on pollster + fieldwork end date
export function matchesPoll(tsePoll, wikiPoll) {
  const wiki = tokens(wikiPoll.pollster);
  const nameOk = tsePoll.names.some((n) => {
    const t = tokens(n);
    return wiki.every((w) => t.some((x) => x.startsWith(w)));
  });
  return nameOk && sameDay(tsePoll.fim, wikiPoll.end, 1);
}
