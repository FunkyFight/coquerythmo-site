// Comic Dubs workspace: a small but real Comic Dubs editor. Model, geometry,
// text fitting and playback timing are ported from the app:
//   src/comic_dubs.rs               document model, clamps, stepped vertex poses
//   src/ui/comic_dubs_workspace.rs  drawing, hit tests, inspector, badges, fit_text
//   src/state.rs                    ordered playback (audio or pose length + pause)
//   src/comic_dubs_export.rs        export formats; text scaled on a 1080p frame
// The site takes no files and exports nothing: the editor works on one blank
// demo page (no artwork is shipped) with fictional bubbles and silent audios.

// The demo page: four empty panels in the work-copy paper and ink. No drawing:
// in the app, this is the visitor's own comic page.
const PAGE_W = 1400;
const PAGE_H = 960;
const GRID_SRC = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 960"><rect width="1400" height="960" fill="#dddddd"/>' +
    '<g fill="#eeeeee" stroke="#344c66" stroke-width="6" stroke-linejoin="round">' +
    '<rect x="28" y="28" width="800" height="442"/><rect x="848" y="28" width="524" height="442"/>' +
    '<rect x="28" y="490" width="560" height="442"/><rect x="608" y="490" width="764" height="442"/></g></svg>',
)}`;
const REF_H = 1080; // comic_dubs_export.rs:544 — bubble sizes are px on a 1080-high frame
const MOBILE_PAGE_W = 680; // phones scroll the page sideways instead of shrinking the text
const NEAR = 12; // near_vertex(): 12 px
const MAX_POINTS = 128; // valid_polygon()
const UNDO_CAP = 20; // state.rs: snapshots are capped at 20
const ACCENT = '#614fe0';
const FIRST = '#4de699';
const EDGE = 'rgba(224,224,235,0.72)';
const GHOST = 'rgba(140,143,163,0.6)';

// The app lists the fonts installed on the computer; the site only has Archivo,
// so the choice is three of its widths.
const FONTS = [
  { id: null, label: 'Police par défaut', stretch: 'normal', css: '100%' },
  { id: 'Archivo étroite', label: 'Archivo étroite', stretch: 'condensed', css: '75%' },
  { id: 'Archivo large', label: 'Archivo large', stretch: 'expanded', css: '125%' },
];

// Bubble polygons of the demo page (normalised 0–1), one or two per panel.
const POLY = {
  A: [[0.1729,0.0469],[0.2251,0.0522],[0.2693,0.0673],[0.2989,0.09],[0.3093,0.1167],[0.2989,0.1434],[0.2693,0.166],[0.2251,0.1811],[0.1729,0.1865],[0.1206,0.1811],[0.0764,0.166],[0.0468,0.1434],[0.0364,0.1167],[0.0468,0.09],[0.0764,0.0673],[0.1206,0.0522]],
  B: [[0.7929,0.0469],[0.8549,0.0522],[0.9075,0.0673],[0.9427,0.09],[0.955,0.1167],[0.9427,0.1434],[0.9075,0.166],[0.8549,0.1811],[0.7929,0.1865],[0.7308,0.1811],[0.6782,0.166],[0.6431,0.1434],[0.6307,0.1167],[0.6431,0.09],[0.6782,0.0673],[0.7308,0.0522]],
  C: [[0.1471,0.5302],[0.1917,0.5354],[0.2295,0.55],[0.2547,0.572],[0.2636,0.5979],[0.2547,0.6238],[0.2295,0.6458],[0.1917,0.6605],[0.1471,0.6656],[0.1026,0.6605],[0.0648,0.6458],[0.0396,0.6238],[0.0307,0.5979],[0.0396,0.572],[0.0648,0.55],[0.1026,0.5354]],
  D: [[0.9771,0.6217],[0.9401,0.6354],[0.9431,0.6553],[0.9142,0.6626],[0.915,0.6929],[0.8724,0.6799],[0.8511,0.699],[0.8231,0.6839],[0.7945,0.6886],[0.7761,0.6737],[0.7322,0.6797],[0.7405,0.6514],[0.7094,0.6417],[0.7235,0.6214],[0.6836,0.6028],[0.7285,0.5896],[0.7232,0.5688],[0.7544,0.5624],[0.7579,0.5364],[0.7961,0.5451],[0.8162,0.5193],[0.8454,0.5411],[0.8745,0.5356],[0.8925,0.5513],[0.9308,0.5489],[0.928,0.5736],[0.9741,0.5798],[0.945,0.6036]],
  D0: [[0.9031,0.6432],[0.8849,0.6513],[0.8863,0.6678],[0.8604,0.6675],[0.8478,0.6783],[0.8273,0.6753],[0.8082,0.6845],[0.7922,0.6732],[0.7668,0.6782],[0.7621,0.6615],[0.7421,0.6563],[0.7428,0.6426],[0.7236,0.6328],[0.7383,0.6202],[0.7339,0.6073],[0.7494,0.5987],[0.7487,0.5826],[0.7739,0.5825],[0.7855,0.57],[0.807,0.5747],[0.8257,0.5679],[0.8421,0.5768],[0.8672,0.572],[0.8722,0.5885],[0.8946,0.5927],[0.8915,0.6074],[0.905,0.6177],[0.896,0.6298]],
};

/* ───────────── small helpers ───────────── */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
const pts = (arr) => arr.map(([x, y]) => ({ x, y }));
const clone = (list) => list.map((p) => ({ x: p.x, y: p.y }));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad2 = (n) => String(n).padStart(2, '0');
// format_time_ms(): m:ss.mmm
const fmtMs = (ms) => {
  const t = Math.max(0, Math.round(ms));
  return `${Math.floor(t / 60000)}:${pad2(Math.floor(t / 1000) % 60)}.${String(t % 1000).padStart(3, '0')}`;
};
const fmtS = (ms) => `${(ms / 1000).toFixed(1)} s`; // the app prints "{:.1} s"
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const unhex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luminance = ([r, g, b]) => (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
// effective_text_color(): dark text on light bubbles, light text on dark ones
const textRgb = (b) => b.textColor || (luminance(b.color) > 0.55 ? [24, 24, 30] : [244, 244, 248]);
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('fr', { granularity: 'grapheme' }) : null;
const graphemes = (s) => (segmenter ? [...segmenter.segment(s)].length : [...s].length);
const cleanText = (s) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500); // clean_name(): no control chars, 500 max
const svgPts = (list, w, h) => list.map((p) => `${(p.x * w).toFixed(1)},${(p.y * h).toFixed(1)}`).join(' ');

/* ───────────── geometry (comic_dubs.rs, comic_dubs_workspace.rs) ───────────── */
function polygonArea(list) {
  let s = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const b = list[(i + 1) % list.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) * 0.5;
}
function validPolygon(list) {
  return (
    list.length >= 3 &&
    list.length <= MAX_POINTS &&
    list.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) &&
    polygonArea(list) > 0.00001
  );
}
function inPolygon(p, poly) {
  let inside = false;
  let prev = poly[poly.length - 1];
  for (const cur of poly) {
    if (cur.y > p.y !== prev.y > p.y && p.x < ((prev.x - cur.x) * (p.y - cur.y)) / (prev.y - cur.y) + cur.x) inside = !inside;
    prev = cur;
  }
  return inside;
}
function bbox(list) {
  const xs = list.map((p) => p.x);
  const ys = list.map((p) => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}
// polygon_text_bounds(): the largest axis-aligned box of a 6×6 grid (6 % inset)
// whose corners and centre are inside the polygon. Cached by geometry: playback
// redraws every frame.
const boxCache = new Map();
function textBox(list) {
  const key = list.map((p) => `${p.x},${p.y}`).join(';');
  let box = boxCache.get(key);
  if (!box) {
    if (boxCache.size > 400) boxCache.clear();
    box = searchTextBox(list);
    boxCache.set(key, box);
  }
  return box;
}
function searchTextBox(list) {
  const { x1: minX, y1: minY, x2: maxX, y2: maxY } = bbox(list);
  const G = 6;
  let best = null;
  let bestArea = -1;
  for (let l = 0; l < G; l++)
    for (let r = l + 1; r <= G; r++)
      for (let t = 0; t < G; t++)
        for (let b = t + 1; b <= G; b++) {
          const x1 = minX + ((maxX - minX) * l) / G;
          const x2 = minX + ((maxX - minX) * r) / G;
          const y1 = minY + ((maxY - minY) * t) / G;
          const y2 = minY + ((maxY - minY) * b) / G;
          const ix = (x2 - x1) * 0.06;
          const iy = (y2 - y1) * 0.06;
          const c = [x1 + ix, y1 + iy, x2 - ix, y2 - iy];
          const area = (c[2] - c[0]) * (c[3] - c[1]);
          if (area <= bestArea) continue;
          const probes = [
            { x: c[0], y: c[1] },
            { x: c[2], y: c[1] },
            { x: c[0], y: c[3] },
            { x: c[2], y: c[3] },
            { x: (c[0] + c[2]) / 2, y: (c[1] + c[3]) / 2 },
          ];
          if (probes.every((p) => inPolygon(p, list))) {
            best = c;
            bestArea = area;
          }
        }
  return best ? { x1: best[0], y1: best[1], x2: best[2], y2: best[3] } : bbox(list);
}
// points_at(): stepped — the last pose at or before `at` wins, no interpolation.
function pointsAt(b, at) {
  for (let i = b.keyframes.length - 1; i >= 0; i--) if (b.keyframes[i].atMs <= at) return b.keyframes[i].points;
  return b.points;
}
const animMs = (b) => (b.keyframes.length ? b.keyframes[b.keyframes.length - 1].atMs : 0);

/* ───────────── text fitting (fit_text, wrap_text) ───────────── */
const mctx = document.createElement('canvas').getContext('2d');
const fitCache = new Map();
const fontOf = (id) => FONTS.find((f) => f.id === id) || FONTS[0];
let project; // assigned below

function measure(line, size, ls, bold) {
  const f = fontOf(project.fontFamily);
  mctx.font = `${bold ? 800 : 600} ${f.stretch} ${size}px "Archivo Variable"`;
  return mctx.measureText(line).width + ls * Math.max(0, graphemes(line) - 1);
}
function wrapText(text, maxChars) {
  const lines = [];
  let cur = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const chars = [...word];
    if (chars.length > maxChars) {
      if (cur) lines.push(cur);
      cur = '';
      for (let i = 0; i < chars.length; i += maxChars) {
        const chunk = chars.slice(i, i + maxChars).join('');
        if (i + maxChars <= chars.length) lines.push(chunk);
        else cur = chunk;
      }
      continue;
    }
    if (cur && [...cur].length + 1 + chars.length > maxChars) {
      lines.push(cur);
      cur = '';
    }
    cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
// Largest size ≤ the bubble's size whose wrapped lines fit the text box.
function fitText(text, bw, bh, preferred, ls, lh, bold) {
  const key = [text, bw | 0, bh | 0, preferred.toFixed(1), ls.toFixed(2), lh, bold, project.fontFamily].join('|');
  const hit = fitCache.get(key);
  if (hit) return hit;
  let out = null;
  for (let font = Math.floor(clamp(preferred, 6, 72)); font >= 6 && !out; font--) {
    const maxChars = Math.max(1, Math.floor(bw / (font * 0.56 + ls)));
    const lines = wrapText(text, maxChars);
    if (lines.length * font * lh <= bh && lines.every((l) => measure(l, font, ls, bold) <= bw)) out = { lines, font };
  }
  if (!out) {
    const font = 6;
    const maxChars = Math.max(1, Math.floor(bw / (font * 0.56 + ls)));
    const maxLines = Math.max(1, Math.floor(bh / (font * lh)));
    const lines = wrapText(text, maxChars);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = [...lines[maxLines - 1]];
      while (last.length >= maxChars) last.pop();
      lines[maxLines - 1] = `${last.join('')}…`;
    }
    out = { lines, font };
  }
  if (fitCache.size > 600) fitCache.clear();
  fitCache.set(key, out);
  return out;
}

/* ───────────── document model (ComicDubsProject) ───────────── */
function newProject() {
  return { pages: [], audios: [], activePage: null, bubbleGapMs: 250, pageGapMs: 250, fontFamily: null, defaultFontSize: 24, nextId: 1 };
}
function addPage(p, fileName, src, width, height) {
  const id = p.nextId++;
  p.pages.push({ id, fileName, src, width: Math.max(1, width), height: Math.max(1, height), bubbles: [] });
  p.activePage = id;
  return id;
}
function makeBubble(p, list, extra = {}) {
  return {
    id: p.nextId++,
    points: list,
    text: '',
    color: [255, 255, 255, 255],
    fontSize: p.defaultFontSize,
    letterSpacing: 0,
    lineSpacing: 1.18,
    textColor: null,
    align: 'center',
    bold: false,
    strike: false,
    underline: false,
    audioId: null,
    keyframes: [],
    ...extra,
  };
}
// The demo: four bubbles already dubbed, one audio left for a new bubble.
// Audio files are named but silent: the site plays no sound of its own.
function demoProject() {
  const p = newProject();
  p.fontFamily = 'Archivo étroite';
  addPage(p, 'planche-demo.png', GRID_SRC, PAGE_W, PAGE_H);
  const page = p.pages[0];
  const audio = (fileName, durationMs) => {
    const id = p.nextId++;
    p.audios.push({ id, fileName, durationMs, url: null });
    return id;
  };
  const a1 = audio('maya-prise-12.flac', 2100);
  const a2 = audio('theo-gorge.flac', 2400);
  const a3 = audio('maya-action.flac', 1600);
  const a4 = audio('theo-cocorico.flac', 2800);
  audio('maya-on-la-garde.flac', 1400);
  page.bubbles.push(makeBubble(p, pts(POLY.A), { text: 'Bon. Prise 12. Cette fois, avec le cœur !', fontSize: 40, audioId: a1 }));
  page.bubbles.push(makeBubble(p, pts(POLY.B), { text: 'J’ai un peu la gorge qui gratte…', fontSize: 40, audioId: a2 }));
  page.bubbles.push(makeBubble(p, pts(POLY.C), { text: 'Silence, on enregistre… Action !', fontSize: 40, audioId: a3 }));
  page.bubbles.push(
    makeBubble(p, pts(POLY.D), {
      text: 'COCORICO !',
      fontSize: 72,
      bold: true,
      letterSpacing: 1,
      lineSpacing: 1.6,
      color: [27, 26, 36, 255],
      textColor: [255, 225, 77],
      audioId: a4,
      keyframes: [
        { atMs: 0, points: pts(POLY.D0) },
        { atMs: 450, points: pts(POLY.D) },
      ],
    }),
  );
  return p;
}

export function init(ctx) {
  const root = document.querySelector('[data-cd]');
  if (!root) return;
  const $ = (sel, el = root) => el.querySelector(sel);
  const $$ = (sel, el = root) => [...el.querySelectorAll(sel)];
  const announce = (text, opts) => ctx.announce(text, opts);
  const mqMobile = window.matchMedia('(max-width: 720px)');
  const coarse = window.matchMedia('(pointer: coarse)');

  project = demoProject();
  const ui = {
    tool: 'select',
    // desktop opens on bubble 2 so the inspector shows its options; phones start
    // on the left of the page, where that bubble is out of view
    selected: mqMobile.matches ? null : project.pages[0].bubbles[1].id,
    draft: [],
    hover: null,
    cursor: { x: 0.5, y: 0.5 },
    kb: false,
    drag: null,
    textEdit: null,
    mediaTab: 'audios', // the site opens on Audios: they are what you drag onto bubbles
    audioDrag: null,
    dropTarget: null,
    handle: 0, // roving vertex handle
  };
  let pb = null; // playback
  let vx = null; // vertex animation editor
  const history = { undo: [], redo: [] };

  /* ── DOM ── */
  const body = $('[data-cd-body]');
  const main = {
    stage: $('[data-cd-stage]'),
    box: $('[data-cd-page-box]'),
    img: $('[data-cd-page-img]'),
    svg: $('[data-cd-svg]'),
    layer: $('[data-cd-layer]'),
    geo: { w: 0, h: 0 },
  };
  const vxv = {
    el: $('[data-cd-vx-panel]'),
    stage: $('[data-cd-vx-stage]'),
    box: $('[data-cd-vx-box]'),
    img: $('[data-cd-vx-img]'),
    svg: $('[data-cd-vx-svg]'),
    layer: $('[data-cd-vx-layer]'),
    range: $('[data-cd-vx-range]'),
    markers: $('[data-cd-vx-markers]'),
    playhead: $('[data-cd-vx-playhead]'),
    now: $('[data-cd-vx-now]'),
    dur: $('[data-cd-vx-dur]'),
    geo: { w: 0, h: 0 },
  };
  const empty = $('[data-cd-empty]');
  const toolHint = $('[data-cd-tool-hint]');
  const playHint = $('[data-cd-play-hint]');
  const playBtn = $('[data-cd-play]');
  const track = $('[data-cd-track]');
  const insp = {
    empty: $('[data-cd-insp-empty]'),
    note: $('[data-cd-insp-note]'),
    form: $('[data-cd-insp-form]'),
    name: $('[data-cd-sel-name]'),
    audio: $('[data-cd-sel-audio]'),
    text: $('[data-cd-text]'),
    bubbleColor: $('[data-cd-color="bubble"]'),
    textColor: $('[data-cd-color="text"]'),
    clear: $('[data-cd-transparent]'),
  };
  const toastEl = $('[data-cd-toast]');
  const dragChip = $('[data-cd-drag]');

  /* ── lookups ── */
  const pageIndex = () => project.pages.findIndex((p) => p.id === project.activePage);
  const activePage = () => project.pages.find((p) => p.id === project.activePage) || null;
  const findBubble = (id) => {
    for (const page of project.pages) {
      const b = page.bubbles.find((x) => x.id === id);
      if (b) return b;
    }
    return null;
  };
  const pageOf = (b) => project.pages.find((p) => p.bubbles.includes(b));
  const selected = () => (ui.selected == null ? null : findBubble(ui.selected));
  const audioOf = (b) => (b?.audioId == null ? null : project.audios.find((a) => a.id === b.audioId) || null);
  const orderOf = (b) => (pageOf(b)?.bubbles.indexOf(b) ?? -1) + 1;
  const bubbleName = (b) => `Bulle ${orderOf(b)}`;

  /* ── history (Ctrl+Z / Ctrl+Maj+Z, as in the app; Ctrl+Y too) ── */
  const snap = () => JSON.stringify(project);
  function commit(before) {
    if (before === snap()) return false;
    history.undo.push(before);
    if (history.undo.length > UNDO_CAP) history.undo.shift();
    history.redo.length = 0;
    if (pb) stopPlayback(false); // comic_dubs_commit(): editing stops playback
    return true;
  }
  function restore(from, to, label) {
    const s = from.pop();
    if (!s) return announce(label === 'Annulé' ? 'Rien à annuler' : 'Rien à rétablir');
    to.push(snap());
    project = JSON.parse(s);
    fitCache.clear();
    if (!activePage()) project.activePage = project.pages[0]?.id ?? null;
    if (ui.selected != null && !findBubble(ui.selected)) ui.selected = null;
    if (vx && !findBubble(vx.id)) closeVx(false);
    if (vx && !findBubble(vx.id).keyframes.some((k) => k.atMs === vx.kf)) vx.kf = null;
    render();
    announce(label);
  }
  const undo = () => restore(history.undo, history.redo, 'Annulé');
  const redo = () => restore(history.redo, history.undo, 'Rétabli');

  /* ── toast (the app's short messages) ── */
  let toastTimer = 0;
  function toast(text, seconds = 3.5) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), seconds * 1000);
    announce(text);
  }

  /* ───────────── timing (state.rs start_comic_dubs_bubble) ───────────── */
  function laterPageWithBubbles(index) {
    for (let i = index + 1; i < project.pages.length; i++) if (project.pages[i].bubbles.length) return i;
    return -1;
  }
  function nextPosition(pi, bi) {
    const page = project.pages[pi];
    if (!page) return null;
    if (bi + 1 < page.bubbles.length) return { pi, bi: bi + 1, gap: project.bubbleGapMs };
    const next = laterPageWithBubbles(pi);
    return next === -1 ? null : { pi: next, bi: 0, gap: project.pageGapMs };
  }
  // Each bubble lasts as long as its audio or its last pose, then the pause
  // ("Durée des bulles", or "Durée des pages" before the next page).
  function pageSteps(pi) {
    const page = project.pages[pi];
    const steps = [];
    let t = 0;
    page.bubbles.forEach((b, i) => {
      const audio = audioOf(b);
      const content = Math.max(audio ? audio.durationMs : 0, animMs(b));
      const gap = nextPosition(pi, i)?.gap ?? 0;
      steps.push({ b, i, audio, content, gap, start: t });
      t += content + gap;
    });
    return { steps, total: t };
  }

  /* ───────────── layout of a page view ───────────── */
  function layoutView(view, page) {
    const mobile = mqMobile.matches;
    let w;
    let h;
    if (mobile) {
      const avail = view.stage.clientWidth - 24;
      w = Math.floor(Math.max(avail, MOBILE_PAGE_W));
      h = Math.floor((w * page.height) / page.width);
      Object.assign(view.box.style, { left: '', top: '', width: `${w}px`, height: `${h}px` });
    } else {
      const aw = view.stage.clientWidth - 24;
      const ah = view.stage.clientHeight - 24;
      const s = Math.max(0, Math.min(aw / page.width, ah / page.height));
      w = Math.floor(page.width * s);
      h = Math.floor(page.height * s);
      Object.assign(view.box.style, {
        left: `${Math.round(12 + (aw - w) / 2)}px`,
        top: `${Math.round(12 + (ah - h) / 2)}px`,
        width: `${w}px`,
        height: `${h}px`,
      });
    }
    view.geo = { w, h };
    return w > 20 && h > 20;
  }
  const localPoint = (e, box) => {
    const r = box.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1), r };
  };
  function vertexAt(list, e, r) {
    for (let i = 0; i < list.length; i++) {
      const dx = r.left + list[i].x * r.width - e.clientX;
      const dy = r.top + list[i].y * r.height - e.clientY;
      if (Math.hypot(dx, dy) <= NEAR) return i;
    }
    return -1;
  }
  function bubbleAt(page, p) {
    for (let i = page.bubbles.length - 1; i >= 0; i--) if (inPolygon(p, page.bubbles[i].points)) return page.bubbles[i];
    return null;
  }

  /* ───────────── SVG drawing ───────────── */
  function textSvg(b, list, w, h, caret) {
    const text = caret ? `${b.text}|` : b.text;
    if (!text.trim()) return '';
    const tb = textBox(list);
    const box = { x: tb.x1 * w + 6, y: tb.y1 * h, w: Math.max(1, (tb.x2 - tb.x1) * w - 12), h: (tb.y2 - tb.y1) * h };
    const k = h / REF_H;
    const ls = b.letterSpacing * k;
    const { lines, font } = fitText(text, box.w, box.h, b.fontSize * k, ls, b.lineSpacing, b.bold);
    const lineH = font * b.lineSpacing;
    const total = lineH * lines.length;
    const f = fontOf(project.fontFamily);
    const anchor = { left: 'start', center: 'middle', right: 'end' }[b.align];
    const [r, g, bl] = textRgb(b);
    let s = `<g fill="rgb(${r} ${g} ${bl})" font-size="${font}" font-weight="${b.bold ? 800 : 600}" letter-spacing="${ls.toFixed(2)}" text-anchor="${anchor}" style="font-stretch:${f.css}">`;
    lines.forEach((line, i) => {
      const y = box.y + (box.h - total) / 2 + i * lineH;
      const x = b.align === 'left' ? box.x : b.align === 'center' ? box.x + box.w / 2 + ls / 2 : box.x + box.w + ls;
      s += `<text x="${x.toFixed(1)}" y="${(y + lineH / 2).toFixed(1)}" dominant-baseline="central">${esc(line)}</text>`;
      if (b.strike || b.underline) {
        const lw = Math.min(measure(line, font, ls, b.bold), box.w);
        const x0 = b.align === 'left' ? box.x : b.align === 'center' ? box.x + (box.w - lw) / 2 : box.x + box.w - lw;
        const th = Math.max(1, font * 0.07).toFixed(1);
        if (b.strike) s += `<rect x="${x0.toFixed(1)}" y="${(y + lineH * 0.48).toFixed(1)}" width="${lw.toFixed(1)}" height="${th}"/>`;
        if (b.underline) s += `<rect x="${x0.toFixed(1)}" y="${(y + lineH * 0.78).toFixed(1)}" width="${lw.toFixed(1)}" height="${th}"/>`;
      }
    });
    return `${s}</g>`;
  }
  function bubbleSvg(b, list, w, h, { selected: on = false, showText = true, caret = false } = {}) {
    const poly = svgPts(list, w, h);
    const fill = b.color[3] ? `rgb(${b.color[0]} ${b.color[1]} ${b.color[2]})` : 'none';
    let s = `<polygon points="${poly}" fill="${fill}"/>`;
    s += `<polygon points="${poly}" fill="none" stroke="${on ? ACCENT : EDGE}" stroke-width="${on ? 2.5 : 1}" stroke-linejoin="round"/>`;
    if (showText) s += textSvg(b, list, w, h, caret);
    return s;
  }
  const drawing = () => ui.tool === 'bubble' || ui.draft.length > 0;
  function draftSvg(w, h) {
    const d = ui.draft;
    const X = (p) => (p.x * w).toFixed(1);
    const Y = (p) => (p.y * h).toFixed(1);
    let s = '';
    const aim = ui.kb ? ui.cursor : ui.hover;
    if (d.length > 1) s += `<polyline points="${svgPts(d, w, h)}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round"/>`;
    if (d.length >= 3) s += `<line x1="${X(d[d.length - 1])}" y1="${Y(d[d.length - 1])}" x2="${X(d[0])}" y2="${Y(d[0])}" stroke="${ACCENT}" stroke-opacity="0.45"/>`;
    if (d.length && aim && drawing()) s += `<line x1="${X(d[d.length - 1])}" y1="${Y(d[d.length - 1])}" x2="${X(aim)}" y2="${Y(aim)}" stroke="#fff" stroke-opacity="0.7" stroke-dasharray="4 4"/>`;
    const closable = d.length >= 3 && aim && Math.hypot((aim.x - d[0].x) * w, (aim.y - d[0].y) * h) <= NEAR;
    d.forEach((p, i) => {
      const r = i === 0 && closable ? 8 : 5;
      s += `<circle cx="${X(p)}" cy="${Y(p)}" r="${r}" fill="${i === 0 ? FIRST : ACCENT}" stroke="#fff" stroke-width="1"/>`;
    });
    if (ui.kb && drawing() && document.activeElement === main.stage) {
      const cx = ui.cursor.x * w;
      const cy = ui.cursor.y * h;
      s += `<g stroke-width="2" fill="none"><circle cx="${cx}" cy="${cy}" r="9" stroke="#fff"/><circle cx="${cx}" cy="${cy}" r="9" stroke="${ACCENT}" stroke-dasharray="3 3"/>`;
      s += `<path d="M${cx - 18} ${cy}h8M${cx + 10} ${cy}h8M${cx} ${cy - 18}v8M${cx} ${cy + 10}v8" stroke="#fff"/></g>`;
    }
    return s;
  }

  /* keyed layer of real buttons (badges, handles) so focus survives renders */
  function syncLayer(layer, items) {
    const map = (layer._map ||= new Map());
    const keep = new Set(items.map((it) => it.key));
    for (const [key, el] of map) {
      if (keep.has(key)) continue;
      const hadFocus = el === document.activeElement;
      el.remove();
      map.delete(key);
      if (hadFocus) (layer === main.layer ? main.stage : vxv.range).focus({ preventScroll: true });
    }
    items.forEach((it, i) => {
      let el = map.get(it.key);
      if (!el) {
        el = it.create();
        map.set(it.key, el);
      }
      it.update(el);
      if (layer.children[i] !== el) layer.insertBefore(el, layer.children[i] || null);
    });
  }
  function badgeItem(b, i, list, w, h) {
    const audio = audioOf(b);
    const bw = audio ? 50 : 28;
    const bb = bbox(list);
    const x = clamp(bb.x2 * w - bw, 2, Math.max(2, w - bw - 2));
    const y = clamp(bb.y1 * h + 4, 2, Math.max(2, h - 26));
    return {
      key: `b${b.id}`,
      create() {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cd-badge tnum';
        el.dataset.bubble = String(b.id);
        return el;
      },
      update(el) {
        el.style.left = `${x.toFixed(1)}px`;
        el.style.top = `${y.toFixed(1)}px`;
        el.innerHTML = `${i + 1}${audio ? '<span class="cd-badge__bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' : ''}`;
        el.setAttribute('aria-pressed', String(ui.selected === b.id));
        el.classList.toggle('is-drop', ui.dropTarget === b.id);
        el.classList.toggle('is-passive', drawing()); // clicks go to the page while drawing
        el.setAttribute(
          'aria-label',
          `Bulle ${i + 1}${b.text.trim() ? ` : ${b.text.trim()}` : ', sans texte'}${audio ? `, audio ${audio.fileName}` : ''}`,
        );
      },
    };
  }
  function handleItem(b, k, p, w, h, n, view) {
    return {
      key: `h${b.id}:${k}`,
      create() {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cd-handle';
        el.dataset.vertex = String(k);
        el.dataset.view = view;
        return el;
      },
      update(el) {
        el.style.left = `${(p.x * w).toFixed(1)}px`;
        el.style.top = `${(p.y * h).toFixed(1)}px`;
        el.setAttribute(
          'aria-label',
          `Sommet ${k + 1} sur ${n}${view === 'vx' ? `, pose à ${fmtMs(vx?.at ?? 0)}` : ''}. Flèches : déplacer. Page précédente ou suivante : autre sommet.`,
        );
      },
    };
  }

  /* ───────────── render: main page ───────────── */
  function renderStage() {
    const page = activePage();
    empty.hidden = !!page;
    main.box.hidden = !page;
    if (!page) {
      main.svg.innerHTML = '';
      syncLayer(main.layer, []);
      main.stage.setAttribute('aria-label', 'Aucune page');
      return;
    }
    if (main.img.dataset.src !== page.src) {
      main.img.src = page.src;
      main.img.width = page.width;
      main.img.height = page.height;
      main.img.dataset.src = page.src;
    }
    if (!layoutView(main, page)) return;
    const { w, h } = main.geo;
    main.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    main.stage.setAttribute('aria-label', `Planche ${pageIndex() + 1} : ${page.fileName}, ${page.bubbles.length} bulle(s)`);
    const playing = pb && project.pages[pb.pi]?.id === page.id;
    const items = [];
    let s = '';
    page.bubbles.forEach((b, i) => {
      let list = b.points;
      let showBg = true;
      let showText = true;
      if (playing) {
        // bubble_playback_state(): unread bubbles stay blank, read ones show their text
        const revealed = i < pb.visible;
        const hasText = b.text.trim() !== '';
        showBg = !revealed || hasText;
        showText = revealed && hasText;
        list = pointsAt(b, i + 1 < pb.visible ? Infinity : i + 1 === pb.visible ? pb.elapsed : 0);
      } else if (ui.drag?.id === b.id && ui.drag.points) {
        list = ui.drag.points;
      }
      if (!showBg) return;
      s += bubbleSvg(b, list, w, h, { selected: !playing && ui.selected === b.id, showText, caret: !playing && ui.textEdit === b.id });
      if (!playing) items.push(badgeItem(b, i, list, w, h));
    });
    const sel = selected();
    if (!playing && sel && !ui.draft.length && page.bubbles.includes(sel)) {
      const list = (ui.drag?.id === sel.id && ui.drag.points) || sel.points;
      list.forEach((p, k) => items.push(handleItem(sel, k, p, w, h, list.length, 'main')));
    }
    s += draftSvg(w, h);
    main.svg.innerHTML = s;
    syncLayer(main.layer, items);
    main.box.classList.toggle('is-bubble', drawing());
  }

  /* ───────────── render: header, tools ───────────── */
  function renderHead() {
    const i = pageIndex();
    const n = project.pages.length;
    $('[data-cd-page-label]').textContent = `Page ${i + 1}/${n}`;
    $('[data-cd-page="-1"]').disabled = i <= 0;
    $('[data-cd-page="1"]').disabled = i < 0 || i >= n - 1;
    playHint.textContent = coarse.matches
      ? pb
        ? 'Lecture en cours. Touchez Pause pour arrêter.'
        : 'Touchez Lecture pour lire le Comic Dub'
      : pb
        ? 'Lecture en cours. Espace pour arrêter.'
        : 'Espace pour lire le Comic Dub';
    playHint.classList.toggle('is-playing', !!pb);
    const icon = $('[data-cd-play-icon]');
    icon.style.setProperty('--src', `url(/icons/${pb ? 'pause' : 'resume'}.svg)`);
    playBtn.setAttribute('aria-label', pb ? 'Pause' : 'Lecture');
    playBtn.dataset.tip = pb ? 'Pause' : 'Lecture';
    playBtn.setAttribute('aria-pressed', String(!!pb));
  }
  function renderTools() {
    $$('[data-cd-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cdTool === ui.tool)));
    let hint;
    let draft = false;
    if (!activePage()) hint = 'Aucune page : rétablissez la planche de démonstration.';
    else if (pb) hint = 'Lecture : les bulles apparaissent dans l’ordre de lecture, au rythme de leurs audios.';
    else if (ui.draft.length) {
      hint = ui.kb
        ? 'Flèches : viseur, Espace : sommet, Entrée : fermer la bulle, Échap pour annuler'
        : 'Cliquez pour ajouter un sommet, cliquez le premier point pour fermer, Échap pour annuler';
      draft = true;
    } else if (ui.tool === 'bubble') {
      hint = ui.kb ? 'Flèches : viseur, Espace : premier sommet, Échap : retour à la sélection' : 'Cliquez sur la page pour poser le premier sommet.';
      draft = true;
    } else if (selected()) hint = 'Glissez la bulle ou ses sommets, double-clic : texte, clic droit : écouter son audio';
    else if (mqMobile.matches) hint = 'Faites glisser la planche pour la parcourir, touchez une bulle pour la modifier';
    else hint = 'Cliquez une bulle pour la modifier, Ctrl + clic sur la page pour commencer une bulle';
    toolHint.textContent = hint;
    toolHint.classList.toggle('is-draft', draft);
  }

  /* ───────────── render: timeline ───────────── */
  let tlSig = '';
  const wave = (seed) => {
    let s = '';
    let v = seed * 9301 + 49297;
    for (let i = 0; i < 40; i++) {
      v = (v * 9301 + 49297) % 233280;
      const a = 0.25 + (v / 233280) * 0.75;
      s += `<rect x="${i * 2 + 0.3}" y="${(5 - a * 5).toFixed(2)}" width="1.2" height="${(a * 10).toFixed(2)}" rx="0.5"/>`;
    }
    return `<svg viewBox="0 0 80 10" preserveAspectRatio="none" aria-hidden="true" fill="currentColor">${s}</svg>`;
  };
  function renderTimeline() {
    const pi = pageIndex();
    const page = project.pages[pi];
    $('[data-cd-rule]').textContent = `Durée des bulles ${project.bubbleGapMs} ms, durée des pages ${project.pageGapMs} ms`;
    if (!page || !page.bubbles.length) {
      const sig = page ? 'none' : 'nopage';
      if (tlSig !== sig) {
        tlSig = sig;
        track.innerHTML = `<p class="cd-timeline__none">${page ? 'Aucune bulle sur cette page : dessinez-en une.' : 'Aucune page.'}</p>`;
      }
      $('[data-cd-total]').textContent = fmtMs(0);
      return;
    }
    const { steps, total } = pageSteps(pi);
    $('[data-cd-total]').textContent = fmtMs(total);
    const sig = JSON.stringify([ui.selected, steps.map((s) => [s.b.id, s.content, s.gap, s.audio?.id, s.b.keyframes.map((k) => k.atMs)])]);
    if (sig !== tlSig) {
      tlSig = sig;
      track.innerHTML = steps
        .map((st) => {
          const len = Math.max(1, st.content + st.gap);
          const gapPct = Math.min(70, (st.gap / len) * 100);
          const poses = st.b.keyframes
            .map((k) => `<span class="cd-tl__pose" style="left:${((k.atMs / len) * 100).toFixed(2)}%" aria-hidden="true"></span>`)
            .join('');
          const label = `Bulle ${st.i + 1} : ${st.audio ? `audio ${st.audio.fileName}, ${fmtS(st.audio.durationMs)}` : 'sans audio'}${
            st.b.keyframes.length ? `, ${st.b.keyframes.length} poses de sommets sur ${animMs(st.b)} ms` : ''
          }${st.gap ? `, puis ${st.gap} ms ${st.i + 1 < page.bubbles.length ? 'de pause' : 'avant la page suivante'}` : ', fin de la lecture'}`;
          return `<button class="cd-tl${st.audio ? '' : ' is-mute'}" type="button" style="flex-grow:${len}" data-bubble="${st.b.id}" aria-label="${esc(label)}"${
            ui.selected === st.b.id ? ' aria-current="true"' : ''
          } data-tip="${esc(label)}"><span class="cd-tl__fill">${st.audio ? wave(st.audio.id) : ''}<span class="cd-tl__label"><b>${st.i + 1}</b>${fmtS(st.content)}</span></span><span class="cd-tl__gap" style="width:${gapPct}%"></span>${poses}</button>`;
        })
        .join('') + '<span class="cd-timeline__playhead" data-cd-tl-head hidden></span>';
    }
    const head = track.querySelector('[data-cd-tl-head]');
    const playing = pb && pb.pi === pi;
    head.hidden = !playing;
    track.querySelectorAll('.cd-tl').forEach((el, i) => el.classList.toggle('is-now', !!playing && i === pb.bi));
    if (playing) {
      const st = steps[pb.bi];
      const t = st.start + Math.min(pb.elapsed, st.content + st.gap);
      head.style.left = `${((t / Math.max(1, total)) * 100).toFixed(3)}%`;
    }
  }

  /* ───────────── render: inspector ───────────── */
  const STEPS = {
    size: { key: 'fontSize', d: 2, min: 6, max: 72, fmt: (v) => `${Math.round(v)} px`, name: 'Taille du texte' },
    letter: { key: 'letterSpacing', d: 0.5, min: 0, max: 12, fmt: (v) => `${v.toFixed(1)} px`, name: 'Espacement lettres' },
    line: { key: 'lineSpacing', d: 0.1, min: 0.8, max: 2, fmt: (v) => `${v.toFixed(1)}×`, name: 'Interligne' },
  };
  function renderInspector() {
    const b = selected();
    insp.empty.hidden = !!b;
    insp.form.hidden = !b;
    if (!b) {
      insp.note.innerHTML =
        'Double-cliquez une bulle pour modifier son texte. Glissez un audio de l’onglet <strong>Audios</strong> sur une bulle pour l’y associer.';
      return;
    }
    const page = pageOf(b);
    const audio = audioOf(b);
    insp.name.textContent = `Bulle sélectionnée : ${orderOf(b)} sur ${page.bubbles.length}`;
    insp.audio.textContent = audio ? `Audio : ${audio.fileName}` : 'Audio : aucun';
    if (document.activeElement !== insp.text) insp.text.value = b.text;
    for (const [name, def] of Object.entries(STEPS)) {
      const row = $(`[data-cd-step="${name}"]`);
      const v = b[def.key];
      row.querySelector('output').textContent = def.fmt(v);
      row.querySelector('[data-dir="-1"]').disabled = v <= def.min + 1e-6;
      row.querySelector('[data-dir="1"]').disabled = v >= def.max - 1e-6;
    }
    insp.bubbleColor.value = hex(b.color);
    insp.textColor.value = hex(textRgb(b));
    insp.clear.checked = b.color[3] === 0;
    insp.bubbleColor.closest('.cd-color').classList.toggle('is-clear', b.color[3] === 0);
    $$('[data-cd-style]').forEach((el) => el.setAttribute('aria-pressed', String(!!b[el.dataset.cdStyle])));
    $$('[data-cd-align]').forEach((el) => {
      const on = b.align === el.dataset.cdAlign;
      el.setAttribute('aria-checked', String(on));
    });
    const idx = page.bubbles.indexOf(b);
    $('[data-cd-order="-1"]').disabled = idx <= 0;
    $('[data-cd-order="1"]').disabled = idx >= page.bubbles.length - 1;
  }

  /* ───────────── render: media explorer ───────────── */
  let mediaSig = '';
  const ICON = {
    up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4"/></svg>',
    down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4"/></svg>',
    x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    grip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" stroke-width="2.4"/></svg>',
  };
  function renderMedia() {
    $$('[data-cd-media]').forEach((t) => {
      const on = t.dataset.cdMedia === ui.mediaTab;
      t.setAttribute('aria-selected', String(on));
    });
    $('#cd-list-images').hidden = ui.mediaTab !== 'images';
    $('#cd-list-audios').hidden = ui.mediaTab !== 'audios';
    const images = ui.mediaTab === 'images';
    $('[data-cd-media-hint]').textContent = images
      ? 'Dans l’app, vos planches arrivent ici (PNG, JPG, WEBP…).'
      : 'Glissez un audio sur une bulle pour l’y associer. Dans l’app, vos enregistrements arrivent ici.';

    const assigned = new Map();
    project.pages.forEach((p) => p.bubbles.forEach((b, i) => b.audioId != null && assigned.set(b.audioId, `bulle ${i + 1}`)));
    const sig = JSON.stringify([project.activePage, project.pages.map((p) => [p.id, p.fileName]), project.audios.map((a) => [a.id, assigned.get(a.id)])]);
    if (sig === mediaSig) return;
    mediaSig = sig;
    const focusKey = document.activeElement?.closest?.('[data-cd-row]')?.dataset.cdRow;
    const focusAct = document.activeElement?.dataset?.act;
    const n = project.pages.length;
    $('[data-cd-pages]').innerHTML = n
      ? project.pages
          .map(
            (p, i) => `<li class="cd-row${p.id === project.activePage ? ' is-on' : ''}" data-cd-row="p${p.id}">
          <button class="cd-row__main" type="button" data-act="page" data-id="${p.id}"${p.id === project.activePage ? ' aria-current="true"' : ''}>
            <span class="cd-row__name">${esc(p.fileName)}</span><span class="cd-row__meta tnum">${p.width}×${p.height}, ${p.bubbles.length} bulle(s)</span>
          </button>
          <button class="cd-row__btn" type="button" data-act="page-up" data-id="${p.id}" aria-label="Monter ${esc(p.fileName)}" data-tip="Monter la page"${i === 0 ? ' disabled' : ''}>${ICON.up}</button>
          <button class="cd-row__btn" type="button" data-act="page-down" data-id="${p.id}" aria-label="Descendre ${esc(p.fileName)}" data-tip="Descendre la page"${i === n - 1 ? ' disabled' : ''}>${ICON.down}</button>
          <button class="cd-row__btn" type="button" data-act="page-remove" data-id="${p.id}" aria-label="Retirer ${esc(p.fileName)}" data-tip="Retirer la page">${ICON.x}</button>
        </li>`,
          )
          .join('')
      : '<li class="cd-media__empty">Aucune image.</li>';
    $('[data-cd-audios]').innerHTML = project.audios.length
      ? project.audios
          .map(
            (a) => `<li class="cd-row cd-row--audio" data-cd-row="a${a.id}">
          <span class="cd-row__btn cd-row__grip" data-grip="${a.id}" aria-hidden="true">${ICON.grip}</span>
          <button class="cd-row__main" type="button" data-act="audio" data-id="${a.id}" aria-label="${esc(a.fileName)}; glisser sur une bulle, ou activer pour l’associer à la bulle sélectionnée">
            <span class="cd-row__name">${esc(a.fileName)}</span><span class="cd-row__meta tnum">${fmtS(a.durationMs)}${assigned.has(a.id) ? `, ${assigned.get(a.id)}` : ''}, muet</span>
          </button>
          <button class="cd-row__btn" type="button" data-act="audio-remove" data-id="${a.id}" aria-label="Retirer ${esc(a.fileName)}" data-tip="Retirer l’audio">${ICON.x}</button>
        </li>`,
          )
          .join('')
      : '<li class="cd-media__empty">Aucun audio.</li>';
    if (focusKey) root.querySelector(`[data-cd-row="${focusKey}"] [data-act="${focusAct}"]:not([disabled])`)?.focus({ preventScroll: true });
  }

  /* ───────────── render: the Actions menu ───────────── */
  function renderActions() {
    const b = selected();
    const item = $('[data-cd-animate]');
    item.disabled = !b;
    $('[data-cd-animate-hint]').textContent = b ? bubbleName(b) : 'Sélectionnez une bulle';
  }

  function render() {
    renderMedia();
    renderHead();
    renderTools();
    renderStage();
    renderTimeline();
    renderInspector();
    renderActions();
    if (vx) renderVx();
  }

  /* ───────────── selection, tools, drafts ───────────── */
  function select(id, { say = true } = {}) {
    if (ui.selected === id) return;
    ui.selected = id;
    ui.handle = 0;
    render();
    const b = selected();
    if (b && say) announce(`${bubbleName(b)} sélectionnée${b.text.trim() ? ` : ${b.text.trim()}` : ', sans texte'}`);
  }
  function setTool(tool) {
    if (pb) stopPlayback(false);
    ui.tool = tool;
    if (tool === 'select' && ui.draft.length) ui.draft = [];
    if (tool === 'bubble') ui.selected = null;
    render();
    announce(tool === 'bubble' ? 'Outil Nouvelle bulle' : 'Outil Sélection');
  }
  function addDraftPoint(p) {
    if (ui.draft.length >= MAX_POINTS) return;
    if (!ui.draft.length) ui.selected = null;
    ui.draft.push({ x: round(p.x, 4), y: round(p.y, 4) });
  }
  function cancelDraft() {
    if (!ui.draft.length) return false;
    ui.draft = [];
    render();
    announce('Bulle annulée');
    return true;
  }
  // ComicDubsAddBubble: needs a valid polygon; the new bubble takes the default size
  function closeDraft({ viaKeyboard = false } = {}) {
    const page = activePage();
    if (ui.draft.length < 3) return announce('Il faut au moins trois sommets pour fermer la bulle');
    if (!validPolygon(ui.draft)) return announce('Polygone trop petit : écartez les sommets');
    const before = snap();
    const b = makeBubble(project, ui.draft);
    page.bubbles.push(b);
    commit(before);
    ui.draft = [];
    ui.tool = 'select';
    ui.selected = b.id;
    ui.kb = false;
    render();
    announce(`${bubbleName(b)} créée. Saisissez son texte dans l’inspecteur.`);
    if (!viaKeyboard && !mqMobile.matches) insp.text.focus({ preventScroll: true });
  }

  /* ───────────── bubble edits ───────────── */
  function edit(fn, say) {
    const b = selected();
    if (!b) return;
    const before = snap();
    fn(b);
    if (commit(before)) {
      render();
      if (say) announce(typeof say === 'function' ? say(b) : say);
    }
  }
  function moveBubbleBy(b, dx, dy) {
    const bb = bbox(b.points);
    const mx = clamp(dx, -bb.x1, 1 - bb.x2);
    const my = clamp(dy, -bb.y1, 1 - bb.y2);
    const shift = (list) => list.map((p) => ({ x: round(p.x + mx, 4), y: round(p.y + my, 4) }));
    b.points = shift(b.points);
    // the site moves the poses with the bubble so the animation follows it
    b.keyframes = b.keyframes.map((k) => ({ atMs: k.atMs, points: shift(k.points).map((p) => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) })) }));
  }
  function removeBubble(b) {
    const page = pageOf(b);
    const before = snap();
    page.bubbles.splice(page.bubbles.indexOf(b), 1);
    commit(before);
    ui.selected = null;
    render();
    announce('Bulle supprimée');
    main.stage.focus({ preventScroll: true });
  }
  function assignAudio(b, audio) {
    const before = snap();
    b.audioId = audio.id;
    if (commit(before)) {
      render();
      announce(`Audio ${audio.fileName} associé à la ${bubbleName(b).toLowerCase()}`);
    } else announce(`${audio.fileName} est déjà sur cette bulle`);
  }
  function previewAudio(b) {
    const audio = audioOf(b);
    if (!audio) return toast('Cette bulle n’a pas d’audio');
    toast(`${audio.fileName} : audio de démonstration, muet sur le site`);
  }

  /* ───────────── playback (Espace) ───────────── */
  let raf = 0;
  const loop = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  function frame(now) {
    raf = 0;
    let again = false;
    if (pb) {
      tickPlayback(now);
      again = !!pb;
    }
    if (vx?.playing) {
      const b = findBubble(vx.id);
      const dur = vxDuration(b);
      vx.at = Math.min(dur, vx.playing.from + (now - vx.playing.t0));
      if (vx.at >= dur) {
        vx.playing = null;
        announce('Fin de l’animation');
      }
      renderVx();
      again ||= !!vx?.playing;
    }
    if (again) loop();
  }
  function startPlayback() {
    const from = pageIndex();
    let pi = -1;
    for (let i = Math.max(0, from); i < project.pages.length; i++)
      if (project.pages[i].bubbles.length) {
        pi = i;
        break;
      }
    if (pi === -1) return toast('Aucune bulle à lire', 3); // state.rs:1979
    if (document.activeElement === insp.text) insp.text.blur();
    ui.draft = [];
    ui.selected = null;
    pb = { pi, bi: 0, visible: 1, startedAt: 0, deadline: 0, elapsed: 0, audioEl: null };
    startBubble(performance.now(), 'Lecture du Comic Dub. ');
    loop();
  }
  function startBubble(now, lead = '') {
    const page = project.pages[pb.pi];
    const b = page?.bubbles[pb.bi];
    if (!b) return stopPlayback(true);
    project.activePage = page.id;
    pb.visible = pb.bi + 1;
    pb.audioEl?.pause();
    pb.audioEl = null;
    const audio = audioOf(b);
    let dur = 0;
    if (audio) {
      dur = audio.durationMs;
      if (audio.url) {
        pb.audioEl = new Audio(audio.url);
        pb.audioEl.play().catch(() => {});
      }
    }
    const gap = nextPosition(pb.pi, pb.bi)?.gap ?? 0;
    pb.startedAt = now;
    pb.elapsed = 0;
    pb.deadline = now + Math.max(dur, animMs(b)) + gap;
    announce(`${lead}${b.text.trim() || `Bulle ${pb.bi + 1}, sans texte`}`);
    render();
  }
  function tickPlayback(now) {
    pb.elapsed = now - pb.startedAt;
    const audioPlaying = pb.audioEl && !pb.audioEl.paused && !pb.audioEl.ended;
    if (now >= pb.deadline && !audioPlaying) {
      const next = nextPosition(pb.pi, pb.bi);
      if (next) {
        pb.pi = next.pi;
        pb.bi = next.bi;
        startBubble(now);
      } else return stopPlayback(true);
    }
    renderStage();
    renderTimeline();
  }
  function stopPlayback(finished) {
    if (!pb) return;
    pb.audioEl?.pause();
    pb = null;
    render();
    announce(finished ? 'Lecture terminée' : 'Lecture arrêtée');
  }
  const togglePlayback = () => (pb ? stopPlayback(false) : startPlayback());

  /* ───────────── pointer on the page ───────────── */
  main.box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || pb) return;
    if (e.target.closest('.cd-badge')) return;
    const page = activePage();
    if (!page) return;
    const p = localPoint(e, main.box);
    ui.kb = false;
    const handle = e.target.closest('.cd-handle');
    const sel = selected();
    if (handle && sel) {
      e.preventDefault();
      ui.drag = { kind: 'vertex', id: sel.id, index: Number(handle.dataset.vertex), before: snap(), points: clone(sel.points), moved: false };
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl + clic starts (or restarts) a bubble, like the app
      ui.draft = [];
      addDraftPoint(p);
      ui.cursor = { x: p.x, y: p.y };
    } else if (drawing()) {
      const idx = ui.draft.length ? vertexAt(ui.draft, e, p.r) : -1;
      if (idx !== -1) ui.drag = { kind: 'draft', index: idx, original: { ...ui.draft[idx] }, moved: false };
      else addDraftPoint(p);
      ui.cursor = { x: p.x, y: p.y };
    } else {
      const hit = bubbleAt(page, p);
      if (hit?.id !== ui.selected) select(hit ? hit.id : null);
      if (hit) ui.drag = { kind: 'move', id: hit.id, anchor: p, before: snap(), original: clone(hit.points), points: null, moved: false };
    }
    if (ui.drag) {
      main.box.setPointerCapture(e.pointerId);
      main.box.classList.toggle('is-grab', ui.drag.kind === 'move');
    }
    render();
  });
  main.box.addEventListener('pointermove', (e) => {
    const page = activePage();
    if (!page || pb) return;
    const p = localPoint(e, main.box);
    const d = ui.drag;
    if (!d) {
      if (drawing()) {
        ui.hover = { x: p.x, y: p.y };
        ui.kb = false;
        renderStage();
      }
      return;
    }
    if (d.kind === 'draft') {
      d.moved ||= Math.abs(p.x - d.original.x) > 0.001 || Math.abs(p.y - d.original.y) > 0.001;
      ui.draft[d.index] = { x: round(p.x, 4), y: round(p.y, 4) };
    } else if (d.kind === 'vertex') {
      d.points[d.index] = { x: round(p.x, 4), y: round(p.y, 4) };
      d.moved = true;
    } else if (d.kind === 'move') {
      const bb = bbox(d.original);
      const dx = clamp(p.x - d.anchor.x, -bb.x1, 1 - bb.x2);
      const dy = clamp(p.y - d.anchor.y, -bb.y1, 1 - bb.y2);
      d.moved ||= Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002;
      d.dx = dx;
      d.dy = dy;
      d.points = d.original.map((q) => ({ x: q.x + dx, y: q.y + dy }));
    }
    renderStage();
  });
  const endDrag = (e, cancelled = false) => {
    const d = ui.drag;
    if (!d) return;
    ui.drag = null;
    main.box.classList.remove('is-grab');
    if (main.box.hasPointerCapture?.(e.pointerId)) main.box.releasePointerCapture(e.pointerId);
    if (d.kind === 'draft') {
      if (cancelled) ui.draft[d.index] = d.original;
      else if (d.index === 0 && !d.moved && ui.draft.length >= 3) return closeDraft();
    } else if (d.kind === 'vertex' && d.moved && !cancelled) {
      const b = findBubble(d.id);
      if (validPolygon(d.points)) {
        b.points = d.points;
        commit(d.before);
        announce(`Sommet ${d.index + 1} déplacé`);
      } else toast('Polygone invalide : le sommet reprend sa place');
    } else if (d.kind === 'move' && d.moved && !cancelled) {
      const b = findBubble(d.id);
      moveBubbleBy(b, d.dx, d.dy);
      commit(d.before);
      announce(`${bubbleName(b)} déplacée`);
    }
    render();
  };
  main.box.addEventListener('pointerup', (e) => endDrag(e));
  main.box.addEventListener('pointercancel', (e) => endDrag(e, true));
  main.box.addEventListener('pointerleave', () => {
    if (ui.hover && !ui.drag) {
      ui.hover = null;
      renderStage();
    }
  });
  main.box.addEventListener('dblclick', (e) => {
    const page = activePage();
    if (!page || pb || drawing()) return;
    const hit = bubbleAt(page, localPoint(e, main.box));
    if (!hit) return;
    select(hit.id, { say: false });
    insp.text.focus({ preventScroll: true });
    insp.text.select();
  });
  main.box.addEventListener('contextmenu', (e) => {
    const page = activePage();
    if (!page) return;
    const hit = bubbleAt(page, localPoint(e, main.box));
    if (!hit) return;
    e.preventDefault();
    select(hit.id, { say: false });
    previewAudio(hit);
  });
  main.layer.addEventListener('click', (e) => {
    const badge = e.target.closest('.cd-badge');
    if (!badge || pb) return;
    select(Number(badge.dataset.bubble));
  });

  /* ───────────── keyboard on the page ───────────── */
  let nudge = null; // coalesces arrow-key moves into one undo step
  const flushNudge = () => {
    if (nudge) {
      commit(nudge.before);
      nudge = null;
    }
  };
  function arrowDelta(e, fine, coarse) {
    const s = e.shiftKey ? coarse : fine;
    return { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
  }
  main.stage.addEventListener('keydown', (e) => {
    if (e.target !== main.stage && !e.target.closest('.cd-badge')) return;
    if (pb || !activePage()) return;
    if (drawing() && e.target === main.stage) {
      const d = arrowDelta(e, 0.01, 0.05);
      if (d) {
        e.preventDefault();
        ui.kb = true;
        ui.cursor = { x: clamp(ui.cursor.x + d[0], 0, 1), y: clamp(ui.cursor.y + d[1], 0, 1) };
        render();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        ui.kb = true;
        addDraftPoint(ui.cursor);
        render();
        announce(`Sommet ${ui.draft.length} posé`);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (ui.draft.length) closeDraft({ viaKeyboard: true });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (ui.draft.pop()) {
          render();
          announce(`Sommet retiré, ${ui.draft.length} restant(s)`);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!cancelDraft()) setTool('select');
      }
      return;
    }
    const b = e.target.closest('.cd-badge') ? findBubble(Number(e.target.closest('.cd-badge').dataset.bubble)) : selected();
    if (!b) return;
    const d = arrowDelta(e, 0.005, 0.02);
    if (d) {
      e.preventDefault();
      if (ui.selected !== b.id) select(b.id, { say: false });
      nudge ||= { before: snap() };
      moveBubbleBy(b, d[0], d[1]);
      render();
    } else if (e.key === 'Delete' || (e.key === 'Backspace' && e.target === main.stage)) {
      e.preventDefault();
      removeBubble(b);
    } else if (e.key === 'Enter' && e.target === main.stage) {
      e.preventDefault();
      insp.text.focus();
    } else if (e.key === 'Escape' && ui.selected != null) {
      e.preventDefault();
      e.stopPropagation();
      select(null);
      announce('Aucune bulle sélectionnée');
    }
  });
  main.stage.addEventListener('keyup', (e) => {
    if (e.key.startsWith('Arrow') && nudge) {
      flushNudge();
      const b = selected();
      if (b) announce(`${bubbleName(b)} déplacée`);
    }
  });
  main.stage.addEventListener('focus', () => drawing() && renderStage());
  main.stage.addEventListener('blur', () => {
    flushNudge();
    if (ui.kb) renderStage();
  });
  // vertex handles: each one is a Tab stop, arrows move it, Page↑/↓ jump to the next
  function roveHandle(layer, e, n) {
    if (e.key !== 'PageUp' && e.key !== 'PageDown') return false;
    e.preventDefault();
    e.stopPropagation();
    ui.handle = (Number(e.target.dataset.vertex) + (e.key === 'PageDown' ? 1 : -1) + n) % n;
    layer === main.layer ? renderStage() : renderVx();
    layer.querySelector(`.cd-handle[data-vertex="${ui.handle}"]`)?.focus({ preventScroll: true });
    return true;
  }
  main.layer.addEventListener('keydown', (e) => {
    const h = e.target.closest('.cd-handle');
    const b = selected();
    if (!h || !b) return;
    if (roveHandle(main.layer, e, b.points.length)) return;
    const d = arrowDelta(e, 0.005, 0.02);
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const k = Number(h.dataset.vertex);
    const next = clone(b.points);
    next[k] = { x: round(clamp(next[k].x + d[0], 0, 1), 4), y: round(clamp(next[k].y + d[1], 0, 1), 4) };
    if (!validPolygon(next)) return;
    nudge ||= { before: snap() };
    b.points = next;
    renderStage();
  });
  main.layer.addEventListener('keyup', (e) => {
    if (e.key.startsWith('Arrow') && e.target.closest('.cd-handle') && nudge) {
      flushNudge();
      announce(`Sommet ${Number(e.target.dataset.vertex) + 1} déplacé`);
    }
  });

  /* ───────────── workspace-wide keys ───────────── */
  root.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const t = e.target;
    const typing = t.closest('input:not([type="range"]):not([type="checkbox"]):not([type="color"]), textarea');
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !typing && !t.closest('dialog')) {
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        return undo();
      }
      if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        return redo();
      }
    }
    if (vx || t.closest('dialog, .dropdown')) return;
    if (e.key === ' ' && !typing && !t.closest('button, a, input, summary, [role="tab"]')) {
      e.preventDefault();
      togglePlayback();
    } else if (e.key === 'Escape' && ui.draft.length && !typing) {
      e.preventDefault();
      cancelDraft();
    }
  });

  // Undo still works when a removed button dropped the focus back to <body>
  document.addEventListener('keydown', (e) => {
    if (document.activeElement !== document.body || ctx.tabs.current() !== 'comicdubs') return;
    if (!(e.ctrlKey || e.metaKey) || vx) return;
    const r = root.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });

  /* ───────────── header, tools ───────────── */
  $$('[data-cd-page]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const i = pageIndex() + Number(btn.dataset.cdPage);
      const page = project.pages[i];
      if (!page) return;
      if (pb) stopPlayback(false);
      project.activePage = page.id;
      ui.draft = [];
      ui.selected = null;
      render();
      announce(`Page ${i + 1} sur ${project.pages.length} : ${page.fileName}`);
    }),
  );
  playBtn.addEventListener('click', togglePlayback);
  $$('[data-cd-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.cdTool)));

  // timeline segments select their bubble
  track.addEventListener('click', (e) => {
    const seg = e.target.closest('.cd-tl');
    if (!seg || pb) return;
    select(Number(seg.dataset.bubble));
  });

  /* ───────────── inspector ───────────── */
  let textBefore = null;
  insp.text.addEventListener('focus', () => {
    const b = selected();
    if (!b) return;
    textBefore = snap();
    ui.textEdit = b.id;
    renderStage();
  });
  insp.text.addEventListener('input', () => {
    const b = selected();
    if (!b) return;
    const clean = cleanText(insp.text.value);
    if (clean !== insp.text.value) insp.text.value = clean;
    b.text = clean;
    renderStage();
  });
  insp.text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const b = selected();
      insp.text.blur();
      (b && main.layer._map?.get(`b${b.id}`))?.focus({ preventScroll: true });
    }
  });
  insp.text.addEventListener('blur', () => {
    const b = selected();
    ui.textEdit = null;
    if (b) b.text = b.text.trim();
    if (textBefore && commit(textBefore) && b) announce(`Texte de la ${bubbleName(b).toLowerCase()} : ${b.text || 'vide'}`);
    textBefore = null;
    render();
  });
  $$('[data-cd-step]').forEach((row) => {
    const def = STEPS[row.dataset.cdStep];
    row.querySelectorAll('[data-dir]').forEach((btn) =>
      btn.addEventListener('click', () =>
        edit(
          (b) => {
            b[def.key] = round(clamp(b[def.key] + def.d * Number(btn.dataset.dir), def.min, def.max), 2);
          },
          (b) => `${def.name} ${def.fmt(b[def.key])}`,
        ),
      ),
    );
  });
  let colorBefore = null;
  for (const input of [insp.bubbleColor, insp.textColor]) {
    input.addEventListener('focus', () => (colorBefore = snap()));
    input.addEventListener('click', () => (colorBefore ||= snap()));
    input.addEventListener('input', () => {
      const b = selected();
      if (!b) return;
      if (input === insp.bubbleColor) b.color = [...unhex(input.value), 255];
      else b.textColor = unhex(input.value);
      renderStage();
      renderInspector();
    });
    input.addEventListener('change', () => {
      if (colorBefore && commit(colorBefore)) announce(input === insp.bubbleColor ? 'Couleur du fond modifiée' : 'Couleur du texte modifiée');
      colorBefore = null;
    });
  }
  insp.clear.addEventListener('change', () =>
    edit(
      (b) => {
        b.color = [b.color[0], b.color[1], b.color[2], insp.clear.checked ? 0 : 255];
      },
      () => (insp.clear.checked ? 'Fond transparent' : 'Fond opaque'),
    ),
  );
  $$('[data-cd-style]').forEach((el) =>
    el.addEventListener('click', () =>
      edit(
        (b) => {
          b[el.dataset.cdStyle] = !b[el.dataset.cdStyle];
        },
        (b) => `${el.textContent} ${b[el.dataset.cdStyle] ? 'activé' : 'désactivé'}`,
      ),
    ),
  );
  const aligns = $$('[data-cd-align]');
  aligns.forEach((el, i) => {
    el.addEventListener('click', () => edit((b) => (b.align = el.dataset.cdAlign), `Alignement ${el.textContent.toLowerCase()}`));
    el.addEventListener('keydown', (e) => {
      const j = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!j) return;
      e.preventDefault();
      const next = aligns[(i + j + aligns.length) % aligns.length];
      next.focus();
      next.click();
    });
  });
  $$('[data-cd-order]').forEach((btn) =>
    btn.addEventListener('click', () =>
      edit(
        (b) => {
          const list = pageOf(b).bubbles;
          const from = list.indexOf(b);
          const to = clamp(from + Number(btn.dataset.cdOrder), 0, list.length - 1);
          list.splice(from, 1);
          list.splice(to, 0, b);
        },
        (b) => `Bulle placée en position ${orderOf(b)} dans l’ordre de lecture`,
      ),
    ),
  );
  $('[data-cd-delete]').addEventListener('click', () => {
    const b = selected();
    if (b) removeBubble(b);
  });

  /* ───────────── media explorer ───────────── */
  const mediaTabs = $$('[data-cd-media]');
  mediaTabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      ui.mediaTab = tab.dataset.cdMedia;
      renderMedia();
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = mediaTabs[(i + 1) % 2];
      next.focus();
      next.click();
    });
  });
  $('[data-cd-pages]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const i = project.pages.findIndex((p) => p.id === id);
    const page = project.pages[i];
    if (!page) return;
    if (pb) stopPlayback(false);
    if (btn.dataset.act === 'page') {
      project.activePage = id;
      ui.selected = null;
      ui.draft = [];
      render();
      announce(`Page ${i + 1} : ${page.fileName}`);
      return;
    }
    const before = snap();
    if (btn.dataset.act === 'page-remove') {
      project.pages.splice(i, 1);
      if (project.activePage === id) project.activePage = project.pages[Math.min(i, project.pages.length - 1)]?.id ?? null;
      ui.selected = null;
      ui.draft = [];
      announce(`${page.fileName} retirée`);
    } else {
      const to = clamp(i + (btn.dataset.act === 'page-up' ? -1 : 1), 0, project.pages.length - 1);
      project.pages.splice(i, 1);
      project.pages.splice(to, 0, page);
      announce(`${page.fileName} en position ${to + 1}`);
    }
    commit(before);
    render();
    if (btn.dataset.act === 'page-remove') {
      const next = project.pages[Math.min(i, project.pages.length - 1)];
      (next ? $(`[data-cd-row="p${next.id}"] [data-act="page"]`) : $('#cd-tab-images')).focus({ preventScroll: true });
    }
  });
  $('[data-cd-audios]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const audio = project.audios.find((a) => a.id === Number(btn.dataset.id));
    if (!audio) return;
    if (btn.dataset.act === 'audio-remove') {
      // remove_audio(): every bubble using it loses its audio
      const before = snap();
      const i = project.audios.indexOf(audio);
      project.audios.splice(i, 1);
      project.pages.forEach((p) => p.bubbles.forEach((b) => b.audioId === audio.id && (b.audioId = null)));
      commit(before);
      render();
      const next = project.audios[Math.min(i, project.audios.length - 1)];
      (next ? $(`[data-cd-row="a${next.id}"] [data-act="audio"]`) : $('#cd-tab-audios')).focus({ preventScroll: true });
      return announce(`${audio.fileName} retiré`);
    }
    if (suppressClick) return;
    const b = selected();
    if (!b) return toast('Sélectionnez d’abord une bulle, puis choisissez son audio');
    assignAudio(b, audio);
  });

  // dragging an audio row onto a bubble (the app's audio drag)
  let suppressClick = false;
  const audioList = $('[data-cd-audios]');
  audioList.addEventListener('pointerdown', (e) => {
    const src = e.target.closest('[data-grip], .cd-row--audio .cd-row__main');
    if (!src || e.button !== 0) return;
    const row = src.closest('.cd-row');
    const id = Number(src.dataset.grip || src.dataset.id);
    ui.audioDrag = { id, row, x0: e.clientX, y0: e.clientY, started: false, pointerId: e.pointerId, src };
    suppressClick = false;
  });
  window.addEventListener('pointermove', (e) => {
    const d = ui.audioDrag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
      d.started = true;
      d.src.setPointerCapture?.(e.pointerId);
      d.row.classList.add('is-dragging');
      dragChip.textContent = project.audios.find((a) => a.id === d.id)?.fileName || 'Audio';
      dragChip.hidden = false;
    }
    dragChip.style.left = `${e.clientX + 10}px`;
    dragChip.style.top = `${e.clientY + 10}px`;
    const page = activePage();
    const r = main.box.getBoundingClientRect();
    let target = null;
    if (page && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
      target = bubbleAt(page, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    if ((target?.id ?? null) !== ui.dropTarget) {
      ui.dropTarget = target?.id ?? null;
      renderStage();
    }
  });
  const endAudioDrag = (e) => {
    const d = ui.audioDrag;
    if (!d || e.pointerId !== d.pointerId) return;
    ui.audioDrag = null;
    if (!d.started) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    d.row.classList.remove('is-dragging');
    dragChip.hidden = true;
    const target = ui.dropTarget != null ? findBubble(ui.dropTarget) : null;
    ui.dropTarget = null;
    const audio = project.audios.find((a) => a.id === d.id);
    if (target && audio) {
      ui.selected = target.id;
      assignAudio(target, audio);
    } else renderStage();
  };
  window.addEventListener('pointerup', endAudioDrag);
  window.addEventListener('pointercancel', endAudioDrag);

  /* ───────────── menus ───────────── */
  for (const btn of $$('.cd-menu > .menu__btn')) ctx.makeDropdown(btn, document.getElementById(btn.getAttribute('aria-controls')));
  $$('[data-cd-reset]').forEach((b) =>
    b.addEventListener('click', () => {
      const before = snap();
      if (pb) stopPlayback(false);
      if (vx) closeVx(false);
      project = demoProject();
      fitCache.clear();
      commit(before);
      ui.selected = null;
      ui.draft = [];
      ui.tool = 'select';
      render();
      announce('Planche de démonstration rétablie');
    }),
  );
  $('[data-cd-animate]').addEventListener('click', () => {
    const b = selected();
    if (b) openVx(b.id);
  });

  /* ───────────── Paramètres du Comic Dub ───────────── */
  const setDlg = $('#cd-settings');
  const fontBtn = $('[data-cd-font-btn]');
  const fontList = $('[data-cd-font-list]');
  let setDraft = null;
  fontList.innerHTML = FONTS.map(
    (f, i) =>
      `<button class="dropdown__item" type="button" role="menuitemradio" aria-checked="false" data-font="${i}"><span style="font-stretch:${f.css}">${f.label}</span></button>`,
  ).join('');
  const fontDrop = ctx.makeDropdown(fontBtn, fontList);
  fontList.addEventListener('click', (e) => {
    const item = e.target.closest('[data-font]');
    if (!item) return;
    setDraft.font = FONTS[Number(item.dataset.font)].id;
    syncSettings();
    fontBtn.focus();
  });
  const SET = {
    bubble: { key: 'bubble', d: 250, min: 0, max: 60000, fmt: (v) => `${v} ms` },
    page: { key: 'page', d: 250, min: 0, max: 60000, fmt: (v) => `${v} ms` },
    size: { key: 'size', d: 2, min: 6, max: 72, fmt: (v) => `${Math.round(v)} px` },
  };
  function syncSettings() {
    $('[data-cd-font-value]').textContent = fontOf(setDraft.font).label;
    fontList.querySelectorAll('[data-font]').forEach((el) => el.setAttribute('aria-checked', String(FONTS[Number(el.dataset.font)].id === setDraft.font)));
    $$('[data-cd-set]').forEach((row) => {
      const def = SET[row.dataset.cdSet];
      const v = setDraft[def.key];
      row.querySelector('output').textContent = def.fmt(v);
      row.querySelector('[data-dir="-1"]').disabled = v <= def.min;
      row.querySelector('[data-dir="1"]').disabled = v >= def.max;
    });
  }
  $$('[data-cd-set]').forEach((row) => {
    const def = SET[row.dataset.cdSet];
    row.querySelectorAll('[data-dir]').forEach((btn) =>
      btn.addEventListener('click', () => {
        setDraft[def.key] = clamp(setDraft[def.key] + def.d * Number(btn.dataset.dir), def.min, def.max);
        syncSettings();
        announce(`${row.querySelector('.cd-dialog__label').textContent} ${def.fmt(setDraft[def.key])}`);
      }),
    );
  });
  $('[data-cd-open-settings]').addEventListener('click', () => {
    setDraft = { font: project.fontFamily, bubble: project.bubbleGapMs, page: project.pageGapMs, size: project.defaultFontSize };
    syncSettings();
    setDlg.showModal();
  });
  $('[data-cd-settings-save]').addEventListener('click', () => {
    const before = snap();
    project.fontFamily = setDraft.font;
    project.bubbleGapMs = setDraft.bubble;
    project.pageGapMs = setDraft.page;
    project.defaultFontSize = setDraft.size;
    fitCache.clear();
    commit(before);
    setDlg.close();
    render();
    announce('Paramètres du Comic Dub enregistrés');
  });
  setDlg.addEventListener('close', () => fontDrop.close(false));
  setDlg.addEventListener('click', (e) => e.target === setDlg && setDlg.close());

  /* ───────────── vertex animation editor ───────────── */
  // vertex_editor_duration_ms(): audio or last pose, at least 2 s
  const vxDuration = (b) => Math.min(86400000, Math.max(audioOf(b)?.durationMs || 0, animMs(b), 2000));
  function setKeyframe(b, at, list) {
    if (list.length !== b.points.length || !validPolygon(list)) return false;
    const atMs = Math.min(86400000, Math.round(at));
    const i = b.keyframes.findIndex((k) => k.atMs === atMs);
    if (i !== -1) b.keyframes[i] = { atMs, points: clone(list) };
    else {
      b.keyframes.push({ atMs, points: clone(list) });
      b.keyframes.sort((a, c) => a.atMs - c.atMs);
    }
    return true;
  }
  function openVx(id) {
    const b = findBubble(id);
    if (!b) return;
    if (pb) stopPlayback(false);
    ui.draft = [];
    ui.selected = id;
    vx = { id, at: 0, kf: b.keyframes.some((k) => k.atMs === 0) ? 0 : null, playing: null };
    ui.handle = 0;
    body.classList.add('is-vx');
    vxv.el.hidden = false;
    render();
    vxv.range.focus({ preventScroll: true });
    announce(`Animation des sommets de la ${bubbleName(b).toLowerCase()} : ${b.keyframes.length} pose(s), ${fmtMs(vxDuration(b))}.`);
  }
  function closeVx(say = true) {
    vx = null;
    body.classList.remove('is-vx');
    vxv.el.hidden = true;
    render();
    if (say) {
      announce('Éditeur de sommets fermé');
      main.stage.focus({ preventScroll: true });
    }
  }
  function setVxAt(ms) {
    const b = findBubble(vx.id);
    vx.at = clamp(Math.round(ms), 0, vxDuration(b));
    vx.kf = b.keyframes.some((k) => k.atMs === vx.at) ? vx.at : null;
    vx.playing = null;
    renderVx();
  }
  function vxPrev() {
    const b = findBubble(vx.id);
    const prev = b.keyframes.filter((k) => k.atMs < Math.round(vx.at));
    setVxAt(prev.length ? prev[prev.length - 1].atMs : 0);
  }
  function vxNext() {
    const b = findBubble(vx.id);
    const next = b.keyframes.find((k) => k.atMs > Math.round(vx.at));
    setVxAt(next ? next.atMs : vxDuration(b));
  }
  function vxToggle() {
    const b = findBubble(vx.id);
    if (vx.playing) {
      vx.playing = null;
      vx.at = Math.round(vx.at);
    } else {
      if (vx.at >= vxDuration(b)) vx.at = 0;
      vx.playing = { t0: performance.now(), from: vx.at };
      loop();
    }
    renderVx();
    announce(vx.playing ? 'Lecture de l’animation' : 'Pause');
  }
  function vxAdd() {
    const b = findBubble(vx.id);
    const at = Math.round(vx.at);
    const had = b.keyframes.some((k) => k.atMs === at);
    const before = snap();
    setKeyframe(b, at, pointsAt(b, at));
    vx.at = at;
    vx.kf = at;
    vx.playing = null;
    commit(before);
    render();
    announce(`${had ? 'Pose mise à jour' : 'Pose ajoutée'} à ${fmtMs(at)}`);
  }
  function vxDelete() {
    const b = findBubble(vx.id);
    if (vx.kf == null) return announce('Aucune pose sélectionnée');
    const before = snap();
    const at = vx.kf;
    b.keyframes = b.keyframes.filter((k) => k.atMs !== at);
    vx.kf = null;
    commit(before);
    render();
    announce(`Pose à ${fmtMs(at)} supprimée`);
  }
  function renderVx() {
    const b = findBubble(vx.id);
    const page = pageOf(b);
    if (!b || !page) return closeVx(false);
    const dur = vxDuration(b);
    if (vxv.img.dataset.src !== page.src) {
      vxv.img.src = page.src;
      vxv.img.width = page.width;
      vxv.img.height = page.height;
      vxv.img.dataset.src = page.src;
    }
    const at = vx.at;
    const drag = ui.drag?.kind === 'vx' ? ui.drag.points : null;
    const list = drag || pointsAt(b, at);
    if (layoutView(vxv, page)) {
      const { w, h } = vxv.geo;
      vxv.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      let s = '';
      if (list !== b.points) s += `<polygon points="${svgPts(b.points, w, h)}" fill="none" stroke="${GHOST}" stroke-dasharray="5 4"/>`;
      s += bubbleSvg(b, list, w, h, { selected: true });
      vxv.svg.innerHTML = s;
      syncLayer(
        vxv.layer,
        list.map((p, k) => handleItem(b, k, p, w, h, list.length, 'vx')),
      );
    }
    vxv.range.max = String(dur);
    if (document.activeElement !== vxv.range || vx.playing) vxv.range.value = String(Math.round(at));
    vxv.range.setAttribute('aria-valuetext', fmtMs(at));
    vxv.playhead.style.left = `${((at / dur) * 100).toFixed(3)}%`;
    vxv.now.textContent = fmtMs(at);
    vxv.dur.textContent = fmtMs(dur);
    const play = $('[data-cd-vx="play"]');
    play.textContent = vx.playing ? 'Pause' : 'Lire';
    play.setAttribute('aria-pressed', String(!!vx.playing));
    const exact = b.keyframes.some((k) => k.atMs === Math.round(at));
    $('[data-cd-vx="add"]').textContent = vx.kf != null && vx.kf === Math.round(at) && exact ? 'Mettre à jour' : 'Ajouter une pose';
    $('[data-cd-vx="delete"]').disabled = vx.kf == null;
    const sig = JSON.stringify([dur, b.keyframes.map((k) => k.atMs)]);
    if (vxv.markers.dataset.sig !== sig) {
      const focusAt = document.activeElement?.closest?.('.cd-vx__marker')?.dataset.at;
      vxv.markers.dataset.sig = sig;
      vxv.markers.innerHTML = b.keyframes
        .map(
          (k) =>
            `<button class="cd-vx__marker" type="button" style="left:${((k.atMs / dur) * 100).toFixed(3)}%" data-at="${k.atMs}" aria-pressed="false" aria-label="Pose à ${fmtMs(k.atMs)}" data-tip="Pose à ${fmtMs(k.atMs)}"></button>`,
        )
        .join('');
      if (focusAt != null) vxv.markers.querySelector(`[data-at="${focusAt}"]`)?.focus({ preventScroll: true });
    }
    vxv.markers.querySelectorAll('.cd-vx__marker').forEach((m) => m.setAttribute('aria-pressed', String(vx.kf === Number(m.dataset.at))));
  }
  $('[data-cd-vx-close]').addEventListener('click', () => closeVx());
  $$('button[data-cd-vx]').forEach((btn) =>
    btn.addEventListener('click', () => ({ prev: vxPrev, next: vxNext, play: vxToggle, add: vxAdd, delete: vxDelete })[btn.dataset.cdVx]()),
  );
  vxv.range.addEventListener('input', () => {
    // snap to a pose marker within 10 px, like the app's track
    const b = findBubble(vx.id);
    const dur = vxDuration(b);
    const v = Number(vxv.range.value);
    const px = vxv.range.clientWidth || 1;
    const near = b.keyframes.find((k) => (Math.abs(k.atMs - v) / dur) * px <= 10);
    setVxAt(near ? near.atMs : v);
  });
  vxv.markers.addEventListener('click', (e) => {
    const m = e.target.closest('.cd-vx__marker');
    if (m) setVxAt(Number(m.dataset.at));
  });
  vxv.el.addEventListener('keydown', (e) => {
    if (!vx) return;
    const onButton = e.target.closest('button');
    const onHandle = e.target.closest('.cd-handle');
    if (onHandle) {
      if (roveHandle(vxv.layer, e, findBubble(vx.id).points.length)) return;
      const d = arrowDelta(e, 0.005, 0.02);
      if (d) {
        e.preventDefault();
        const b = findBubble(vx.id);
        const k = Number(onHandle.dataset.vertex);
        const at = Math.round(vx.at);
        const list = clone(pointsAt(b, at));
        list[k] = { x: round(clamp(list[k].x + d[0], 0, 1), 4), y: round(clamp(list[k].y + d[1], 0, 1), 4) };
        nudge ||= { before: snap() };
        if (setKeyframe(b, at, list)) {
          vx.kf = at;
          renderVx();
        }
        return;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeVx();
    } else if (e.key === ' ' && !onButton) {
      e.preventDefault();
      vxToggle();
    } else if (e.key === 'Enter' && !onButton) {
      e.preventDefault();
      vxAdd();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !onHandle) {
      e.preventDefault();
      vxDelete();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setVxAt(e.key === 'Home' ? 0 : vxDuration(findBubble(vx.id)));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      e.key === 'PageUp' ? vxPrev() : vxNext();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (e.ctrlKey || e.target === vxv.range)) {
      e.preventDefault();
      setVxAt(vx.at + (e.key === 'ArrowLeft' ? -50 : 50));
    }
  });
  vxv.el.addEventListener('keyup', (e) => {
    if (e.key.startsWith('Arrow') && e.target.closest('.cd-handle') && nudge) {
      flushNudge();
      announce(`Pose à ${fmtMs(vx.at)} modifiée`);
    }
  });
  // dragging a vertex writes a pose at the playhead
  vxv.box.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.cd-handle');
    if (!handle || !vx || e.button !== 0) return;
    e.preventDefault();
    const b = findBubble(vx.id);
    vx.playing = null;
    vx.at = Math.round(vx.at);
    ui.drag = { kind: 'vx', index: Number(handle.dataset.vertex), before: snap(), points: clone(pointsAt(b, vx.at)), moved: false };
    vxv.box.setPointerCapture(e.pointerId);
  });
  vxv.box.addEventListener('pointermove', (e) => {
    if (ui.drag?.kind !== 'vx') return;
    const p = localPoint(e, vxv.box);
    ui.drag.points[ui.drag.index] = { x: round(p.x, 4), y: round(p.y, 4) };
    ui.drag.moved = true;
    renderVx();
  });
  const endVxDrag = (e, cancelled) => {
    const d = ui.drag;
    if (d?.kind !== 'vx') return;
    ui.drag = null;
    if (vxv.box.hasPointerCapture?.(e.pointerId)) vxv.box.releasePointerCapture(e.pointerId);
    const b = findBubble(vx.id);
    if (d.moved && !cancelled && setKeyframe(b, vx.at, d.points)) {
      vx.kf = vx.at;
      commit(d.before);
      announce(`Pose à ${fmtMs(vx.at)} enregistrée`);
    }
    render();
  };
  vxv.box.addEventListener('pointerup', (e) => endVxDrag(e, false));
  vxv.box.addEventListener('pointercancel', (e) => endVxDrag(e, true));

  /* ───────────── lifecycle ───────────── */
  const ro = new ResizeObserver(() => {
    renderStage();
    if (vx) renderVx();
  });
  ro.observe(main.stage);
  ro.observe(vxv.stage);
  mqMobile.addEventListener?.('change', () => render());
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) return;
    if (pb) stopPlayback(false);
    if (vx?.playing) vx.playing = null;
  }).observe(root);
  ctx.tabs.onChange((name) => {
    if (name !== 'comicdubs') {
      if (pb) stopPlayback(false);
      if (vx?.playing) vx.playing = null;
    } else requestAnimationFrame(render);
  });
  const refont = () => {
    fitCache.clear();
    render();
  };
  document.fonts?.load('600 20px "Archivo Variable"').then(refont, () => {});
  document.fonts?.ready.then(refont);
  render();
}
