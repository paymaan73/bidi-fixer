(() => {
  'use strict';

  const RTL_CHARS = '\\u0590-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF';
  const LTR_CHARS = 'A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF';
  const RTL_TEST = new RegExp(`[${RTL_CHARS}]`);
  const LTR_TEST = new RegExp(`[${LTR_CHARS}]`);
  const RTL_ALL = new RegExp(`[${RTL_CHARS}]`, 'g');
  const LTR_ALL = new RegExp(`[${LTR_CHARS}]`, 'g');
  const LATIN_RUN = new RegExp(`[${LTR_CHARS}][^${RTL_CHARS}\\n]*`, 'g');
  const RTL_RUN = new RegExp(`[${RTL_CHARS}][^${LTR_CHARS}\\n]*`, 'g');
  const LATIN_END = new RegExp(`[${LTR_CHARS}0-9]`);
  const RTL_END = new RegExp(`[${RTL_CHARS}0-9]`);

  // Share of RTL letters needed for a block to become RTL.
  const THRESHOLD = 0.4;

  const ATTR = 'data-bidi-fix';
  const ORIG_ATTR = 'data-bidi-orig';
  const ALIGN_ATTR = 'data-bidi-align';
  const RUN_ATTR = 'data-bidi-run';

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
    'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'MATH', 'CANVAS', 'IFRAME', 'TEMPLATE']);
  const TEXT_BLOCKS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TD', 'TH',
    'DD', 'DT', 'FIGCAPTION', 'SUMMARY', 'CAPTION', 'LEGEND', 'LABEL', 'ADDRESS']);
  // Generic containers: only touched when they hold text directly and no block children,
  // so page layout (flex rows, sidebars...) is never flipped.
  const CONTAINER_BLOCKS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER',
    'NAV', 'FORM', 'FIELDSET', 'DETAILS', 'BODY']);
  const LIST_LIKE = new Set(['UL', 'OL', 'TABLE']);
  const BLOCK_CHILD_SELECTOR = 'div,p,ul,ol,li,table,section,article,h1,h2,h3,h4,h5,h6,' +
    'blockquote,pre,header,footer,nav,aside,form,fieldset,details,dl,figure,hr';

  let settings = { enabled: true, disabledSites: [], isolateRuns: false };
  let active = false;
  let observer = null;
  let timer = null;
  const pending = new Set();

  const isBoundary = (el) =>
    TEXT_BLOCKS.has(el.tagName) || CONTAINER_BLOCKS.has(el.tagName) || LIST_LIKE.has(el.tagName);
  const isSkipped = (el) => SKIP_TAGS.has(el.tagName) || el instanceof SVGElement;
  const count = (s, re) => (s.match(re) || []).length;

  function pageIsRtl() {
    return getComputedStyle(document.documentElement).direction === 'rtl' ||
      (document.body && getComputedStyle(document.body).direction === 'rtl');
  }

  // Nearest block that owns this text node, or null if it lives in code/editable/svg.
  function blockOf(node) {
    for (let el = node.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      if (isSkipped(el) || el.isContentEditable) return null;
      if (TEXT_BLOCKS.has(el.tagName) || CONTAINER_BLOCKS.has(el.tagName)) return el;
    }
    return null;
  }

  // Text nodes under el. ownOnly: stop at nested blocks (they are judged on their own).
  function textNodes(el, ownOnly) {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        for (let p = n.parentElement; p && p !== el; p = p.parentElement) {
          if (isSkipped(p) || (ownOnly && isBoundary(p))) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    for (let n; (n = walker.nextNode());) out.push(n);
    return out;
  }

  function wantedDir(el, ownOnly) {
    let rtl = 0, ltr = 0;
    for (const n of textNodes(el, ownOnly)) {
      rtl += count(n.nodeValue, RTL_ALL);
      ltr += count(n.nodeValue, LTR_ALL);
    }
    if (!rtl && !ltr) return null;
    return rtl / (rtl + ltr) >= THRESHOLD ? 'rtl' : 'ltr';
  }

  function unmark(el) {
    el.removeAttribute(ATTR);
    el.removeAttribute(ORIG_ATTR);
    el.removeAttribute(ALIGN_ATTR);
    el.style.removeProperty('--bidi-pl');
    el.style.removeProperty('--bidi-pr');
  }

  function applyDir(el, ownOnly) {
    if (!el.isConnected) return;
    if (CONTAINER_BLOCKS.has(el.tagName)) {
      if (el === document.body || el.querySelector(BLOCK_CHILD_SELECTOR)) return;
      const display = getComputedStyle(el).display;
      if (display.includes('flex') || display.includes('grid')) return;
    }
    const want = wantedDir(el, ownOnly);

    if (el.hasAttribute(ATTR)) {
      if (!want || want === el.getAttribute(ORIG_ATTR)) unmark(el);
      else el.setAttribute(ATTR, want);
      return;
    }
    if (!want) return;
    const cs = getComputedStyle(el);
    const orig = cs.direction;
    if (want === orig) return;

    const a = cs.textAlign;
    const natural = a === 'start' ||
      (orig === 'ltr' && (a === 'left' || a === '-webkit-left')) ||
      (orig === 'rtl' && (a === 'right' || a === '-webkit-right'));
    el.setAttribute(ORIG_ATTR, orig);
    if (natural) el.setAttribute(ALIGN_ATTR, '');
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      el.style.setProperty('--bidi-pl', cs.paddingLeft);
      el.style.setProperty('--bidi-pr', cs.paddingRight);
    }
    el.setAttribute(ATTR, want);
  }

  // Wrap phrases of the "other" script (e.g. "React Native 0.74" inside a Farsi line)
  // in <bdi> so surrounding punctuation stops jumping around.
  function findRuns(text, blockDir) {
    const re = blockDir === 'rtl' ? LATIN_RUN : RTL_RUN;
    const endRe = blockDir === 'rtl' ? LATIN_END : RTL_END;
    const runs = [];
    re.lastIndex = 0;
    for (let m; (m = re.exec(text));) {
      const s = m.index;
      let e = s + m[0].length;
      while (e > s) {
        const ch = text[e - 1];
        if (endRe.test(ch)) break;
        if (ch === ')' || ch === ']') {
          const seg = text.slice(s, e);
          const open = ch === ')' ? '(' : '[';
          if (seg.split(open).length >= seg.split(ch).length) break; // balanced closer, keep it
        }
        e--;
      }
      const seg = text.slice(s, e);
      // A single bare word renders fine on its own; only wrap multi-token phrases.
      if (/[\s\p{P}\p{S}]/u.test(seg)) runs.push([s, e]);
    }
    return runs;
  }

  function isolateRuns(el) {
    const dir = el.getAttribute(ATTR) || getComputedStyle(el).direction;
    for (const node of textNodes(el, true)) {
      if (node.parentElement.hasAttribute(RUN_ATTR)) continue;
      const text = node.nodeValue;
      if (!RTL_TEST.test(text) || !LTR_TEST.test(text)) continue;
      const runs = findRuns(text, dir);
      if (!runs.length) continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const [s, e] of runs) {
        if (s > last) frag.append(text.slice(last, s));
        const bdi = document.createElement('bdi');
        bdi.setAttribute(RUN_ATTR, '');
        bdi.dir = dir === 'rtl' ? 'ltr' : 'rtl';
        bdi.textContent = text.slice(s, e);
        frag.append(bdi);
        last = e;
      }
      if (last < text.length) frag.append(text.slice(last));
      node.replaceWith(frag);
    }
  }

  function depth(el) {
    let d = 0;
    for (; el; el = el.parentElement) d++;
    return d;
  }

  function processRoots(roots) {
    const rtlPage = pageIsRtl();
    const interesting = (s) => RTL_TEST.test(s) || (rtlPage && LTR_TEST.test(s));
    const blocks = new Set();

    const addText = (n) => {
      const b = blockOf(n);
      if (b) blocks.add(b);
    };
    for (const root of roots) {
      if (!root.isConnected) continue;
      if (root.nodeType === Node.TEXT_NODE) {
        addText(root);
        continue;
      }
      if (root.nodeType !== Node.ELEMENT_NODE) continue;
      const marked = root.parentElement && root.parentElement.closest(`[${ATTR}]`);
      if (marked) blocks.add(marked);
      root.querySelectorAll?.(`[${ATTR}]`).forEach((el) => blocks.add(el));
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) if (interesting(n.nodeValue)) addText(n);
    }

    // Lists/tables first (top-down) so their children are judged against the new direction.
    const lists = new Set();
    for (const b of blocks) {
      if (LIST_LIKE.has(b.tagName)) { lists.add(b); blocks.delete(b); }
      for (let l = b.parentElement?.closest('ul,ol,table'); l; l = l.parentElement?.closest('ul,ol,table')) {
        lists.add(l);
      }
    }
    [...lists].sort((a, b) => depth(a) - depth(b)).forEach((l) => applyDir(l, false));
    blocks.forEach((b) => applyDir(b, true));
    if (settings.isolateRuns) blocks.forEach((b) => b.isConnected && isolateRuns(b));
  }

  function flush() {
    timer = null;
    if (!active) return;
    const roots = [...pending];
    pending.clear();
    processRoots(roots);
    observer.takeRecords(); // drop mutations we caused ourselves
  }

  function schedule() {
    if (!timer) timer = setTimeout(flush, 250);
  }

  function start() {
    if (active || !document.body) return;
    active = true;
    document.documentElement.setAttribute('data-bidi-active', '');
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') pending.add(m.target);
        else m.addedNodes.forEach((n) => pending.add(n));
      }
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    pending.add(document.body);
    flush();
  }

  function stop() {
    if (!active) return;
    active = false;
    observer.disconnect();
    clearTimeout(timer);
    timer = null;
    pending.clear();
    document.documentElement.removeAttribute('data-bidi-active');
    document.querySelectorAll(`[${ATTR}]`).forEach(unmark);
    document.querySelectorAll(`bdi[${RUN_ATTR}]`).forEach((b) => {
      const parent = b.parentNode;
      b.replaceWith(...b.childNodes);
      parent.normalize();
    });
  }

  function refresh() {
    const on = settings.enabled && !settings.disabledSites.includes(location.hostname);
    if (active) stop();
    if (on) start();
  }

  chrome.storage.sync.get(settings, (s) => {
    settings = s;
    refresh();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) settings[k] = changes[k].newValue;
    refresh();
  });
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.type === 'getHost' && window === window.top) reply({ host: location.hostname });
  });
})();
