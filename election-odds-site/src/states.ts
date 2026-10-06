// States whose governor race goes to a runoff on 25 October 2026 (the TSE results confirm it at build time).
// Portraits are optional files named after the candidate: site/img/governo-<uf>/<candidate-slug>.webp (.png/.jpg).

export interface State {
  uf: string;
  name: string;
  /** pt.wikipedia page with the state's poll tables (already URL-encoded) */
  wikiPage: string;
}

const state = (uf: string, name: string, wikiPage: string): State => ({ uf, name, wikiPage });
const poll = (suffix: string) => `Pesquisas_eleitorais_para_a_elei%C3%A7%C3%A3o_estadual_de_2026_${suffix}`;

// alphabetical by UF: this is also the tab order
export const STATES: Record<'AC' | 'AM' | 'DF' | 'ES' | 'RJ' | 'RN' | 'TO', State> = {
  AC: state('AC', 'Acre', poll('no_Acre')),
  AM: state('AM', 'Amazonas', poll('no_Amazonas')),
  DF: state('DF', 'Distrito Federal', 'Pesquisas_eleitorais_para_a_elei%C3%A7%C3%A3o_distrital_de_2026_no_Distrito_Federal'),
  ES: state('ES', 'Espírito Santo', poll('no_Esp%C3%ADrito_Santo')),
  RJ: state('RJ', 'Rio de Janeiro', poll('no_Rio_de_Janeiro')),
  RN: state('RN', 'Rio Grande do Norte', poll('no_Rio_Grande_do_Norte')),
  TO: state('TO', 'Tocantins', poll('no_Tocantins')),
};

export const wikiUrl = (s: State) => `https://pt.wikipedia.org/wiki/${s.wikiPage}`;
