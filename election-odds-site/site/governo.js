(() => {
  const ODDS = Site.json('odds');
  const PAGE = ODDS.page;
  const ROOT = document.body.dataset.root || './';
  const [A, B] = ODDS.leaders;
  // outcomes under 1% are not shown
  const MIN = 0.01;

  const TSE = 'https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026';

  const STRINGS = {
    'pt-BR': {
      pageTitle: `Chances na eleição 2026 · Governo ${PAGE.uf}`,
      eyebrow: (h) => `${PAGE.state} · Governo · 1º turno: ${h.day(ODDS.electionDate)}`,
      title: (h) => `Quais são as chances ${PAGE.place['pt-BR']}?`,
      lede: (h) => `Probabilidades estimadas a partir da média das últimas pesquisas registradas no TSE, com ${h.int(ODDS.simulations)} simulações da eleição.`,
      firstRound: 'Vence no 1º turno',
      firstRoundHint: 'Mais de 50% dos votos válidos',
      runoff: 'Segundo turno entre os dois',
      runoffHint: `${A.name} × ${B.name}`,
      othersTitle: 'Outros segundos turnos possíveis',
      othersHint: 'Chance de cada confronto',
      methodTitle: 'Como funciona',
      method: (h) => `Cada pesquisa é convertida em votos válidos (brancos, nulos e indecisos são redistribuídos proporcionalmente). A média é ponderada pelo tamanho da amostra e pela data. Em seguida, a eleição é simulada ${h.int(ODDS.simulations)} vezes, com a margem de erro das pesquisas, aplicando a regra brasileira: quem passar de 50% dos votos válidos vence no 1º turno; caso contrário, os dois mais votados disputam o 2º turno.`,
      candidacy: PAGE.note ? PAGE.note['pt-BR'] : '',
      caveat: 'Pesquisas erram, e o modelo não corrige vieses de institutos, abstenção nem diferenças regionais. Pesquisas estaduais costumam errar mais que as nacionais. Não é uma previsão garantida. Projeto independente, sem vínculo com candidatos, partidos ou institutos de pesquisa. Probabilidades abaixo de 1% aparecem como “<1%” e acima de 99% como “>99%”.',
      meta: (h) => `Atualizado em ${h.updated(ODDS.generatedAt)} · ${ODDS.pollsUsed} pesquisas (trabalho de campo de ${h.short(ODDS.oldestPoll)} a ${h.short(ODDS.newestPoll)})`,
      sources: `Fontes: registro de pesquisas do <a href="${TSE}">TSE</a> e tabelas da <a href="${PAGE.wikiUrl}">Wikipédia</a>.`,
      portrait: (name) => `Retrato em desenho a tinta de ${name}`,
    },
    en: {
      pageTitle: `2026 election odds · ${PAGE.state} Governor`,
      eyebrow: (h) => `${PAGE.state} · Governor · first round: ${h.day(ODDS.electionDate)}`,
      title: (h) => `What are the odds ${PAGE.place.en}?`,
      lede: (h) => `Probabilities estimated from the average of the latest polls registered with the TSE, using ${h.int(ODDS.simulations)} simulated elections.`,
      firstRound: 'Wins in the first round',
      firstRoundHint: 'More than 50% of valid votes',
      runoff: 'Runoff between the two',
      runoffHint: `${A.name} × ${B.name}`,
      othersTitle: 'Other possible runoffs',
      othersHint: 'Chance of each matchup',
      methodTitle: 'How it works',
      method: (h) => `Each poll is converted to valid votes (blank, null and undecided are redistributed proportionally). The average is weighted by sample size and recency. The election is then simulated ${h.int(ODDS.simulations)} times, with polling error, applying the Brazilian rule: whoever passes 50% of valid votes wins in the first round; otherwise the top two go to a runoff.`,
      candidacy: PAGE.note ? PAGE.note.en : '',
      caveat: 'Polls can be wrong, and the model does not correct for pollster bias, abstention or regional differences. State polls tend to miss by more than national ones. This is not a guaranteed forecast. Independent project, not affiliated with any candidate, party or pollster. Probabilities under 1% are shown as “<1%” and above 99% as “>99%”.',
      meta: (h) => `Updated ${h.updated(ODDS.generatedAt)} · ${ODDS.pollsUsed} polls (fieldwork ${h.short(ODDS.oldestPoll)} to ${h.short(ODDS.newestPoll)})`,
      sources: `Sources: poll registry from the <a href="${TSE}">TSE</a> and tables from <a href="${PAGE.wikiUrl}">Wikipedia (in Portuguese)</a>.`,
      portrait: (name) => `Ink drawing portrait of ${name}`,
    },
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const meter = (p, className = 'meter') => {
    const m = el('div', className);
    const fill = el('span');
    fill.style.setProperty('--p', p);
    m.append(fill);
    return m;
  };

  Site.start(STRINGS, (lang, t, h) => {
    // the note about a candidacy (e.g. under appeal) exists for some states only
    const note = document.querySelector('[data-i18n="candidacy"]');
    note.hidden = !t.candidacy;

    const card = (l) => {
      const a = el('article', 'candidate');
      if (l.image) {
        const fig = el('figure');
        const img = el('img');
        img.src = ROOT + l.image;
        img.alt = t.portrait(l.name);
        img.loading = 'lazy';
        fig.append(img);
        a.append(fig);
      }
      a.append(el('h2', '', l.name), el('p', 'party', l.party), el('p', 'label', t.firstRound), el('p', 'big', h.pct(l.p)), meter(l.p), el('p', 'hint', t.firstRoundHint));
      return a;
    };
    const runoff = el('article', 'runoff');
    const vs = el('p', 'vs', '×');
    vs.setAttribute('aria-hidden', 'true');
    runoff.append(vs, el('p', 'label', t.runoff), el('p', 'big accent', h.pct(ODDS.runoffLeaders)), meter(ODDS.runoffLeaders, 'meter accent'), el('p', 'hint', t.runoffHint));
    document.getElementById('stage').replaceChildren(card(A), runoff, card(B));

    // any other runoff above 1% is listed as text (hidden when there is none)
    const others = ODDS.otherRunoffs.filter((x) => x.p >= MIN);
    document.getElementById('others-section').hidden = others.length === 0;
    document.getElementById('others').replaceChildren(...others.map((x) => {
      const li = el('li');
      li.append(el('span', 'names', `${x.a} × ${x.b}`), el('span', 'odds', h.pct(x.p)), meter(x.p, 'meter accent'));
      return li;
    }));
  });
})();
