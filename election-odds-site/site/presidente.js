(() => {
  const ODDS = Site.json('odds');
  const odds = { flavio: ODDS.firstRoundWin.flavio, lula: ODDS.firstRoundWin.lula, runoff: ODDS.runoffLulaFlavio };

  const TSE = 'https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026';
  const WIKI_EN = 'https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Brazilian_presidential_election';
  const WIKI_PT = 'https://pt.wikipedia.org/wiki/Pesquisas_de_opini%C3%A3o_para_a_elei%C3%A7%C3%A3o_presidencial_no_Brasil_em_2026';

  const STRINGS = {
    'pt-BR': {
      pageTitle: 'Chances na eleição 2026 · Presidente',
      eyebrow: (h) => `Eleição presidencial · 1º turno: ${h.day(ODDS.electionDate)}`,
      title: 'Quais são as chances?',
      lede: (h) => `Probabilidades estimadas a partir da média das últimas pesquisas registradas no TSE, com ${h.int(ODDS.simulations)} simulações da eleição.`,
      firstRound: 'Vence no 1º turno',
      firstRoundHint: 'Mais de 50% dos votos válidos',
      runoff: 'Segundo turno entre os dois',
      runoffHint: 'Lula × Flávio Bolsonaro',
      methodTitle: 'Como funciona',
      method: (h) => `Cada pesquisa é convertida em votos válidos (brancos, nulos e indecisos são redistribuídos proporcionalmente). A média é ponderada pelo tamanho da amostra e pela data. Em seguida, a eleição é simulada ${h.int(ODDS.simulations)} vezes, com a margem de erro das pesquisas, aplicando a regra brasileira: quem passar de 50% dos votos válidos vence no 1º turno; caso contrário, os dois mais votados disputam o 2º turno.`,
      caveat: 'Pesquisas erram, e o modelo não corrige vieses de institutos, abstenção nem diferenças regionais. Não é uma previsão garantida. Projeto independente, sem vínculo com candidatos, partidos ou institutos de pesquisa. Probabilidades abaixo de 1% aparecem como “<1%”.',
      meta: (h) => `Atualizado em ${h.updated(ODDS.generatedAt)} · ${ODDS.pollsUsed} pesquisas (trabalho de campo de ${h.short(ODDS.oldestPoll)} a ${h.short(ODDS.newestPoll)})`,
      sources: `Fontes: registro de pesquisas do <a href="${TSE}">TSE</a> e tabelas de resultados da Wikipédia (<a href="${WIKI_EN}">em inglês</a> e <a href="${WIKI_PT}">em português</a>).`,
      alt: { flavio: 'Retrato em desenho a tinta de Flávio Bolsonaro', lula: 'Retrato em desenho a tinta de Lula' },
    },
    en: {
      pageTitle: '2026 election odds · President',
      eyebrow: (h) => `Presidential election · first round: ${h.day(ODDS.electionDate)}`,
      title: 'What are the odds?',
      lede: (h) => `Probabilities estimated from the average of the latest polls registered with the TSE, using ${h.int(ODDS.simulations)} simulated elections.`,
      firstRound: 'Wins in the first round',
      firstRoundHint: 'More than 50% of valid votes',
      runoff: 'Runoff between the two',
      runoffHint: 'Lula × Flávio Bolsonaro',
      methodTitle: 'How it works',
      method: (h) => `Each poll is converted to valid votes (blank, null and undecided are redistributed proportionally). The average is weighted by sample size and recency. The election is then simulated ${h.int(ODDS.simulations)} times, with polling error, applying the Brazilian rule: whoever passes 50% of valid votes wins in the first round; otherwise the top two go to a runoff.`,
      caveat: 'Polls can be wrong, and the model does not correct for pollster bias, abstention or regional differences. This is not a guaranteed forecast. Independent project, not affiliated with any candidate, party or pollster. Probabilities under 1% are shown as “<1%”.',
      meta: (h) => `Updated ${h.updated(ODDS.generatedAt)} · ${ODDS.pollsUsed} polls (fieldwork ${h.short(ODDS.oldestPoll)} to ${h.short(ODDS.newestPoll)})`,
      sources: `Sources: poll registry from the <a href="${TSE}">TSE</a> and results tables from Wikipedia (<a href="${WIKI_EN}">English</a> and <a href="${WIKI_PT}">Portuguese</a>).`,
      alt: { flavio: 'Ink drawing portrait of Flávio Bolsonaro', lula: 'Ink drawing portrait of Lula' },
    },
  };

  Site.start(STRINGS, (lang, t, h) => {
    document.querySelector('#flavio img').alt = t.alt.flavio;
    document.querySelector('#lula img').alt = t.alt.lula;
    for (const [key, p] of Object.entries(odds)) {
      document.querySelector(`[data-odds="${key}"]`).textContent = h.pct(p);
      document.querySelector(`[data-meter="${key}"]`).style.setProperty('--p', p);
    }
  }, ODDS.intention);
})();
