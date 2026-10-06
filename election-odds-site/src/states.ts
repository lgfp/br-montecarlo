// State-level pages: where their poll tables live.
// Portraits are optional files named after the candidate: site/img/<page>/<candidate-slug>.webp (.png/.jpg).

export interface State {
  uf: string;
  name: string;
  /** pt.wikipedia page with the state's poll tables (already URL-encoded) */
  wikiPage: string;
}

const wikiPage = (suffix: string) => `Pesquisas_eleitorais_para_a_elei%C3%A7%C3%A3o_estadual_de_2026_${suffix}`;

export const STATES: Record<'RJ', State> = {
  RJ: {
    uf: 'RJ',
    name: 'Rio de Janeiro',
    wikiPage: wikiPage('no_Rio_de_Janeiro'),
  },
};

export const wikiUrl = (s: State) => `https://pt.wikipedia.org/wiki/${s.wikiPage}`;
