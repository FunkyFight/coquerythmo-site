// Section « Détection »: the detection palette (Alt+D in the app) working on a
// small band, the fiche with its hand-drawn mouth, and an illustration of
// « Convertir en signes de détection ».
// Names, descriptions, sounds, quick labels and the sign → mouth mapping are
// info() in src/detection_foreground.rs; palette order is Sign::ALL[..12].
// Band geometry of the signs: src/workspaces/rythmo/detection_ui.rs.

const LIPS = '/icons/detection/rhubarb_lips/';

/** The twelve palette signs, in the app's order (two rows of nine cells). */
const SIGNS = {
  labial: {
    title: 'Labiale',
    description: 'Fermeture nette des lèvres.',
    sounds: 'P, B, M',
    quick: 'Labiale (P, B, M)',
    mouth: 'P_B_M',
    icon: 'detection/labial',
  },
  semi: {
    title: 'Semi-labiale',
    description: 'Contact lèvre-dents, fermeture labiale incomplète.',
    sounds: 'F, V',
    quick: 'Semi-labiale (F, V)',
    mouth: 'F_V',
    icon: 'detection/semi_labial',
  },
  open: {
    title: 'Bouche ouverte',
    description: 'Bouche ouverte, repère d’articulation.',
    sounds: 'Voyelles ouvertes et attaques vocales',
    quick: 'Bouche ouverte',
    mouth: 'AA',
    icon: 'detection/mouth_open',
  },
  closed: {
    title: 'Bouche fermée',
    description: 'Bouche refermée ou occlusion visuelle.',
    sounds: 'Fermetures et attaques de consonnes occlusives',
    quick: 'Bouche fermée (fermetures, consonnes occlusives)',
    mouth: 'P_B_M',
    icon: 'detection/mouth_closed',
  },
  teeth: {
    title: 'Dents visibles',
    description: 'Dents apparentes, articulation tendue.',
    sounds: 'F, V, S, T, EE',
    quick: 'Dents visibles (F, V, S, T, EE)',
    mouth: 'K_S_T_EE',
    icon: 'detection/teeth_visible',
  },
  th: {
    title: 'TH',
    description: 'Articulation dentale appuyée du « th ».',
    sounds: 'TH, T et S appuyés',
    quick: 'TH (TH, T, S appuyés)',
    mouth: 'K_S_T_EE',
    icon: 'detection/th',
  },
  breath: {
    title: 'Respiration',
    description: 'Souffle ou reprise d’air.',
    sounds: 'Respiration, souffle et aspiration',
    quick: 'Respiration (souffle, aspiration)',
    mouth: 'UW_OW_W',
    icon: 'detection/breath',
  },
  neutral: {
    title: 'Neutre / parenthèses',
    description: 'Mouvement neutre ou intermédiaire.',
    sounds: 'CH, dentales appuyées et articulation neutre',
    quick: 'Neutre / parenthèses (CH, dentales, neutre)',
    mouth: 'EH_AE',
    icon: 'detection/neutral',
  },
  reaction: {
    title: 'Réaction',
    description: 'Réaction vocale non verbale.',
    sounds: 'Rires, exclamations et petits bruits vocaux',
    quick: 'Réaction (rires, exclamations, bruits vocaux)',
    mouth: 'AA',
    icon: 'detection/reaction',
  },
  pucker: {
    title: 'Cul de poule',
    description: 'Les lèvres se resserrent et se projettent en petite moue.',
    sounds: 'Lèvres pincées, baiser, petite projection labiale',
    quick: 'Cul de poule',
    mouth: 'UW_OW_W',
    icon: 'cul_de_poule',
  },
  openWave: {
    title: 'Vague d\'ouverture',
    description: 'La bouche s’ouvre ou s’étire nettement.',
    sounds: 'a / â ; é / er / ez ; è / ê / ai / ei ; i / y ; in / im / ain / ein ; parfois an / en',
    quick: 'Vague d\'ouverture',
    mouth: 'AA',
  },
  forwardWave: {
    title: 'Vague d\'avancée',
    description: 'Les lèvres s’arrondissent et se projettent vers l’avant.',
    sounds: 'o ; au / eau ; on / om ; ou ; u ; eu / œu ; parfois w dans oui, quoi, oiseau ou loin',
    quick: 'Vague d\'avancée',
    mouth: 'UW_OW_W',
  },
};

/** Line marks the palette adds while the pointer is on a line (palette_signs). */
const MARKS = {
  off: { quick: 'Marquer la réplique comme OFF (hors caméra)', done: 'Réplique OFF : soulignage continu à l’export' },
  back: { quick: 'Marquer la réplique comme de dos', done: 'Réplique de dos : soulignage pointillé à l’export' },
  on: { quick: 'Retirer le soulignage', done: 'Soulignage retiré : réplique active' },
};

const MOUTH_ALT = {
  P_B_M: 'lèvres fermées',
  F_V: 'lèvres presque closes, les dents posées sur la lèvre inférieure',
  AA: 'bouche grande ouverte, langue visible',
  K_S_T_EE: 'bouche étirée, dents serrées',
  UW_OW_W: 'lèvres arrondies et projetées',
  EH_AE: 'bouche entrouverte, dents visibles',
};

/* Stretchable glyphs for signs drawn on the band: the path data of the app's
   SVGs (src/icons/detection/*.svg, cul_de_poule.svg), stretched over the
   sign's duration like the app's 512 × 64 atlas entries. Waves are the
   renderer's 20-segment sine arcs. Stroke widths are in px at scale 1. */
const wave = (forward) => {
  let d = '';
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const arch = Math.sin(Math.PI * u) * 9;
    d += `${i ? 'L' : 'M'}${(u * 100).toFixed(1)} ${(forward ? 13 - arch : 4 + arch).toFixed(2)}`;
  }
  return d;
};
const GLYPHS = {
  labial: ['0 0 24 24', 'M3 12h18', 1.8],
  semi: ['0 0 24 24', 'M5 5l14 14M19 5L5 19', 1.8],
  open: ['0 0 24 24', 'M12 20V5M6.5 10.5L12 5l5.5 5.5', 1.65],
  closed: ['0 0 24 24', 'M12 4v15M6.5 13.5L12 19l5.5-5.5', 1.65],
  teeth: ['0 0 24 24', 'M3 7h18M3 17h18M7 7v10M12 7v10M17 7v10', 1.4],
  th: ['0 0 24 24', 'M4 8h7M7.5 5v11c0 2 1.2 3 3 3M14 5v14M14 12c1.2-2 5-2 5 1v6', 1.5],
  breath: ['0 0 24 24', 'M3 8l18-2M3 13l18-2M3 18l18-2', 1.4],
  neutral: ['0 0 24 24', 'M9 4c-2.4 2.1-3.5 4.8-3.5 8s1.1 5.9 3.5 8M15 4c2.4 2.1 3.5 4.8 3.5 8s-1.1 5.9-3.5 8', 1.65],
  reaction: ['0 0 24 24', 'M12 2v20M2 12h20M5 5l14 14M19 5L5 19', 1.5],
  pucker: ['0 0 64 64', 'M10 32C18 21 25 16 32 16C39 16 46 21 54 32C46 43 39 48 32 48C25 48 18 43 10 32ZM21 32H43', 1.7],
  openWave: ['0 0 100 26', wave(false), 2],
  forwardWave: ['0 0 100 26', wave(true), 2],
};

/* The conversion illustration: one sign per written syllable, the dominant
   gesture of the default mapping (src/phonetics/mapping.rs,
   sign_generation.rs dominant_sign). Ranges are [start, end) in the text.
   Pre-authored for this page; the app computes them from the text alone. */
const LANGS = {
  fr: {
    label: 'Français',
    accent: '',
    text: 'Tu pars déjà, Maya ?',
    sylls: [[0, 2, 'semi'], [3, 7, 'labial'], [8, 10, 'teeth'], [10, 12, 'open'], [14, 16, 'labial'], [16, 18, 'open']],
  },
  en: {
    label: 'Anglais',
    accent: 'Accent américain par défaut',
    text: 'Leaving already, Maya?',
    sylls: [[0, 4, 'semi'], [4, 7, 'teeth'], [8, 10, 'forwardWave'], [10, 13, 'openWave'], [13, 15, 'teeth'], [17, 19, 'labial'], [19, 21, 'openWave']],
  },
  es: {
    label: 'Espagnol',
    accent: 'Espagnol d’Amérique latine par défaut',
    text: '¿Ya te vas, Maya?',
    sylls: [[1, 3, 'open'], [4, 6, 'teeth'], [7, 10, 'labial'], [12, 14, 'labial'], [14, 16, 'open']],
  },
};

const THEO = '#33cccc'; // demo cast colour (src/band/demo.js)
const CENTER = 120; // frame the line is centred on
const STRETCH = 2.3; // how far the text is stretched over its duration
const SWEEP_MS = 820; // conversion sweep, linear

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Resolves once the faces the band canvas draws with are really loaded.
 *  document.fonts.ready can resolve before the canvas has asked for Archivo,
 *  which leaves fallback widths in the band's measure cache. */
const bandFonts = () =>
  Promise.all(
    ['500 20px "Archivo Variable"', 'italic 700 20px "Archivo Variable"'].map((f) => document.fonts?.load(f)),
  ).catch(() => {});

/** Drop the band's cached widths and lay it out again (emits 'resize'). */
const remeasure = (band) => {
  band.measureCache.clear();
  band.layout();
};

/* ───────────── band helpers ───────────── */

/** Where each character of a line sits, mirroring Band.drawStretched. */
function textGeometry(band, line) {
  const g = band.lineGeometry(line);
  const font = band.fontText();
  const natural = band.measure(line.text, font);
  const padX = 5 * band.s;
  const sx = clamp(Math.max(4, g.w - padX * 2) / Math.max(1, natural), 0.2, 3.2);
  return { ...g, charX: (i) => g.x1 + padX + band.measure(line.text.slice(0, i), font) * sx };
}

/** Size the line to its stretched text, centred on CENTER, so that the
 *  character label and the whole line stay on screen with the reading bar on
 *  `anchor` (a character index), or with the label + line block centred. */
function fitLine(band, line, anchor = null) {
  const font = band.fontText();
  const natural = Math.max(1, band.measure(line.text, font));
  const { labelW, gap } = band.lineGeometry(line);
  const block = labelW + gap;
  const half = band.width / 2 - 12 * band.s;
  let px = Math.min(natural * STRETCH + 10 * band.s, band.width - 24 * band.s - block);
  if (anchor != null) {
    const u = (band.measure(line.text.slice(0, anchor), font) + band.measure(line.text[anchor], font) / 2) / natural;
    px = Math.min(px, (half - block) / Math.max(u, 0.05), half / Math.max(1 - u, 0.05));
  }
  line.dur = Math.max(12, Math.round(px / band.ppf));
  line.start = Math.round(CENTER - line.dur / 2);
  band.opts.startFrame = line.start - 12;
  band.stopAt = line.start + line.dur + 12;
  band.invalidate();
  return block;
}

/** Frame that centres the label + line block under the reading bar. */
const centredFrame = (band, line, block) => line.start + line.dur / 2 - block / 2 / band.ppf;

function signElement(kind, tag) {
  const el = document.createElement(tag);
  el.className = tag === 'button' ? 'det-sign' : 'det-sign det-sign--static';
  const [vb, d] = GLYPHS[kind];
  el.innerHTML = `<svg viewBox="${vb}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  return el;
}

/** Position a sign like detection_ui.rs: icon 18 px high whose top sits 24 px
 *  above the line body (pucker 22 px, waves on a 26 px box), at least 26 px
 *  wide, centred on its time. */
function placeSign(el, kind, cx, span, bodyY, s) {
  const w = Math.max(span, 26 * s);
  const h = (kind === 'openWave' || kind === 'forwardWave' ? 26 : kind === 'pucker' ? 22 : 18) * s;
  const top = bodyY - 24 * s;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.transform = `translate(${Math.round(cx - w / 2)}px, ${Math.round(top)}px)`;
  if (el.dataset.s !== String(s)) {
    el.dataset.s = String(s);
    el.querySelector('path').style.strokeWidth = `${(GLYPHS[kind][2] * s).toFixed(2)}px`;
  }
  return { x: cx - w / 2, w, top };
}

function glyphIcon(kind, size = 16) {
  const sign = SIGNS[kind];
  if (sign.icon) return `<span class="icon" style="--src: url(/icons/${sign.icon}.svg)"></span>`;
  const d = kind === 'openWave' ? 'M3 8.5Q12 21 21 8.5' : 'M3 15.5Q12 3 21 15.5';
  return `<svg class="det-glyph" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
}

const fiche = (sign) =>
  `Fiche de détection. ${sign.title}. Description : ${sign.description} Sons correspondants : ${sign.sounds}.`;

/* ───────────── the palette, working on a band ───────────── */

function initBench(ctx) {
  const root = document.querySelector('.det-bench');
  const host = document.getElementById('det-band');
  if (!root || !host) return;

  const line = {
    id: 1,
    track: 1,
    start: CENTER - 40,
    dur: 80,
    character: 'THÉO',
    color: THEO,
    kind: 'dialogue',
    text: 'Pas maintenant, Maya.',
    note: '',
    karaoke: false,
  };
  const band = new ctx.Band(host, {
    project: { lines: [line], markers: [], strokes: [] },
    tracks: 2,
    startFrame: CENTER,
    editable: false,
    label: 'Bande de détection, réplique de Théo',
    settings: ctx.settings,
    announce: ctx.announce,
  });

  const layer = document.createElement('div');
  layer.className = 'det-signs';
  host.append(layer);
  const underline = Object.assign(document.createElement('div'), { className: 'det-underline', hidden: true });
  const audition = Object.assign(document.createElement('div'), { className: 'det-audition' });
  const handles = [0, 1].map(() => Object.assign(document.createElement('div'), { className: 'det-sign__handle', hidden: true }));
  layer.append(underline, audition, ...handles);

  const pal = root.querySelector('[data-palette]');
  const items = [...pal.querySelectorAll('.det-pal__item')];
  const tip = root.querySelector('[data-pal-tip]');
  const card = {
    img: root.querySelector('[data-card-img]'),
    title: root.querySelector('[data-card-title]'),
    desc: root.querySelector('[data-card-desc]'),
    sounds: root.querySelector('[data-card-sounds]'),
  };
  new Set(Object.values(SIGNS).map((s) => s.mouth)).forEach((m) => {
    new Image().src = `${LIPS}${m}.png`;
  });

  let signs = []; // { id, kind, u (fraction of the line), el }
  let syncs = []; // { u, el }
  let selected = null;
  let current = 0;
  let presence = 'on';
  let auditionAt = null;
  let auditionTimer = 0;
  let uid = 0;

  const frameOf = (u) => line.start + u * line.dur;
  const uOf = (frame) => (frame - line.start) / line.dur;

  /* ── overlay ── */
  const render = () => {
    const s = band.s;
    const bodyY = band.trackY(line.track);
    const g = band.lineGeometry(line);
    for (const sign of signs) {
      const r = placeSign(sign.el, sign.kind, band.frameToX(frameOf(sign.u)), 0, bodyY, s);
      if (sign === selected) {
        handles.forEach((h, i) => {
          h.hidden = false;
          h.style.width = `${4 * s}px`;
          h.style.height = `${12 * s}px`;
          h.style.transform = `translate(${Math.round(r.x + i * r.w - 2 * s)}px, ${Math.round(r.top + 7 * s)}px)`;
        });
      }
    }
    if (!selected) handles.forEach((h) => (h.hidden = true));
    underline.hidden = presence === 'on';
    if (presence !== 'on') {
      underline.dataset.kind = presence;
      underline.style.setProperty('--dash', `${7 * s}px`);
      underline.style.setProperty('--gap', `${12 * s}px`);
      underline.style.width = `${g.w}px`;
      underline.style.height = `${1.5 * s}px`;
      underline.style.transform = `translate(${g.x1}px, ${g.y + g.h - 3 * s}px)`;
    }
    for (const sync of syncs) {
      const d = 6 * s;
      sync.el.style.width = sync.el.style.height = `${d}px`;
      sync.el.style.transform = `translate(${band.frameToX(frameOf(sync.u)) - d / 2}px, ${g.y + g.h - d - 2 * s}px)`;
    }
    if (auditionAt != null) {
      const f = frameOf(auditionAt);
      const x0 = band.frameToX(f - 2 * ctx.FPS);
      const x1 = band.frameToX(f + 2 * ctx.FPS);
      audition.style.width = `${x1 - x0}px`;
      audition.style.height = `${band.height - band.rulerH}px`;
      audition.style.transform = `translate(${x0}px, ${band.rulerH}px)`;
      audition.style.setProperty('--beep', `${band.frameToX(f) - x0}px`);
    }
  };

  /* ── fiche ── */
  const showCard = (kind) => {
    const sign = SIGNS[kind];
    if (!sign || card.title.textContent === sign.title) return;
    card.title.textContent = sign.title;
    card.desc.textContent = sign.description;
    card.sounds.textContent = sign.sounds;
    card.img.src = `${LIPS}${sign.mouth}.png`;
    card.img.alt = `Bouche dessinée : ${MOUTH_ALT[sign.mouth]}.`;
  };

  /* ── palette: every sign is a Tab stop, arrows move too, hover selects like the app ── */
  const visible = () => items.filter((b) => !b.hidden);
  const quickOf = (b) => (b.dataset.sign ? SIGNS[b.dataset.sign].quick : MARKS[b.dataset.mark].quick);
  const setCurrent = (i, { focus = false, speak = false } = {}) => {
    const vis = visible();
    current = clamp(i, 0, vis.length - 1);
    const item = vis[current];
    for (const b of items) b.toggleAttribute('data-current', b === item);
    tip.textContent = quickOf(item);
    if (item.dataset.sign) showCard(item.dataset.sign);
    if (focus) item.focus();
    if (speak) ctx.announce(quickOf(item));
  };

  // OFF / De dos appear only while the reading bar is on the line; the one
  // already applied is replaced by « Retirer le soulignage ».
  let marksKey = '';
  const updateMarks = () => {
    const on = band.frame > line.start && band.frame < line.start + line.dur;
    const show = !on ? [] : presence === 'off' ? ['back', 'on'] : presence === 'back' ? ['off', 'on'] : ['off', 'back'];
    const key = show.join();
    if (key === marksKey) return;
    marksKey = key;
    const was = visible()[current];
    for (const b of items) if (b.dataset.mark) b.hidden = !show.includes(b.dataset.mark);
    const vis = visible();
    const keep = vis.indexOf(was);
    setCurrent(keep >= 0 ? keep : Math.min(current, vis.length - 1), { focus: document.activeElement === was && keep < 0 });
  };

  /* ── signs on the band ── */
  const sorted = () => [...signs].sort((a, b) => a.u - b.u);
  const select = (sign, { speak = false } = {}) => {
    selected = sign;
    for (const x of signs) {
      x.el.setAttribute('aria-pressed', String(x === sign));
      x.el.tabIndex = 0;
    }
    if (sign) {
      showCard(sign.kind);
      const idx = visible().findIndex((b) => b.dataset.sign === sign.kind);
      if (idx >= 0) setCurrent(idx);
      if (speak) ctx.announce(fiche(SIGNS[sign.kind]));
    }
    render();
  };
  const remove = (sign) => {
    signs = signs.filter((x) => x !== sign);
    sign.el.remove();
    if (selected === sign) selected = null;
  };
  const addSign = (kind, u) => {
    const el = signElement(kind, 'button');
    el.type = 'button';
    el.setAttribute('aria-label', `${SIGNS[kind].title}, symbole de détection`);
    const sign = { id: ++uid, kind, u, el };
    el.addEventListener('click', () => select(sign, { speak: true }));
    el.addEventListener('keydown', (e) => onSignKey(e, sign));
    layer.insertBefore(el, audition);
    signs.push(sign);
    if (signs.length > 24) remove(signs[0]);
    return sign;
  };
  const place = (kind) => {
    band.pause();
    // one sign at a time on the demo band: the new one replaces the last
    for (const x of [...signs]) remove(x);
    const sign = addSign(kind, uOf(band.frame));
    select(sign);
    ctx.announce('Symbole de détection ajouté');
  };

  const auditionSign = (sign) => {
    auditionAt = sign.u;
    render();
    audition.setAttribute('data-on', '');
    clearTimeout(auditionTimer);
    auditionTimer = setTimeout(() => {
      audition.removeAttribute('data-on');
      auditionAt = null;
    }, 1600);
    ctx.announce('Auditionner la détection');
  };

  const addSync = () => {
    const f = Math.round(band.frame);
    if (f <= line.start || f >= line.start + line.dur) {
      ctx.announce('Placez la barre de lecture sur la réplique');
      return;
    }
    const u = uOf(f);
    if (syncs.some((x) => Math.abs(x.u - u) < 1e-6)) return;
    const el = Object.assign(document.createElement('div'), { className: 'det-sync' });
    layer.insertBefore(el, audition);
    syncs.push({ u, el });
    render();
    ctx.announce('Point de synchronisation ajouté');
  };

  function onSignKey(e, sign) {
    const k = e.key;
    if (e.ctrlKey && e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      e.preventDefault();
      sign.u += (k === 'ArrowLeft' ? -1 : 1) / line.dur;
      select(sign);
      ctx.announce('Symbole de détection déplacé');
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      const list = sorted();
      const next = list[clamp(list.indexOf(sign) + (k === 'ArrowLeft' ? -1 : 1), 0, list.length - 1)];
      select(next, { speak: next !== sign });
      next.el.focus();
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      const list = sorted();
      const i = list.indexOf(sign);
      remove(sign);
      ctx.announce('Symbole de détection supprimé');
      const next = list[i + 1] || list[i - 1];
      if (next) {
        select(next);
        next.el.focus();
      } else {
        select(null);
        host.focus();
      }
    } else if (e.ctrlKey && (k === ' ' || e.code === 'Space')) {
      e.preventDefault();
      auditionSign(sign);
    } else if (k === 'Escape') {
      e.preventDefault();
      select(null);
      host.focus();
    }
  }

  const activate = (item) => {
    if (item.dataset.sign) {
      place(item.dataset.sign);
      return;
    }
    presence = item.dataset.mark;
    marksKey = '';
    updateMarks();
    render();
    ctx.announce(MARKS[item.dataset.mark].done);
  };

  items.forEach((b) => b.addEventListener('click', () => activate(b)));
  pal.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.det-pal__item');
    if (b && e.pointerType === 'mouse') setCurrent(visible().indexOf(b));
  });
  // Tab lands on any sign: it becomes the current one, as with the arrows
  pal.addEventListener('focusin', (e) => {
    const b = e.target.closest('.det-pal__item');
    const i = b ? visible().indexOf(b) : -1;
    if (i >= 0 && i !== current) setCurrent(i);
  });
  pal.addEventListener('keydown', (e) => {
    const n = visible().length;
    let next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + n) % n;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      host.focus();
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setCurrent(next, { focus: true, speak: true });
    }
  });

  // Band-level chords run before the band's own Space handling (capture).
  root.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && !e.ctrlKey && e.code === 'KeyD' && root.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        setCurrent(current, { focus: true, speak: true });
        return;
      }
      if (e.target !== host || !(e.key === ' ' || e.code === 'Space') || !e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) addSync();
      else if (selected) auditionSign(selected);
      else ctx.announce('Sélectionnez un signe à auditionner');
    },
    true,
  );

  /* ── layout: the reading bar keeps its place on the line ── */
  const ANCHOR = 11; // the « a » of « nant »
  const relayout = () => {
    const u = uOf(band.frame);
    fitLine(band, line, ANCHOR);
    band.setFrame(frameOf(u));
  };
  band.on('resize', relayout);
  band.on('frame', () => {
    render();
    updateMarks();
  });

  // Opening state: a clean line, the reading bar on the « a » of « nant »,
  // Bouche ouverte highlighted: Entrée or a click places it. Staged again
  // once Archivo is measured, as long as the visitor has not touched anything.
  const opening = [];
  const stage = () => {
    fitLine(band, line, ANCHOR);
    const t = textGeometry(band, line);
    const at = (i) => uOf(band.xToFrame((t.charX(i) + t.charX(i + 1)) / 2));
    if (!signs.length) opening.forEach((i) => addSign('labial', at(i)));
    else signs.forEach((sign, k) => (sign.u = at(opening[k])));
    band.setFrame(frameOf(at(ANCHOR)));
  };
  stage();
  select(null);
  setCurrent(items.findIndex((b) => b.dataset.sign === 'open'));
  const pristine = () => uid === opening.length && signs.length === opening.length && !selected && !syncs.length;
  bandFonts().then(() =>
    requestAnimationFrame(() => {
      const keep = pristine() && !band.playing;
      remeasure(band);
      if (keep) stage();
    }),
  );
}

/* ───────────── Convertir en signes de détection (illustration) ───────────── */

function initLane(ctx) {
  const root = document.querySelector('.det-lane');
  const host = document.getElementById('det-lane-band');
  if (!root || !host) return;

  const line = {
    id: 1,
    track: 1,
    start: CENTER - 40,
    dur: 80,
    character: 'THÉO',
    color: THEO,
    kind: 'dialogue',
    text: LANGS.fr.text,
    note: '',
    karaoke: false,
  };
  const band = new ctx.Band(host, {
    project: { lines: [line], markers: [], strokes: [] },
    tracks: 2,
    startFrame: CENTER,
    editable: false,
    label: 'Bande d’illustration de la conversion, réplique de Théo',
    settings: ctx.settings,
    announce: ctx.announce,
  });
  const layer = document.createElement('div');
  layer.className = 'det-signs';
  host.append(layer);
  const sweep = Object.assign(document.createElement('div'), { className: 'det-sweep' });
  layer.append(sweep);

  const radios = [...root.querySelectorAll('[data-lang]')];
  const convertBtn = root.querySelector('[data-convert]');
  const undoBtn = root.querySelector('[data-undo]');
  const status = root.querySelector('[data-lane-status]');
  const legend = root.querySelector('[data-legend]');
  const accent = root.querySelector('[data-accent]');
  const IDLE = status.textContent.trim();

  let lang = 'fr';
  let generated = []; // { kind, a, b, el }
  let timers = [];

  const say = (text, tone) => {
    status.textContent = text;
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  };

  const render = () => {
    const t = textGeometry(band, line);
    const bodyY = band.trackY(line.track);
    for (const g of generated) {
      const xa = t.charX(g.a);
      const xb = t.charX(g.b);
      placeSign(g.el, g.kind, (xa + xb) / 2, xb - xa, bodyY, band.s);
    }
  };

  // the lane is about the text, not the time: keep label + line centred
  const recentre = () => band.setFrame(centredFrame(band, line, fitLine(band, line)));

  const emptyLegend = () => {
    legend.innerHTML = '<li class="det-legend__empty">Aucun signe pour l’instant&nbsp;: lancez la conversion.</li>';
  };

  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [];
    sweep.getAnimations?.().forEach((a) => a.cancel());
    generated.forEach((g) => g.el.remove());
    generated = [];
    undoBtn.disabled = true;
    emptyLegend();
  };

  const convert = () => {
    if (generated.length) {
      // the app refuses to overwrite a generation (state_detection.rs)
      say('Des signes générés existent déjà sur cette ligne ; régénérez après confirmation');
      ctx.announce(status.textContent);
      return;
    }
    band.pause();
    const data = LANGS[lang];
    const t = textGeometry(band, line);
    legend.innerHTML = '';
    generated = data.sylls.map(([a, b, kind]) => {
      const el = signElement(kind, 'div');
      el.setAttribute('aria-hidden', 'true');
      layer.append(el);
      const li = document.createElement('li');
      li.className = 'det-legend__item';
      li.innerHTML = `<span class="det-legend__syl">${line.text.slice(a, b)}</span><span class="det-legend__sign">${glyphIcon(kind)}${SIGNS[kind].title}</span>`;
      legend.append(li);
      return { kind, a, b, el, li };
    });
    render();
    const n = generated.length;
    const done = `${n} signe(s) de détection généré(s)`;
    undoBtn.disabled = false;

    if (ctx.settings.get().reduceMotion || !sweep.animate) {
      say(done, 'done');
      ctx.announce(done);
      return;
    }
    // One linear read of the text: each sign is drawn as the sweep crosses
    // its syllable, left to right.
    const x0 = t.x1;
    const span = Math.max(1, t.w);
    const top = band.rulerH;
    const h = t.y + t.h - top;
    sweep.style.height = `${h}px`;
    sweep.animate(
      [
        { transform: `translate(${x0}px, ${top}px)`, opacity: 1 },
        { transform: `translate(${x0 + span}px, ${top}px)`, opacity: 1 },
      ],
      { duration: SWEEP_MS, easing: 'linear' },
    );
    for (const g of generated) {
      const xa = t.charX(g.a);
      const xb = t.charX(g.b);
      const delay = ((xa - x0) / span) * SWEEP_MS;
      const duration = Math.max(60, ((xb - xa) / span) * SWEEP_MS);
      g.el.animate(
        [{ clipPath: 'inset(-8px 100% -8px -8px)' }, { clipPath: 'inset(-8px -8px -8px -8px)' }],
        { duration, delay, easing: 'linear', fill: 'backwards' },
      );
      g.li.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: delay + duration, easing: 'linear', fill: 'backwards' });
    }
    say('Conversion…');
    timers.push(
      setTimeout(() => {
        say(done, 'done');
        ctx.announce(done);
      }, SWEEP_MS + 80),
    );
  };

  const undo = () => {
    if (!generated.length) return;
    const n = generated.length;
    clear();
    say(`Génération annulée : les ${n} signes retirés en une fois`);
    ctx.announce(status.textContent);
    convertBtn.focus();
  };

  const setLang = (code, { focus = false } = {}) => {
    if (!LANGS[code]) return;
    lang = code;
    for (const r of radios) {
      const on = r.dataset.lang === code;
      r.setAttribute('aria-checked', String(on));
      if (on && focus) r.focus();
    }
    clear();
    line.text = LANGS[code].text;
    accent.textContent = LANGS[code].accent;
    recentre();
    say(IDLE);
  };

  radios.forEach((r, i) => {
    r.addEventListener('click', () => {
      if (r.dataset.lang === lang) return;
      setLang(r.dataset.lang);
      ctx.announce(`Langue de découpe des syllabes : ${LANGS[lang].label}`);
    });
    r.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = radios[(i + d + radios.length) % radios.length];
      setLang(next.dataset.lang, { focus: true });
      ctx.announce(`Langue de découpe des syllabes : ${LANGS[lang].label}`);
    });
  });
  convertBtn.addEventListener('click', convert);
  undoBtn.addEventListener('click', undo);
  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && generated.length) {
      e.preventDefault();
      undo();
    }
  });

  band.on('resize', recentre);
  band.on('frame', render);
  recentre();
  bandFonts().then(() => requestAnimationFrame(() => remeasure(band)));
}

export function init(ctx) {
  initBench(ctx);
  initLane(ctx);
}
