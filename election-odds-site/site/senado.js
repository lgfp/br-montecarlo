(() => {
  const ODDS = Site.json('odds');
  const PAGE = ODDS.page;
  const ROOT = document.body.dataset.root || './';
  // outcomes under 1% are not shown
  const MIN = 0.01;

  const TSE = 'https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026';
  const list = (names) => names.join(', ');
  const ex = ODDS.excluded;

  const STRINGS = {
    'pt-BR': {
      pageTitle: `Chances na eleição 2026 · Senado ${PAGE.uf}`,
      eyebrow: (h) => `${PAGE.state} · Senado · ${h.day(ODDS.electionDate)}`,
      title: 'Quem fica com as duas vagas?',
      lede: (h) => `Cada eleitor vota em dois candidatos e os dois mais votados são eleitos: não há segundo turno. Chance de cada candidato ficar entre os dois primeiros, a partir das pesquisas registradas no TSE, com ${h.int(ODDS.simulations)} simulações.`,
      seat: 'Chance de conquistar uma vaga',
      othersTitleAlone: 'Candidatos com chance acima de 1%',
      othersTitle: 'Outros candidatos com chance acima de 1%',
      othersHint: 'Chance de conquistar uma vaga',
      pairsTitle: 'Combinações mais prováveis',
      pairsHint: 'Quem ocupa as duas vagas',
      methodTitle: 'Como funciona',
      method: (h) => `Cada eleitor tem dois votos, e a eleição é decidida pelo total de votos de cada candidato. Por isso usamos apenas pesquisas em que o entrevistado cita dois nomes: elas medem exatamente isso e captam, por exemplo, eleitores que votam nos dois candidatos de um mesmo partido. Cada pesquisa vira a fatia dos votos citados por candidato (o que neutraliza institutos que inflam todos os nomes), a média é ponderada por amostra e data, e a eleição é simulada ${h.int(ODDS.simulations)} vezes: em cada simulação, os dois candidatos com mais votos ganham.`,
      caveat: (h) => `Atenção: o cálculo usa apenas ${ODDS.pollsUsed} pesquisas (${list(ODDS.pollsters)}). Foram descartadas ${ex.firstChoice} pesquisas de voto único e ${ex.partial} incompleta(s), que não mostram o segundo voto dos eleitores${ex.unregistered ? `, além de ${ex.unregistered} sem registro correspondente no TSE` : ''}. Com tão poucas pesquisas, a incerteza real pode ser maior do que a mostrada. Não é uma previsão garantida. Projeto independente, sem vínculo com candidatos, partidos ou institutos de pesquisa. Probabilidades abaixo de 1% não são exibidas e acima de 99% aparecem como “>99%”.`,
      meta: (h) => `Atualizado em ${h.updated(ODDS.generatedAt)} · trabalho de campo de ${h.short(ODDS.oldestPoll)} a ${h.short(ODDS.newestPoll)}`,
      sources: `Fontes: registro de pesquisas do <a href="${TSE}">TSE</a> e tabelas da <a href="${PAGE.wikiUrl}">Wikipédia</a>.`,
      portrait: (name) => `Retrato de ${name}`,
    },
    en: {
      pageTitle: `2026 election odds · ${PAGE.state} Senate`,
      eyebrow: (h) => `${PAGE.state} · Senate · ${h.day(ODDS.electionDate)}`,
      title: 'Who takes the two seats?',
      lede: (h) => `Each voter picks two candidates and the two with the most votes win: there is no runoff. Chance of each candidate finishing in the top two, from polls registered with the TSE, using ${h.int(ODDS.simulations)} simulations.`,
      seat: 'Chance of winning a seat',
      othersTitleAlone: 'Candidates above 1%',
      othersTitle: 'Other candidates above 1%',
      othersHint: 'Chance of winning a seat',
      pairsTitle: 'Most likely combinations',
      pairsHint: 'Who fills the two seats',
      methodTitle: 'How it works',
      method: (h) => `Each voter has two votes, and the race is decided by each candidate’s total votes. So we only use polls where respondents name two candidates: they measure exactly that, and capture, for example, voters who pick both candidates of the same party. Each poll becomes each candidate’s share of the votes named (which cancels pollsters that inflate every name), the average is weighted by sample size and recency, and the election is simulated ${h.int(ODDS.simulations)} times: in each simulation the two candidates with the most votes win.`,
      caveat: (h) => `Note: the calculation uses only ${ODDS.pollsUsed} polls (${list(ODDS.pollsters)}). ${ex.firstChoice} single-vote polls and ${ex.partial} incomplete one(s) were discarded because they do not show voters’ second vote${ex.unregistered ? `, plus ${ex.unregistered} with no matching TSE registration` : ''}. With so few polls, the real uncertainty may be larger than shown. This is not a guaranteed forecast. Independent project, not affiliated with any candidate, party or pollster. Probabilities under 1% are not displayed and above 99% are shown as “>99%”.`,
      meta: (h) => `Updated ${h.updated(ODDS.generatedAt)} · fieldwork ${h.short(ODDS.oldestPoll)} to ${h.short(ODDS.newestPoll)}`,
      sources: `Sources: poll registry from the <a href="${TSE}">TSE</a> and tables from <a href="${PAGE.wikiUrl}">Wikipedia (in Portuguese)</a>.`,
      portrait: (name) => `Portrait of ${name}`,
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
  // a meter row used by both text lists
  const row = (label, p, h) => {
    const li = el('li');
    li.append(el('span', 'names', label), el('span', 'odds', h.pct(p)), meter(p, 'meter accent'));
    return li;
  };

  Site.start(STRINGS, (lang, t, h) => {
    const likely = ODDS.candidates.filter((c) => c.p >= MIN);
    // portrait cards for candidates that have a portrait; everyone else above 1% is listed as text
    const withPortrait = likely.filter((c) => c.image);
    const textOnly = likely.filter((c) => !c.image);

    const grid = document.getElementById('candidates');
    grid.replaceChildren(...withPortrait.map((c) => {
      const card = el('article', 'candidate');
      const fig = el('figure');
      const img = el('img');
      img.src = ROOT + c.image;
      img.alt = t.portrait(c.name);
      img.loading = 'lazy';
      fig.append(img);
      card.append(fig, el('h2', '', c.name), el('p', 'party', c.party), el('p', 'label', t.seat), el('p', 'big', h.pct(c.p)), meter(c.p));
      return card;
    }));
    grid.dataset.count = String(withPortrait.length);
    grid.hidden = withPortrait.length === 0;

    document.getElementById('others-section').hidden = textOnly.length === 0;
    document.getElementById('others-title').textContent = withPortrait.length ? t.othersTitle : t.othersTitleAlone;
    document.getElementById('others').replaceChildren(...textOnly.map((c) => row(c.party ? `${c.name} (${c.party})` : c.name, c.p, h)));

    document.getElementById('pairs').replaceChildren(...ODDS.pairs.filter((x) => x.p >= MIN).map((x) => row(`${x.a} + ${x.b}`, x.p, h)));
  }, ODDS.intention);
})();
