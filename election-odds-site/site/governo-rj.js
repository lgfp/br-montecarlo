(() => {
  const ODDS = Site.json('odds');
  const odds = { paes: ODDS.firstRoundWin.paes, ruas: ODDS.firstRoundWin.ruas, runoff: ODDS.runoffPaesRuas };
  // outcomes under 1% are not shown
  const MIN = 0.01;

  const WIKI = 'https://pt.wikipedia.org/wiki/Pesquisas_eleitorais_para_a_elei%C3%A7%C3%A3o_estadual_de_2026_no_Rio_de_Janeiro';
  const TSE = 'https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026';

  const STRINGS = {
    'pt-BR': {
      pageTitle: 'Chances na eleição 2026 · Governo RJ',
      eyebrow: (h) => `Rio de Janeiro · Governo · 1º turno: ${h.day(ODDS.electionDate)}`,
      title: 'Quais são as chances no Rio?',
      lede: (h) => `Probabilidades estimadas a partir da média das últimas pesquisas registradas no TSE, com ${h.int(ODDS.simulations)} simulações da eleição.`,
      firstRound: 'Vence no 1º turno',
      firstRoundHint: 'Mais de 50% dos votos válidos',
      runoff: 'Segundo turno entre os dois',
      runoffHint: 'Eduardo Paes × Douglas Ruas',
      othersTitle: 'Outros segundos turnos possíveis',
      othersHint: 'Chance de cada confronto',
      methodTitle: 'Como funciona',
      method: (h) => `Cada pesquisa é convertida em votos válidos (brancos, nulos e indecisos são redistribuídos proporcionalmente). A média é ponderada pelo tamanho da amostra e pela data. Em seguida, a eleição é simulada ${h.int(ODDS.simulations)} vezes, com a margem de erro das pesquisas, aplicando a regra brasileira: quem passar de 50% dos votos válidos vence no 1º turno; caso contrário, os dois mais votados disputam o 2º turno.`,
      candidacy: 'Anthony Garotinho (Republicanos) teve o registro indeferido pelo TRE-RJ e recorre ao TSE; segundo reportagens de 1º de outubro, a campanha dele foi liberada provisoriamente até a decisão final. Este cálculo o trata como candidato válido, usando o cenário das pesquisas em que ele aparece. Se o registro for negado em definitivo, os votos dados a ele podem ser anulados e o quadro muda.',
      caveat: 'Pesquisas erram, e o modelo não corrige vieses de institutos, abstenção nem diferenças regionais. Pesquisas estaduais costumam errar mais que as nacionais. Não é uma previsão garantida. Projeto independente, sem vínculo com candidatos, partidos ou institutos de pesquisa. Probabilidades abaixo de 1% não são exibidas.',
      meta: (h) => `Atualizado em ${h.updated(ODDS.generatedAt)} · ${ODDS.pollsUsed} pesquisas (trabalho de campo de ${h.short(ODDS.oldestPoll)} a ${h.short(ODDS.newestPoll)})`,
      sources: `Fontes: registro de pesquisas do <a href="${TSE}">TSE</a> e tabelas da <a href="${WIKI}">Wikipédia</a>.`,
      alt: { paes: 'Retrato em desenho a tinta de Eduardo Paes', ruas: 'Retrato em desenho a tinta de Douglas Ruas' },
    },
    en: {
      pageTitle: '2026 election odds · Rio de Janeiro Governor',
      eyebrow: (h) => `Rio de Janeiro · Governor · first round: ${h.day(ODDS.electionDate)}`,
      title: 'What are the odds in Rio?',
      lede: (h) => `Probabilities estimated from the average of the latest polls registered with the TSE, using ${h.int(ODDS.simulations)} simulated elections.`,
      firstRound: 'Wins in the first round',
      firstRoundHint: 'More than 50% of valid votes',
      runoff: 'Runoff between the two',
      runoffHint: 'Eduardo Paes × Douglas Ruas',
      othersTitle: 'Other possible runoffs',
      othersHint: 'Chance of each matchup',
      methodTitle: 'How it works',
      method: (h) => `Each poll is converted to valid votes (blank, null and undecided are redistributed proportionally). The average is weighted by sample size and recency. The election is then simulated ${h.int(ODDS.simulations)} times, with polling error, applying the Brazilian rule: whoever passes 50% of valid votes wins in the first round; otherwise the top two go to a runoff.`,
      candidacy: 'Anthony Garotinho (Republicanos) had his registration rejected by the regional electoral court (TRE-RJ) and is appealing to the TSE; according to reports on October 1, his campaign was provisionally cleared until the final decision. This calculation treats him as a valid candidate, using the poll scenario in which he appears. If his registration is definitively denied, the votes cast for him may be annulled and the picture changes.',
      caveat: 'Polls can be wrong, and the model does not correct for pollster bias, abstention or regional differences. State polls tend to miss by more than national ones. This is not a guaranteed forecast. Independent project, not affiliated with any candidate, party or pollster. Probabilities under 1% are not displayed.',
      meta: (h) => `Updated ${h.updated(ODDS.generatedAt)} · ${ODDS.pollsUsed} polls (fieldwork ${h.short(ODDS.oldestPoll)} to ${h.short(ODDS.newestPoll)})`,
      sources: `Sources: poll registry from the <a href="${TSE}">TSE</a> and tables from <a href="${WIKI}">Wikipedia (in Portuguese)</a>.`,
      alt: { paes: 'Ink drawing portrait of Eduardo Paes', ruas: 'Ink drawing portrait of Douglas Ruas' },
    },
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  Site.start(STRINGS, (lang, t, h) => {
    document.querySelector('#paes img').alt = t.alt.paes;
    document.querySelector('#ruas img').alt = t.alt.ruas;
    for (const [key, p] of Object.entries(odds)) {
      document.querySelector(`[data-odds="${key}"]`).textContent = h.pct(p);
      document.querySelector(`[data-meter="${key}"]`).style.setProperty('--p', p);
    }

    // any other runoff above 1% is listed as text (hidden when there is none)
    const others = ODDS.otherRunoffs.filter((x) => x.p >= MIN);
    document.getElementById('others-section').hidden = others.length === 0;
    document.getElementById('others').replaceChildren(...others.map((x) => {
      const li = el('li');
      li.append(el('span', 'names', `${x.a} × ${x.b}`), el('span', 'odds', h.pct(x.p)));
      const meter = el('div', 'meter accent');
      const fill = el('span');
      fill.style.setProperty('--p', x.p);
      meter.append(fill);
      li.append(meter);
      return li;
    }));
  });
})();
