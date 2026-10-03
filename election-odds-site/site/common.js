// Shared by every page: language handling (pt-BR default, EN toggle), formatting, navigation labels.
(() => {
  const DEFAULT_LANG = 'pt-BR';
  const NAV = {
    'pt-BR': { president: 'Presidente', 'rj-senate': 'RJ · Senado', 'rj-governor': 'RJ · Governo', 'sc-senate': 'SC · Senado', 'sc-governor': 'SC · Governo', pages: 'Páginas' },
    en: { president: 'President', 'rj-senate': 'RJ · Senate', 'rj-governor': 'RJ · Governor', 'sc-senate': 'SC · Senate', 'sc-governor': 'SC · Governor', pages: 'Pages' },
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

  window.Site = {
    json: (id) => JSON.parse(document.getElementById(id).textContent),

    /**
     * strings: { 'pt-BR': {...}, en: {...} }. Values may be functions of the helpers.
     * Elements with data-i18n get textContent, data-i18n-html get innerHTML.
     * render(lang, t, h) runs after every language change for page-specific parts.
     */
    start(strings, render) {
      const apply = (lang) => {
        const t = strings[lang];
        const h = helpers(lang);
        const value = (key) => (typeof t[key] === 'function' ? t[key](h) : t[key]);
        document.documentElement.lang = lang;
        document.title = value('pageTitle');
        document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = value(el.dataset.i18n); });
        document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = value(el.dataset.i18nHtml); });
        document.querySelectorAll('[data-nav]').forEach((el) => { el.textContent = NAV[lang][el.dataset.nav]; });
        document.querySelector('.tabs')?.setAttribute('aria-label', NAV[lang].pages);
        document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
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
