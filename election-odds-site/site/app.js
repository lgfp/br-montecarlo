(() => {
  const ODDS = JSON.parse(document.getElementById('odds').textContent);
  const DEFAULT_LANG = 'pt-BR';

  const STRINGS = {
    'pt-BR': {
      pageTitle: 'Chances na eleição 2026',
      eyebrow: (d) => `Eleição presidencial · 1º turno: ${d.election}`,
      title: 'Quais são as chances?',
      lede: (d) => `Probabilidades estimadas a partir da média das últimas pesquisas registradas no TSE, com ${d.sims} simulações da eleição.`,
      firstRound: 'Vence no 1º turno',
      firstRoundHint: 'Mais de 50% dos votos válidos',
      runoff: 'Segundo turno entre os dois',
      runoffHint: 'Lula × Flávio Bolsonaro',
      methodTitle: 'Como funciona',
      method: (d) => `Cada pesquisa é convertida em votos válidos (brancos, nulos e indecisos são redistribuídos proporcionalmente). A média é ponderada pelo tamanho da amostra e pela data. Em seguida, a eleição é simulada ${d.sims} vezes, com a margem de erro das pesquisas, aplicando a regra brasileira: quem passar de 50% dos votos válidos vence no 1º turno; caso contrário, os dois mais votados disputam o 2º turno.`,
      caveat: 'Pesquisas erram, e o modelo não corrige vieses de institutos, abstenção nem diferenças regionais. Não é uma previsão garantida. Projeto independente, sem vínculo com candidatos, partidos ou institutos de pesquisa. Probabilidades abaixo de 1% aparecem como “<1%”.',
      meta: (d) => `Atualizado em ${d.updated} · ${d.polls} pesquisas (trabalho de campo de ${d.from} a ${d.to})`,
      sources: 'Fontes: registro de pesquisas do <a href="https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026">TSE</a> e tabelas de resultados da <a href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Brazilian_presidential_election">Wikipédia (em inglês)</a>.',
      alt: { flavio: 'Retrato em desenho a tinta de Flávio Bolsonaro', lula: 'Retrato em desenho a tinta de Lula' },
    },
    en: {
      pageTitle: '2026 election odds',
      eyebrow: (d) => `Presidential election · first round: ${d.election}`,
      title: 'What are the odds?',
      lede: (d) => `Probabilities estimated from the average of the latest polls registered with the TSE, using ${d.sims} simulated elections.`,
      firstRound: 'Wins in the first round',
      firstRoundHint: 'More than 50% of valid votes',
      runoff: 'Runoff between the two',
      runoffHint: 'Lula × Flávio Bolsonaro',
      methodTitle: 'How it works',
      method: (d) => `Each poll is converted to valid votes (blank, null and undecided are redistributed proportionally). The average is weighted by sample size and recency. The election is then simulated ${d.sims} times, with polling error, applying the Brazilian rule: whoever passes 50% of valid votes wins in the first round; otherwise the top two go to a runoff.`,
      caveat: 'Polls can be wrong, and the model does not correct for pollster bias, abstention or regional differences. This is not a guaranteed forecast. Independent project, not affiliated with any candidate, party or pollster. Probabilities under 1% are shown as “<1%”.',
      meta: (d) => `Updated ${d.updated} · ${d.polls} polls (fieldwork ${d.from} to ${d.to})`,
      sources: 'Sources: poll registry from the <a href="https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026">TSE</a> and results tables from <a href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Brazilian_presidential_election">Wikipedia</a>.',
      alt: { flavio: 'Ink drawing portrait of Flávio Bolsonaro', lula: 'Ink drawing portrait of Lula' },
    },
  };

  const $ = (sel) => document.querySelector(sel);
  const odds = { flavio: ODDS.firstRoundWin.flavio, lula: ODDS.firstRoundWin.lula, runoff: ODDS.runoffLulaFlavio };

  const readLang = () => {
    const fromUrl = new URLSearchParams(location.search).get('lang');
    let stored = null;
    try { stored = localStorage.getItem('lang'); } catch { /* storage may be unavailable */ }
    const lang = fromUrl || stored || DEFAULT_LANG;
    return STRINGS[lang] ? lang : DEFAULT_LANG;
  };

  const formatPct = (p, lang) => {
    if (p < 0.01) return '<1%';
    return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: p < 0.1 ? 1 : 0 }).format(p);
  };

  const render = (lang) => {
    const t = STRINGS[lang];
    const day = (iso) => new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));
    const short = (iso) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso));
    const d = {
      election: day(ODDS.electionDate),
      sims: new Intl.NumberFormat(lang).format(ODDS.simulations),
      updated: new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(ODDS.generatedAt)),
      polls: ODDS.pollsUsed,
      from: short(ODDS.oldestPoll),
      to: short(ODDS.newestPoll),
    };

    document.documentElement.lang = lang;
    document.title = t.pageTitle;
    $('#eyebrow').textContent = t.eyebrow(d);
    $('#title').textContent = t.title;
    $('#lede').textContent = t.lede(d);
    $('#method').textContent = t.method(d);
    $('#caveat').textContent = t.caveat;
    $('#meta').textContent = t.meta(d);
    $('#sources').innerHTML = t.sources;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t[el.dataset.i18n]; });
    $('#flavio img').alt = t.alt.flavio;
    $('#lula img').alt = t.alt.lula;

    for (const [key, p] of Object.entries(odds)) {
      document.querySelector(`[data-odds="${key}"]`).textContent = formatPct(p, lang);
      document.querySelector(`[data-meter="${key}"]`).style.setProperty('--p', p);
    }
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  };

  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => {
    try { localStorage.setItem('lang', b.dataset.lang); } catch { /* ignore */ }
    render(b.dataset.lang);
  }));

  render(readLang());
})();
