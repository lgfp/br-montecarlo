import unzipper from 'unzipper';

const ZIP_URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/pesquisa_eleitoral/pesquisa_eleitoral_2026.zip';

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

export async function fetchPresidentialPolls({ pollster = '' } = {}): Promise<TsePoll[]> {
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`TSE download failed: HTTP ${res.status}`);
  const dir = await unzipper.Open.buffer(Buffer.from(await res.arrayBuffer()));
  const entry = dir.files.find((f) => f.path.endsWith('_BRASIL.csv'));
  if (!entry) throw new Error('TSE zip has no *_BRASIL.csv entry');
  const [header, ...data] = parseCsv((await entry.buffer()).toString('latin1'));

  return data
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])) as Record<string, string>)
    .filter((p) => /presidente/i.test(p.DS_CARGO))
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
