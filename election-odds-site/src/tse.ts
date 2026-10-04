import { mkdir, readFile, writeFile } from 'node:fs/promises';
import unzipper from 'unzipper';
import { fetchRetry } from './http.ts';

const ZIP_URL = process.env.TSE_ZIP_URL ?? 'https://cdn.tse.jus.br/estatistica/sead/odsele/pesquisa_eleitoral/pesquisa_eleitoral_2026.zip';
// last good copy: CI restores this folder from its cache, so a failed download can fall back to it
const CACHE_DIR = '.cache';
const CACHE_FILE = `${CACHE_DIR}/tse-pesquisa-eleitoral-2026.zip`;

export interface TsePoll {
  registro: string;
  /** names used to match against Wikipedia's short pollster names */
  names: string[];
  instituto: string;
  uf: string;
  inicio: string;
  fim: string;
  divulgacao: string;
  amostra: number;
}

// ';'-delimited, quoted fields that may contain newlines and "" escapes
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const day = (s: string) => s.slice(0, 10);

let zip: Promise<unzipper.CentralDirectory> | undefined;

async function downloadZip(): Promise<Buffer> {
  try {
    const res = await fetchRetry(ZIP_URL);
    if (!res.ok) throw new Error(`TSE download failed: HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, data);
    return data;
  } catch (err) {
    // the registry only gains new polls over time, so yesterday's copy is much better than no site update
    const cached = await readFile(CACHE_FILE).catch(() => null);
    if (!cached) throw err;
    console.warn(`TSE download failed (${err instanceof Error ? err.message : err}); using the cached copy of the registry`);
    return cached;
  }
}

const openZip = () => (zip ??= downloadZip().then((data) => unzipper.Open.buffer(data)));

/** scope: 'BRASIL' for national registrations, or a state code such as 'SC' */
export async function fetchPolls({ scope, cargo, pollster = '' }: { scope: string; cargo: RegExp; pollster?: string }): Promise<TsePoll[]> {
  const dir = await openZip();
  const entry = dir.files.find((f) => f.path.endsWith(`_${scope}.csv`));
  if (!entry) throw new Error(`TSE zip has no *_${scope}.csv entry`);
  const [header, ...data] = parseCsv((await entry.buffer()).toString('latin1'));

  return data
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])) as Record<string, string>)
    .filter((p) => cargo.test(p.DS_CARGO))
    .filter((p) => p.NM_EMPRESA.toLowerCase().includes(pollster.toLowerCase()))
    .sort((a, b) => b.DT_DIVULGACAO.localeCompare(a.DT_DIVULGACAO))
    .map((p) => ({
      registro: p.NR_PROTOCOLO_REGISTRO,
      names: [p.NM_EMPRESA, p.NM_EMPRESA_FANTASIA].filter((n) => !n.startsWith('#NULO')),
      instituto: p.NM_EMPRESA_FANTASIA.startsWith('#NULO') ? p.NM_EMPRESA : p.NM_EMPRESA_FANTASIA,
      uf: p.SG_UF,
      inicio: day(p.DT_INICIO_PESQUISA),
      fim: day(p.DT_FIM_PESQUISA),
      divulgacao: day(p.DT_DIVULGACAO),
      amostra: Number(p.QT_ENTREVISTADO),
    }));
}

export const fetchPresidentialPolls = (opts: { pollster?: string } = {}) =>
  fetchPolls({ scope: 'BRASIL', cargo: /presidente/i, ...opts });
