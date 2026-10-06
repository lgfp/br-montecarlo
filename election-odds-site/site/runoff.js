(() => {
  const ODDS = Site.json('odds');
  const PAGE = ODDS.page;
  const ROOT = document.body.dataset.root || './';
  const [A, B] = PAGE.candidates;

  const TSE = 'https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026';
  const SOURCES = {
    president: {
      'pt-BR': `<a href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Brazilian_presidential_election">Wikipédia (em inglês)</a> e o resultado oficial do 1º turno, do <a href="https://resultados.tse.jus.br/">TSE</a>`,
      en: `<a href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Brazilian_presidential_election">Wikipedia</a> and the official first-round result from the <a href="https://resultados.tse.jus.br/">TSE</a>`,
    },
    rio: {
      'pt-BR': `<a href="${PAGE.wikiUrl}">Wikipédia</a> e o resultado oficial do 1º turno, do <a href="https://resultados.tse.jus.br/">TSE</a>`,
      en: `<a href="${PAGE.wikiUrl}">Wikipedia (in Portuguese)</a> and the official first-round result from the <a href="https://resultados.tse.jus.br/">TSE</a>`,
    },
  };
  const SRC = PAGE.kind === 'president' ? SOURCES.president : SOURCES.rio;

  const pp = (n, lang) => new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

  const STRINGS = {
    'pt-BR': {
      pageTitle: `Chances no 2º turno · ${PAGE.shortTitle['pt-BR']}`,
      eyebrow: (h) => `${PAGE.office['pt-BR']} · 2º turno: ${h.day(ODDS.runoffDate)}`,
      title: 'Quem vence o 2º turno?',
      lede: (h) => ODDS.polls
        ? `Probabilidade de cada candidato vencer o segundo turno, combinando o resultado do 1º turno (peso ${Math.round(ODDS.electionWeight * 100)}%) com as pesquisas de 2º turno feitas antes da eleição (peso ${Math.round((1 - ODDS.electionWeight) * 100)}%).`
        : 'Probabilidade de cada candidato vencer o segundo turno, a partir do resultado do 1º turno (sem pesquisas de 2º turno confiáveis).',
      winsRunoff: 'Vence o 2º turno',
      hint: 'Mais votos válidos em 25 de outubro',
      methodTitle: 'Como funciona',
      method: (h) => `O primeiro turno acabou: contando só os votos dos dois finalistas, ${A.name} teve ${pp(ODDS.firstRound.a.twoWay * 100, h.lang)}% e ${B.name} ${pp(ODDS.firstRound.b.twoWay * 100, h.lang)}%. ${ODDS.polls ? `As pesquisas de 2º turno anteriores à eleição são convertidas para o mesmo formato (cada candidato como % dos votos dos dois), ajustadas por viés de instituto e promediadas, com peso pelo logaritmo da amostra e por data (meia-vida de 4 dias). A estimativa é ${Math.round(ODDS.electionWeight * 100)}% resultado do 1º turno e ${Math.round((1 - ODDS.electionWeight) * 100)}% pesquisas.` : 'Sem pesquisas de 2º turno confiáveis, a estimativa é só o resultado do 1º turno.'} A incerteza é de ${pp(ODDS.sdPoints, h.lang)} pontos percentuais (um desvio-padrão) para a parcela de cada candidato; cresce com o peso dos eliminados (${pp((1 - ODDS.firstRound.a.valid - ODDS.firstRound.b.valid) * 100, h.lang)}% dos votos válidos aqui), porque não sabemos para onde vão seus votos, e inclui quem comparece.`,
      components: (h) => ODDS.polls
        ? `Resultado do 1º turno (só os dois): ${A.name} ${pp(ODDS.firstRound.a.twoWay * 100, h.lang)}% × ${B.name} ${pp(ODDS.firstRound.b.twoWay * 100, h.lang)}%. Pesquisas de 2º turno (ajustadas): ${A.name} ${pp(ODDS.polls.a * 100, h.lang)}% × ${B.name} ${pp(ODDS.polls.b * 100, h.lang)}%. Mistura: ${A.name} ${pp(ODDS.blend.a * 100, h.lang)}% × ${B.name} ${pp(ODDS.blend.b * 100, h.lang)}%.`
        : '',
      adjustments: PAGE.adjustments['pt-BR'],
      warning: PAGE.warning ? PAGE.warning['pt-BR'] : '',
      caveat: 'Não há ainda pesquisas feitas depois do 1º turno; quando houver, entram no cálculo. Este é um modelo simples, não uma previsão garantida. Projeto independente, sem vínculo com candidatos, partidos ou institutos de pesquisa. Probabilidades abaixo de 1% aparecem como “<1%” e acima de 99% como “>99%”.',
      pollsTitle: 'Pesquisas usadas e ajustes',
      cols: ['Instituto', 'Fim do campo', 'Amostra', `${A.name} bruto`, 'Ajuste', `${A.name} ajustado`],
      tableNote: `Parcela de ${A.name} nos votos dos dois finalistas, em %. Ajuste: pontos que passam de um candidato ao outro.`,
      meta: (h) => `Atualizado em ${h.updated(ODDS.generatedAt)} · ${ODDS.pollsUsed} pesquisas${ODDS.pollsUsed ? ` (trabalho de campo de ${h.short(ODDS.oldestPoll)} a ${h.short(ODDS.newestPoll)})` : ''}`,
      sources: `Fontes: registro de pesquisas do <a href="${TSE}">TSE</a>, tabelas da ${SRC['pt-BR']}.`,
      portrait: (name) => `Retrato em desenho a tinta de ${name}`,
    },
    en: {
      pageTitle: `Runoff odds · ${PAGE.shortTitle.en}`,
      eyebrow: (h) => `${PAGE.office.en} · runoff: ${h.day(ODDS.runoffDate)}`,
      title: 'Who wins the runoff?',
      lede: (h) => ODDS.polls
        ? `Probability of each candidate winning the runoff, combining the first-round result (${Math.round(ODDS.electionWeight * 100)}% weight) with runoff polls taken before the election (${Math.round((1 - ODDS.electionWeight) * 100)}% weight).`
        : 'Probability of each candidate winning the runoff, from the first-round result (no reliable runoff polls).',
      winsRunoff: 'Wins the runoff',
      hint: 'More valid votes on October 25',
      methodTitle: 'How it works',
      method: (h) => `The first round is over: counting only the two finalists’ votes, ${A.name} got ${pp(ODDS.firstRound.a.twoWay * 100, h.lang)}% and ${B.name} ${pp(ODDS.firstRound.b.twoWay * 100, h.lang)}%. ${ODDS.polls ? `Runoff polls taken before the election are converted to the same format (each candidate as a % of the two finalists’ votes), adjusted for pollster bias and averaged, weighted by the log of the sample size and by recency (4-day half-life). The estimate is ${Math.round(ODDS.electionWeight * 100)}% first-round result and ${Math.round((1 - ODDS.electionWeight) * 100)}% polls.` : 'With no reliable runoff polls, the estimate is the first-round result alone.'} The uncertainty is ${pp(ODDS.sdPoints, h.lang)} percentage points (one standard deviation) on each candidate’s share; it grows with the eliminated candidates’ weight (${pp((1 - ODDS.firstRound.a.valid - ODDS.firstRound.b.valid) * 100, h.lang)}% of the valid vote here), since we do not know where their voters go, and includes turnout.`,
      components: (h) => ODDS.polls
        ? `First-round result (the two only): ${A.name} ${pp(ODDS.firstRound.a.twoWay * 100, h.lang)}% × ${B.name} ${pp(ODDS.firstRound.b.twoWay * 100, h.lang)}%. Runoff polls (adjusted): ${A.name} ${pp(ODDS.polls.a * 100, h.lang)}% × ${B.name} ${pp(ODDS.polls.b * 100, h.lang)}%. Blend: ${A.name} ${pp(ODDS.blend.a * 100, h.lang)}% × ${B.name} ${pp(ODDS.blend.b * 100, h.lang)}%.`
        : '',
      adjustments: PAGE.adjustments.en,
      warning: PAGE.warning ? PAGE.warning.en : '',
      caveat: 'There are no polls from after the first round yet; when there are, they enter the calculation. This is a simple model, not a guaranteed forecast. Independent project, not affiliated with any candidate, party or pollster. Probabilities under 1% are shown as “<1%” and above 99% as “>99%”.',
      pollsTitle: 'Polls used and adjustments',
      cols: ['Pollster', 'Fieldwork end', 'Sample', `${A.name} raw`, 'Adjustment', `${A.name} adjusted`],
      tableNote: `${A.name}’s share of the two finalists’ votes, in %. Adjustment: points moved from one candidate to the other.`,
      meta: (h) => `Updated ${h.updated(ODDS.generatedAt)} · ${ODDS.pollsUsed} polls${ODDS.pollsUsed ? ` (fieldwork ${h.short(ODDS.oldestPoll)} to ${h.short(ODDS.newestPoll)})` : ''}`,
      sources: `Sources: poll registry from the <a href="${TSE}">TSE</a>, tables from ${SRC.en}.`,
      portrait: (name) => `Ink drawing portrait of ${name}`,
    },
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const meter = (p) => {
    const m = el('div', 'meter');
    const fill = el('span');
    fill.style.setProperty('--p', p);
    m.append(fill);
    return m;
  };

  Site.start(STRINGS, (lang, t, h) => {
    const card = (c, p) => {
      const a = el('article', 'candidate');
      if (c.image) {
        const fig = el('figure');
        const img = el('img');
        img.src = ROOT + c.image;
        img.alt = t.portrait(c.name);
        fig.append(img);
        a.append(fig);
      }
      a.append(el('h2', '', c.name), el('p', 'party', c.party), el('p', 'label', t.winsRunoff), el('p', 'big', h.pct(p)), meter(p), el('p', 'hint', t.hint));
      return a;
    };
    const vs = el('article', 'runoff');
    const x = el('p', 'vs', '×');
    x.setAttribute('aria-hidden', 'true');
    vs.append(x);
    const stage = document.getElementById('stage');
    stage.dataset.count = '3';
    stage.replaceChildren(card(A, ODDS.p.a), vs, card(B, ODDS.p.b));

    document.querySelector('[data-i18n="warning"]').hidden = !t.warning;
    document.querySelector('[data-i18n="components"]').hidden = !ODDS.polls;
    const table = document.getElementById('polls-table');
    document.getElementById('polls').hidden = !ODDS.pollRows.length;
    const head = el('tr');
    t.cols.forEach((c, i) => head.append(el('th', i > 1 ? 'num' : '', c)));
    const rows = ODDS.pollRows.map((r) => {
      const tr = el('tr');
      const signed = (n) => `${n > 0 ? '−' : '+'}${pp(Math.abs(n), lang)}`;
      [r.pollster + (r.preElection ? '' : ' *'), h.short(r.end), h.int(r.sample), `${pp(r.raw, lang)}`, r.shift === 0 ? '—' : `${signed(r.shift)}`, `${pp(r.adjusted, lang)}`]
        .forEach((v, i) => tr.append(el('td', i > 1 ? 'num' : '', v)));
      return tr;
    });
    table.replaceChildren(head, ...rows);
    document.getElementById('polls-note').textContent = t.tableNote;
  }, ODDS.intention);
})();
