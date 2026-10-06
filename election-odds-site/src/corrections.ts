import type { WikiPoll } from './wikipedia.ts';

/**
 * Hand-checked fixes for rows the Wikipedia tables record incompletely. Each entry names the poll
 * (pollster pattern + last fieldwork day) and what the pollster's own release says.
 *
 * - Veritá, 26 Sep – 2 Oct: published Lula 45%, Flávio 47%, others 8% (already valid votes, sums to 100).
 *   The Wikipedia row lists only the two main candidates, so without this the model read 45 + 47 as
 *   92% of the vote and scaled both up.
 */
const FIXES: { pollster: RegExp; end: string; others: number }[] = [
  { pollster: /verit/i, end: '2026-10-02', others: 8 },
];

export const applyCorrections = <T extends Pick<WikiPoll, 'pollster' | 'end' | 'others'>>(polls: T[]): T[] =>
  polls.map((p) => {
    const fix = FIXES.find((f) => f.pollster.test(p.pollster) && f.end === p.end);
    return fix ? { ...p, others: fix.others } : p;
  });
