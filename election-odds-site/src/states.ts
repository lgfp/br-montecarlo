// State-level pages: where their poll tables live and the state-specific text.
// Portraits are optional files named after the candidate: site/img/<page>/<candidate-slug>.webp (.png/.jpg).

export interface State {
  uf: string;
  name: string;
  /** "in Santa Catarina" / "no Rio" style place name, for titles */
  place: { 'pt-BR': string; en: string };
  /** pt.wikipedia page with the state's poll tables (already URL-encoded) */
  wikiPage: string;
  /** extra paragraph for the page (e.g. a candidacy under appeal), per language */
  note?: { 'pt-BR': string; en: string };
}

const wikiPage = (suffix: string) => `Pesquisas_eleitorais_para_a_elei%C3%A7%C3%A3o_estadual_de_2026_${suffix}`;

export const STATES: Record<'SC' | 'RJ' | 'SP', State> = {
  SC: {
    uf: 'SC',
    name: 'Santa Catarina',
    place: { 'pt-BR': 'em Santa Catarina', en: 'in Santa Catarina' },
    wikiPage: wikiPage('em_Santa_Catarina'),
  },
  SP: {
    uf: 'SP',
    name: 'São Paulo',
    place: { 'pt-BR': 'em São Paulo', en: 'in São Paulo' },
    wikiPage: wikiPage('em_S%C3%A3o_Paulo'),
  },
  RJ: {
    uf: 'RJ',
    name: 'Rio de Janeiro',
    place: { 'pt-BR': 'no Rio', en: 'in Rio' },
    wikiPage: wikiPage('no_Rio_de_Janeiro'),
    note: {
      'pt-BR': 'Anthony Garotinho (Republicanos) teve o registro indeferido pelo TRE-RJ e recorre ao TSE; segundo reportagens de 1º de outubro, a campanha dele foi liberada provisoriamente até a decisão final. Este cálculo o trata como candidato válido, usando o cenário das pesquisas em que ele aparece. Se o registro for negado em definitivo, os votos dados a ele podem ser anulados e o quadro muda.',
      en: 'Anthony Garotinho (Republicanos) had his registration rejected by the regional electoral court (TRE-RJ) and is appealing to the TSE; according to reports on October 1, his campaign was provisionally cleared until the final decision. This calculation treats him as a valid candidate, using the poll scenario in which he appears. If his registration is definitively denied, the votes cast for him may be annulled and the picture changes.',
    },
  },
};

export const wikiUrl = (s: State) => `https://pt.wikipedia.org/wiki/${s.wikiPage}`;
