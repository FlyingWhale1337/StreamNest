(function () {
  const L = window.STREAMNEST_LANG === 'en' ? 'en' : 'ru';
  const CYR = /[А-Яа-яЁё]/;
  const missing = new Set();
  const ATTRS = ['placeholder', 'title', 'aria-label'];

  function lookup(k) {
    const DICT = window.I18N_EN || {};
    if (Object.prototype.hasOwnProperty.call(DICT, k)) return DICT[k];
    for (const [re, rep] of (window.I18N_EN_PATTERNS || [])) {
      const m = k.match(re);
      if (m) return typeof rep === 'function' ? rep(...m) : k.replace(re, rep);
    }
    return undefined;
  }

  function tr(s) {
    if (L !== 'en' || !s || !CYR.test(s)) return s;
    const k = s.trim().replace(/\s+/g, ' ');
    let v = lookup(k);
    if (v === undefined) {
      const pieces = k.split(/( · | — |: |, )/);
      if (pieces.length > 1) {
        let any = false;
        const out = pieces.map(p => {
          if (!CYR.test(p)) return p;
          const t = lookup(p.trim()) ?? lookup(p.trim() + ':')?.replace(/:$/, '');
          if (t !== undefined) { any = true; return t; }
          return p;
        });
        if (any) v = out.join('');
      }
    }
    if (v === undefined) { missing.add(k); return s; }
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + v + trail;
  }

  function isSkipped(el) {
    return !!(el && el.closest && el.closest('[data-raw],script,style,textarea'));
  }

  function translateEl(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && CYR.test(v)) { const n = tr(v); if (n !== v) el.setAttribute(a, n); }
    }
  }

  function translate(root) {
    if (L !== 'en' || !root) return;
    if (root.nodeType === 3) {
      if (!isSkipped(root.parentElement)) { const n = tr(root.nodeValue); if (n !== root.nodeValue) root.nodeValue = n; }
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) { if (isSkipped(root)) return; translateEl(root); }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(n) {
        if (n.nodeType === 1) return (n.hasAttribute('data-raw') || /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.tagName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        return CYR.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 1) translateEl(n);
      else { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    }
  }

  function start() {
    if (L !== 'en') return;
    document.documentElement.lang = 'en';
    if (CYR.test(document.title)) document.title = tr(document.title);
    translate(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(translate);
        else if (m.type === 'characterData') translate(m.target);
        else if (m.type === 'attributes') translateEl(m.target);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  window.I18N = { lang: L, t: tr, translate, missing, locale: L === 'en' ? 'en-GB' : 'ru-RU' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
