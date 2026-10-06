// Shared by every page: language handling (pt-BR default, EN toggle), formatting, navigation labels.
(() => {
  const DEFAULT_LANG = 'pt-BR';
  const NAV = {
    'pt-BR': { president: 'Presidente', pages: 'Páginas' },
    en: { president: 'President', pages: 'Pages' },
  };

  // state tabs are just the UF ('rj-governor' -> 'RJ'): every state page is its governor runoff; the president is spelled out above
  const navLabel = (lang, key) => NAV[lang][key] ?? key.split('-')[0].toUpperCase();

  const INTENTION = {
    'pt-BR': {
      title: 'Estimativa de votos no 2º turno',
      valid: 'Média das pesquisas, em % dos votos válidos. A margem é o intervalo de 95% do modelo (± pontos percentuais) e inclui erros além do amostral, por isso é maior que a de uma pesquisa isolada.',
      named: 'Média das pesquisas em que o eleitor cita dois nomes, em % dos votos citados (cada eleitor vota em dois). A margem é o intervalo de 95% do modelo (± pontos percentuais) e inclui erros além do amostral.',
      twoWay: 'Estimativa do 2º turno (mistura do resultado do 1º turno com as pesquisas), em % dos votos dos dois finalistas. A margem é o intervalo de 95% do modelo (± pontos percentuais).',
      others: 'Outros',
      pp: 'p.p.',
    },
    en: {
      title: 'Runoff vote estimate',
      valid: 'Poll average, as % of valid votes. The margin is the model’s 95% interval (± percentage points) and includes errors beyond sampling, so it is wider than a single poll’s.',
      named: 'Average of polls where respondents name two candidates, as % of the votes named (each voter has two votes). The margin is the model’s 95% interval (± percentage points) and includes errors beyond sampling.',
      twoWay: 'Runoff estimate (blend of the first-round result and the polls), as % of the two finalists’ votes. The margin is the model’s 95% interval (± percentage points).',
      others: 'Others',
      pp: 'pp',
    },
  };

  const readLang = (strings) => {
    const fromUrl = new URLSearchParams(location.search).get('lang');
    let stored = null;
    try { stored = localStorage.getItem('lang'); } catch { /* storage may be unavailable */ }
    const lang = fromUrl || stored || DEFAULT_LANG;
    return strings[lang] ? lang : DEFAULT_LANG;
  };

  const helpers = (lang) => ({
    lang,
    pct(p) {
      if (p < 0.01) return '<1%';
      if (p > 0.99) return '>99%';
      return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: p < 0.1 ? 1 : 0 }).format(p);
    },
    int: (n) => new Intl.NumberFormat(lang).format(n),
    day: (iso) => new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso)),
    short: (iso) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso)),
    updated: (iso) => new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)),
  });

  const node = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // Aggregated vote intention: one row per candidate with the poll average, its 95% margin, and a bar
  // (fill = average, band = margin). Rows that round to 0.0% are left out.
  const renderIntention = (box, data, lang) => {
    const t = INTENTION[lang];
    const pct = new Intl.NumberFormat(lang, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const pp = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const rows = [...data.rows];
    if (data.others) rows.push({ name: t.others, party: '', share: data.others.share, margin: data.others.margin });
    const shown = rows.filter((r) => r.share >= 0.0005);
    const scale = Math.max(...shown.map((r) => r.share + r.margin));

    const list = node('ul', 'intention-rows');
    for (const r of shown) {
      const li = node('li');
      const name = node('span', 'who', r.name);
      if (r.party) name.append(node('span', 'party-tag', r.party));
      const value = node('span', 'value', pct.format(r.share));
      value.append(node('span', 'margin', `± ${pp.format(r.margin * 100)} ${t.pp}`));
      const track = node('div', 'track');
      const band = node('span', 'band');
      band.style.left = `${(Math.max(0, r.share - r.margin) / scale) * 100}%`;
      band.style.width = `${((Math.min(scale, r.share + r.margin) - Math.max(0, r.share - r.margin)) / scale) * 100}%`;
      const fill = node('span', 'fill');
      fill.style.width = `${(r.share / scale) * 100}%`;
      track.append(band, fill);
      li.append(name, value, track);
      list.append(li);
    }
    box.replaceChildren(node('h3', '', t.title), node('p', 'hint', t[data.basis]), list);
  };

  window.Site = {
    json: (id) => JSON.parse(document.getElementById(id).textContent),

    /**
     * strings: { 'pt-BR': {...}, en: {...} }. Values may be functions of the helpers.
     * Elements with data-i18n get textContent, data-i18n-html get innerHTML.
     * render(lang, t, h) runs after every language change for page-specific parts.
     * intention (optional): the aggregated vote intention to draw into #intention.
     */
    start(strings, render, intention) {
      const apply = (lang) => {
        const t = strings[lang];
        const h = helpers(lang);
        const value = (key) => (typeof t[key] === 'function' ? t[key](h) : t[key]);
        document.documentElement.lang = lang;
        document.title = value('pageTitle');
        document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = value(el.dataset.i18n); });
        document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = value(el.dataset.i18nHtml); });
        document.querySelectorAll('[data-nav]').forEach((el) => { el.textContent = navLabel(lang, el.dataset.nav); });
        document.querySelector('.tabs')?.setAttribute('aria-label', NAV[lang].pages);
        document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
        const box = document.getElementById('intention');
        if (box && intention) renderIntention(box, intention, lang);
        render(lang, t, h);
      };

      // on narrow screens the tab row scrolls sideways: start with the current tab in view
      const tabs = document.querySelector('.tabs');
      const current = tabs?.querySelector('[aria-current]');
      if (current) tabs.scrollLeft = current.offsetLeft - (tabs.clientWidth - current.offsetWidth) / 2;

      document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => {
        try { localStorage.setItem('lang', b.dataset.lang); } catch { /* ignore */ }
        apply(b.dataset.lang);
      }));
      apply(readLang(strings));
    },
  };
})();
