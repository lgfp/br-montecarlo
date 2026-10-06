import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp, { type OverlayOptions } from 'sharp';

/**
 * Social preview card (1200x630) for a runoff page: both candidates with their portrait (when there is one),
 * party, and the odds of winning the runoff. Same cream paper and ink colors as the site.
 */
export interface Card {
  eyebrow: string;
  title: string;
  /** left candidate first */
  candidates: [Candidate, Candidate];
  site: string;
}
interface Candidate { name: string; party: string; pct: string; image: string | null }

const W = 1200, H = 630;
const PAPER = '#f3eee3', INK = '#15130f', MUTED = '#6b6458', ACCENT = '#b3361f';
const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'DejaVu Serif', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** shrink long names so they fit their half of the card */
const nameSize = (name: string, max: number) => Math.min(max, Math.floor(480 / Math.max(8, name.length) * 1.5));

export async function renderCard(card: Card, siteDir: string): Promise<Buffer> {
  const [a, b] = card.candidates;
  const withPortraits = !!(a.image && b.image);
  const cx = [300, 900];
  const PORTRAIT_H = 290;

  const col = (c: Candidate, x: number) => {
    const nameY = withPortraits ? 478 : 300;
    const pctY = withPortraits ? 588 : 480;
    const pctSize = withPortraits ? 80 : 140;
    return `
      <text x="${x}" y="${nameY}" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${nameSize(c.name, withPortraits ? 36 : 52)}" fill="${INK}">${esc(c.name)}</text>
      <text x="${x}" y="${nameY + 30}" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="20" letter-spacing="2" fill="${MUTED}">${esc(c.party)}</text>
      <text x="${x}" y="${pctY}" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${pctSize}" fill="${INK}">${esc(c.pct)}</text>`;
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${PAPER}"/>
    <rect x="0" y="0" width="${W}" height="10" fill="${INK}"/>
    <text x="60" y="62" font-family="${SANS}" font-weight="700" font-size="22" letter-spacing="3" fill="${ACCENT}">${esc(card.eyebrow.toUpperCase())}</text>
    <text x="60" y="118" font-family="${SERIF}" font-weight="700" font-size="52" fill="${INK}">${esc(card.title)}</text>
    <line x1="60" y1="140" x2="${W - 60}" y2="140" stroke="${INK}" stroke-width="2"/>
    <text x="${W / 2}" y="${withPortraits ? 330 : 420}" text-anchor="middle" font-family="${SERIF}" font-size="64" fill="${MUTED}">×</text>
    ${col(a, cx[0])}${col(b, cx[1])}
    <text x="${W - 60}" y="62" text-anchor="end" font-family="${SANS}" font-size="20" fill="${MUTED}">${esc(card.site)}</text>
  </svg>`;

  const layers: OverlayOptions[] = [];
  if (withPortraits) {
    for (const [c, x] of [[a, cx[0]], [b, cx[1]]] as const) {
      const file = `${siteDir}/${c.image}`;
      if (!existsSync(file)) continue;
      const img = await sharp(await readFile(file)).resize({ height: PORTRAIT_H }).png().toBuffer();
      const { width } = await sharp(img).metadata();
      layers.push({ input: img, left: Math.round(x - (width ?? 0) / 2), top: 152 });
    }
  }
  return sharp(Buffer.from(svg)).composite(layers).png({ compressionLevel: 9 }).toBuffer();
}
