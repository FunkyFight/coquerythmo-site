// Accessibilité (boucle 6): the page's own "lecture vocale" journal, a
// replayed Coquerythmo session, the full shortcut list (#raccourcis) and the
// platform matrix. Quoted app strings come from i18n/fr.toml and
// RACCOURCIS_CLAVIER.md of the desktop app.

/* ───────────── Keys: "Ctrl + Maj + ←" → keycaps + spoken names ───────────── */
// Spoken names follow the app's own shortcut.* strings (i18n/fr.toml).
const SPOKEN = {
  Ctrl: 'Contrôle',
  Tab: 'Tabulation',
  Suppr: 'Supprimer',
  'Page haut': 'Page précédente',
  'Page bas': 'Page suivante',
  '←': 'Flèche gauche',
  '→': 'Flèche droite',
  '↑': 'Flèche haut',
  '↓': 'Flèche bas',
  '-': 'Moins',
};
// Extra search words, so "shift", "esc" or "delete" find the French keys.
const ALIASES = {
  ctrl: ['controle', 'control'],
  maj: ['shift'],
  echap: ['esc', 'escape'],
  suppr: ['supprimer', 'delete', 'del'],
  entree: ['enter', 'return'],
  espace: ['space'],
  tab: ['tabulation'],
  '←': ['fleche', 'gauche'],
  '→': ['fleche', 'droite'],
  '↑': ['fleche', 'haut'],
  '↓': ['fleche', 'bas'],
};
const NOT_KEYS = new Set(['clic-glissé']);
// Link words left out of the search index, so "d" or "de" do not match every row.
const STOP_WORDS = new Set(['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'ou', 'par', 's', 'sur', 'un', 'une', 'y']);
const SEPARATORS = /\s+(\/|à)\s+/;

const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

function spokenKey(key) {
  const pad = /^Numpad (.+)$/.exec(key);
  if (pad) return `Pavé numérique ${SPOKEN[pad[1]] || pad[1]}`;
  return SPOKEN[key] || key;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Replace the text of a key cell ("Ctrl + C / Ctrl + X") by keycaps. The
 * keycaps are hidden from screen readers, which get the app's key names
 * instead ("Contrôle C, ou Contrôle X"). Returns the search tokens.
 */
function renderChord(cell) {
  const source = cell.textContent.replace(/\s+/g, ' ').trim();
  const parts = source.split(SEPARATORS);
  const visual = el('span', 'acc-chord');
  visual.setAttribute('aria-hidden', 'true');
  const spoken = [];
  const tokens = new Set();
  parts.forEach((part, i) => {
    if (i % 2) {
      visual.append(el('span', 'acc-chord__sep', part));
      spoken.push(part === '/' ? 'ou' : part);
      return;
    }
    const combo = el('span', 'acc-chord__combo');
    const keys = part.split(/\s+\+\s+/);
    keys.forEach((key, k) => {
      if (k) combo.append(el('span', 'acc-chord__plus', '+'));
      combo.append(NOT_KEYS.has(key) ? el('span', 'acc-chord__gesture', key) : el('kbd', 'kbd', key));
      const f = fold(key);
      tokens.add(f);
      f.split(' ').forEach((w) => tokens.add(w));
      (ALIASES[f] || []).forEach((a) => tokens.add(a));
      if (f.startsWith('numpad')) tokens.add('pave');
    });
    visual.append(combo);
    spoken.push(keys.map(spokenKey).join(' '));
  });
  const said = spoken.join(' ');
  cell.replaceChildren(visual, el('span', 'sr-only', said));
  cell.dataset.chord = source;
  return { tokens, said };
}

/* ───────────── Timecode, spoken like the app (state.rs timecode_for_frame) ───────────── */
function spokenTimecode(frame, fps) {
  const total = Math.round((Math.max(0, Math.floor(frame)) / fps) * 100);
  const unit = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  return [
    unit(Math.floor(total / 360000), 'heure', 'heures'),
    unit(Math.floor(total / 6000) % 60, 'minute', 'minutes'),
    unit(Math.floor(total / 100) % 60, 'seconde', 'secondes'),
    unit(total % 100, 'centième', 'centièmes'),
  ].join(', ');
}

/* ───────────── Focus mirror: what a screen reader says on focus ─────────────
   Same shape as the app's Focus event, "nom, rôle". Shown in the journal
   only; the visitor's own screen reader already speaks it. */
const ROLES = {
  button: 'bouton',
  link: 'lien',
  tab: 'onglet',
  tabpanel: 'panneau d’onglet',
  checkbox: 'case à cocher',
  radio: 'bouton radio',
  slider: 'curseur',
  searchbox: 'zone de recherche',
  textbox: 'zone d’édition',
  combobox: 'liste déroulante',
  menuitem: 'élément de menu',
  region: 'région',
  group: 'groupe',
  dialog: 'boîte de dialogue',
};

function implicitRole(node) {
  const tag = node.tagName;
  if (tag === 'A' && node.hasAttribute('href')) return 'link';
  if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
  if (tag === 'SELECT') return 'combobox';
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'INPUT') {
    const type = node.type;
    if (type === 'checkbox' || type === 'radio') return type;
    if (type === 'range') return 'slider';
    if (type === 'search') return 'searchbox';
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    return 'textbox';
  }
  return '';
}

function visibleText(node) {
  let out = '';
  const walk = (n) => {
    if (out.length > 200) return; // a long region: its first words are enough
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.textContent;
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE || n.getAttribute('aria-hidden') === 'true') return;
    n.childNodes.forEach(walk);
    if (getComputedStyle(n).display !== 'inline') out += ' ';
  };
  walk(node);
  return out.replace(/\s+/g, ' ').trim();
}

function accessibleName(node) {
  const label = node.getAttribute('aria-label');
  if (label) return label.trim();
  const by = node.getAttribute('aria-labelledby');
  if (by) {
    return by
      .split(/\s+/)
      .map((id) => {
        const ref = document.getElementById(id);
        return ref ? visibleText(ref) : '';
      })
      .join(' ')
      .trim();
  }
  if (node.labels?.length) return visibleText(node.labels[0]);
  const text = ['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName) ? '' : visibleText(node);
  return text || node.getAttribute('title') || node.getAttribute('placeholder') || '';
}

function focusLine(node) {
  const role = node.getAttribute('aria-roledescription') || ROLES[node.getAttribute('role') || implicitRole(node)] || '';
  let name = accessibleName(node);
  if (name.length > 140) name = `${name.slice(0, 137)}…`;
  let state = '';
  if (node.type === 'checkbox') state = node.checked ? 'coché' : 'non coché';
  else if (node.getAttribute('aria-selected') === 'true') state = 'sélectionné';
  else if (node.getAttribute('aria-pressed') === 'true') state = 'enfoncé';
  return [name, role, state].filter(Boolean).join(', ');
}

/* ───────────── Journal ───────────── */
const KIND_LABEL = { priority: 'Prioritaire', polite: 'Annonce', focus: 'Focus', silence: 'Silence' };
const LOG_MAX = 60;

function initJournal(ctx, root) {
  const panel = root.querySelector('.acc-log');
  const scroller = panel.querySelector('[data-log-scroll]');
  const list = panel.querySelector('[data-log]');
  const empty = panel.querySelector('[data-log-empty]');
  const focusToggle = panel.querySelector('[data-log-focus]');
  const epoch = Date.now() - performance.now();
  const clock = (at) =>
    new Date(epoch + at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let pending = null; // metadata (keys, kind) for the next announce() we trigger ourselves
  let muted = null; // an announcement spoken but kept out of the journal
  let lastFocus = null;

  function add({ text, kind, chord, note, at = performance.now() }) {
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
    const item = el('li', 'acc-log__item');
    item.dataset.kind = kind;
    const time = el('span', 'acc-log__time tnum', clock(at));
    time.setAttribute('aria-hidden', 'true');
    const tag = el('span', 'acc-log__tag', KIND_LABEL[kind]);
    const body = el('span', 'acc-log__text');
    if (chord) {
      const keys = el('span', 'acc-log__keys', chord);
      renderChord(keys);
      body.append(keys);
    }
    body.append(el('span', kind === 'silence' ? 'acc-log__said acc-log__said--silence' : 'acc-log__said', text));
    if (note) body.append(el('span', 'acc-log__note', note));
    item.append(time, tag, body);
    list.querySelector('[data-latest]')?.removeAttribute('data-latest');
    item.setAttribute('data-latest', '');
    list.append(item);
    while (list.children.length > LOG_MAX) list.firstElementChild.remove();
    list.hidden = false;
    // the empty state's button may hold the keyboard focus: keep it in the panel
    if (!empty.hidden && empty.contains(document.activeElement)) scroller.focus({ preventScroll: true });
    empty.hidden = true;
    if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
  }

  function clear() {
    list.replaceChildren();
    list.hidden = true;
    empty.hidden = false;
    lastFocus = null;
  }

  ctx.announceLog().forEach((e) => add({ text: e.text, kind: e.priority ? 'priority' : 'polite', at: e.at }));
  ctx.onAnnounce((e) => {
    if (muted && e.text === muted) {
      muted = null;
      return;
    }
    const meta = pending && pending.text === e.text ? pending : null;
    pending = null;
    add({ text: e.text, kind: meta?.kind || (e.priority ? 'priority' : 'polite'), chord: meta?.chord, note: meta?.note, at: e.at });
  });

  document.addEventListener('focusin', (e) => {
    const node = e.target;
    if (!focusToggle.checked || !(node instanceof Element) || node === lastFocus) return;
    if (!node.matches(':focus-visible')) return;
    // The journal's own body stays out: logging it would hide the empty state,
    // and its button, under the keyboard focus.
    if (scroller.contains(node)) return;
    lastFocus = node;
    const line = focusLine(node);
    if (line) add({ text: line, kind: 'focus' });
  });
  document.addEventListener('focusout', () => {
    // allow the same control to be logged again once focus comes back to it
    setTimeout(() => {
      if (document.activeElement !== lastFocus) lastFocus = null;
    });
  });

  panel.querySelector('[data-log-clear]').addEventListener('click', () => {
    clear();
    muted = 'Journal effacé';
    ctx.announce(muted);
  });

  // The app counts from the start of the media; the demo video burns in a
  // 01:00:00:00-based timecode, so the journal shows both.
  panel.querySelector('[data-read-tc]').addEventListener('click', () => {
    const frame = ctx.band?.frame ?? 0;
    say(`Timecode : ${spokenTimecode(frame, ctx.FPS)}`, {
      kind: 'polite',
      note: `Compté depuis le début, comme l’app. Incrusté dans la vidéo : ${ctx.timecode(frame)}`,
    });
  });

  panel.querySelector('[data-goto-band]').addEventListener('click', () => {
    if (ctx.tabs.current() !== 'rythmo') ctx.tabs.select('rythmo');
    document.getElementById('top')?.scrollIntoView({ behavior: ctx.settings.get().reduceMotion ? 'auto' : 'smooth' });
    ctx.band?.host.focus({ preventScroll: true });
  });

  /** Speak through the page's announcer, tagging the journal entry. */
  function say(text, { kind = 'polite', chord, note } = {}) {
    pending = { text, kind, chord, note };
    ctx.announce(text, { priority: kind === 'priority' });
  }

  return { add, say };
}

/* ───────────── Séance type: replay real announcements, one per step ───────────── */
function initReplay(ctx, root, journal) {
  const button = root.querySelector('[data-replay]');
  const icon = button.querySelector('[data-replay-icon]');
  const label = button.querySelector('[data-replay-label]');
  const steps = [...root.querySelectorAll('.acc-step')];
  const chords = steps.map((step) => {
    const cell = step.querySelector('[data-keys]');
    if (!cell) return null;
    const text = cell.textContent.replace(/\s+/g, ' ').trim();
    renderChord(cell);
    return text;
  });
  let timer = 0;
  let playing = false;

  const setButton = () => {
    icon.style.setProperty('--src', `url(/icons/${playing ? 'pause' : 'resume'}.svg)`);
    label.textContent = playing ? 'Arrêter la séance' : 'Rejouer la séance';
  };

  function stop() {
    clearTimeout(timer);
    playing = false;
    steps.forEach((s) => s.classList.remove('is-active'));
    setButton();
  }

  function run(i) {
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    if (i >= steps.length) {
      stop();
      return;
    }
    const step = steps[i];
    const kind = step.dataset.kind;
    const text = step.querySelector('.acc-step__say').textContent.replace(/\s+/g, ' ').trim();
    const dur = kind === 'silence' ? 1300 : Math.min(3600, 800 + text.length * 45);
    step.style.setProperty('--dur', `${dur}ms`);
    if (kind === 'silence') journal.add({ text: 'La voix s’arrête.', kind, chord: chords[i] });
    else journal.say(text, { kind, chord: chords[i] });
    timer = setTimeout(() => run(i + 1), dur + 500);
  }

  button.addEventListener('click', () => {
    if (playing) {
      stop();
      return;
    }
    playing = true;
    setButton();
    run(0);
  });
  root.querySelector('.acc-script').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && playing) stop();
  });
  // never keep talking once the visitor has scrolled away
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting && playing) stop();
  }).observe(root.querySelector('.acc-voice'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) stop();
  });
}

/* ───────────── Raccourcis: categories (export-centre page menu) + search ───────────── */
function initShortcuts(ctx, root) {
  const box = root.querySelector('#raccourcis');
  const tabs = [...box.querySelectorAll('[role="tab"]')];
  const listEl = box.querySelector('[data-list]');
  const search = box.querySelector('[data-search]');
  const clearBtn = box.querySelector('[data-search-clear]');
  const empty = box.querySelector('[data-keys-empty]');
  const emptyTitle = box.querySelector('[data-keys-empty-title]');
  const allBtn = box.querySelector('[data-search-all]');
  const countEl = box.querySelector('[data-count]');
  const groups = [...box.querySelectorAll('[data-group]')].map((g) => ({
    id: g.dataset.group,
    el: g,
    name: g.querySelector('h4').textContent.trim(),
    rows: [...g.querySelectorAll('tbody tr')].map((tr) => {
      const { tokens, said } = renderChord(tr.querySelector('[data-keys]'));
      const words = fold(`${tr.querySelector('.acc-a').textContent} ${said}`)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w && !STOP_WORDS.has(w));
      return { tr, keys: [...tokens], words };
    }),
  }));
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  let cat = 'all';
  let announceTimer = 0;

  // Every term is a prefix of a word or a key: each letter typed can only
  // narrow the list ("s" ⊇ "sa" ⊇ "sau").
  const matches = (row, terms) =>
    terms.every((t) => row.words.some((w) => w.startsWith(t)) || row.keys.some((k) => k.startsWith(t)));
  const plural = (n) => `${n} raccourci${n > 1 ? 's' : ''}`;

  function apply({ speak = false } = {}) {
    const query = search.value.trim();
    const terms = fold(query)
      .split(/[\s+,;]+/)
      .filter(Boolean);
    const counts = { all: 0 };
    for (const g of groups) {
      counts[g.id] = 0;
      for (const r of g.rows) {
        const hit = !terms.length || matches(r, terms);
        r.tr.hidden = !hit;
        if (hit) counts[g.id]++;
      }
      counts.all += counts[g.id];
      g.el.hidden = !((cat === 'all' || cat === g.id) && counts[g.id] > 0);
    }
    for (const t of tabs) {
      const n = counts[t.dataset.cat];
      t.querySelector('[data-n]').textContent = String(n);
      t.querySelector('[data-n-unit]').textContent = n > 1 ? ' raccourcis' : ' raccourci';
      t.toggleAttribute('data-empty', n === 0);
    }
    const shown = counts[cat];
    const catName = cat === 'all' ? '' : groups.find((g) => g.id === cat).name;
    empty.hidden = shown > 0;
    if (!shown) {
      emptyTitle.textContent = catName
        ? `Aucun raccourci « ${query} » dans ${catName}.`
        : `Aucun raccourci ne correspond à « ${query} ».`;
      allBtn.hidden = !(catName && counts.all > 0);
    }
    countEl.textContent = terms.length ? `${shown} sur ${total} raccourcis` : plural(shown);
    clearBtn.hidden = !query;
    if (speak) {
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => {
        ctx.announce(shown ? `${plural(shown)}${catName ? ` dans ${catName}` : ''}` : 'Aucun raccourci trouvé');
      }, 650);
    }
  }

  function select(name, { focus = false } = {}) {
    cat = name;
    for (const t of tabs) {
      const on = t.dataset.cat === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) {
        listEl.setAttribute('aria-labelledby', t.id);
        if (focus) t.focus();
      }
    }
    listEl.scrollTop = 0;
    apply();
  }

  // Like the export centre's page menu: arrows move and select, both axes.
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab.dataset.cat));
    tab.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: last }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length].dataset.cat, { focus: true });
    });
  });

  search.addEventListener('input', () => apply({ speak: true }));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.value) {
      e.preventDefault();
      e.stopPropagation();
      search.value = '';
      apply({ speak: true });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      listEl.focus();
    }
  });
  const reset = () => {
    search.value = '';
    apply({ speak: true });
    search.focus();
  };
  clearBtn.addEventListener('click', reset);
  box.querySelector('[data-search-reset]').addEventListener('click', reset);
  allBtn.addEventListener('click', () => {
    select('all');
    apply({ speak: true });
    tabs[0].focus();
  });

  // The rail is a row of chips on narrow screens.
  const mq = window.matchMedia('(max-width: 720px)');
  const orient = () => box.querySelector('[data-cats]').setAttribute('aria-orientation', mq.matches ? 'horizontal' : 'vertical');
  mq.addEventListener?.('change', orient);
  orient();

  apply();
}

/* ───────────── Plateformes ───────────── */
function initMatrix(ctx, root) {
  const table = root.querySelector('[data-matrix]');
  const you = root.querySelector('[data-matrix-you]');
  const name = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }[ctx.os];
  if (name) {
    table.querySelectorAll(`[data-os="${ctx.os}"]`).forEach((cell) => cell.setAttribute('data-mine', ''));
    you.textContent = `Votre système : ${name}`;
    you.hidden = false;
  }
  // Windows claims hold for every later version; macOS and Linux stay pinned
  // to the 3.5.1 builds they were checked against.
  ctx.downloads.then((dl) => {
    const v = table.querySelector('[data-win-version]');
    if (v && dl?.windows?.version) v.textContent = dl.windows.version;
  });
}

export function init(ctx) {
  const root = document.getElementById('accessibilite');
  if (!root) return;
  const journal = initJournal(ctx, root);
  initReplay(ctx, root, journal);
  initShortcuts(ctx, root);
  initMatrix(ctx, root);
}
