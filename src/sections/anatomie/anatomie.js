// Anatomie d'une bande rythmo (#bande, boucle 1).
// A frozen, zoomed slice of the band holding one of every element. The legend
// spotlights an element on the band (DOM overlay computed from the band's own
// geometry: lineGeometry, frameToX…), and the band points back at the legend.
// Below: the respiration / réaction codes (toolbar lists, src/ui/mod.rs), the
// text emotions (Alt+E, src/rythmo_line.rs) and the two tables (Ctrl+I, Ctrl+P).

import { words } from '../../band/text.js';

const F = 4608; // the frozen frame, 01:03:12:00
const START = F - 48; // Lecture replays the two seconds before the slice
const CAST = { MAYA: '#ff8033', 'THÉO': '#33cccc', JADE: '#cc4dff' };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* ───────────── the slice ─────────────
   Every element sits inside ±60 frames of the reading bar, and only one
   dialogue line crosses it, so the yellow read word is unambiguous. */
function sliceLines() {
  const L = (o) => ({ kind: 'dialogue', note: '', karaoke: false, color: CAST[o.character], ...o });
  return [
    L({ id: 1, role: 'reaction', track: 2, start: F - 38, dur: 9, character: 'JADE', text: '(ah)' }),
    L({ id: 2, role: 'breath', track: 0, start: F - 36, dur: 7, character: 'MAYA', text: '↑', kind: 'breath' }),
    L({ id: 3, role: 'ambiance', track: 3, start: F - 34, dur: 30, character: 'BAR', text: 'Brouhaha, rires', kind: 'ambiance', color: '#338cff' }),
    L({ id: 4, role: 'dialogue', track: 0, start: F - 26, dur: 50, character: 'MAYA', text: 'Attends… c’est ta voix sur la bande ?' }),
    L({ id: 5, role: 'karaoke', track: 1, start: F - 14, dur: 36, character: 'THÉO', text: 'C’est moi qui chante !', karaoke: true }),
    L({ id: 6, role: 'dialogue', track: 2, start: F + 20, dur: 22, character: 'JADE', text: 'Rends-moi ce micro.', note: 'chuchoté' }),
    L({ id: 7, role: 'breath', track: 0, start: F + 27, dur: 7, character: 'MAYA', text: '↓', kind: 'breath' }),
  ];
}

function sliceMarkers() {
  return [
    // three earlier boucles, off the slice, so the visible one reads 4
    { kind: 'boucle', frame: F - 2400 },
    { kind: 'boucle', frame: F - 1700 },
    { kind: 'boucle', frame: F - 1000 },
    { kind: 'boucle', frame: F - 60 },
    { kind: 'out', frame: F + 46 },
    { kind: 'scene', frame: F + 56 },
  ];
}

/** A hand-drawn coil on track 4, pinned to frames (the band keeps it in time).
 *  Loops swell and drift a little, the way a hand draws them. */
function sliceStroke() {
  const points = [];
  const loops = 4.5;
  for (let i = 0; i <= 160; i++) {
    const u = i / 160;
    const a = u * loops * Math.PI * 2;
    const r = 1.5 + 0.7 * Math.sin(u * 2.6 + 0.4);
    const lift = 0.012 * Math.sin(u * Math.PI) - 0.008 * u;
    points.push([F + 9 + u * 25 - r * Math.cos(a) + r, 0.874 - lift + Math.sin(a) * (0.028 + 0.012 * Math.sin(u * 3.1))]);
  }
  return { id: 1, color: '#4dff4d', r: 0.006, points };
}

/* ───────────── small helpers ───────────── */

/** Every item is a Tab stop; arrows, Home and End move inside the list too. */
function roving(container, selector, { keys = 'both' } = {}) {
  const items = () => [...container.querySelectorAll(selector)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  container.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const next = keys === 'vertical' ? ['ArrowDown'] : ['ArrowDown', 'ArrowRight'];
    const prev = keys === 'vertical' ? ['ArrowUp'] : ['ArrowUp', 'ArrowLeft'];
    let j = null;
    if (next.includes(e.key)) j = (i + 1) % list.length;
    else if (prev.includes(e.key)) j = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    if (j === null) return;
    e.preventDefault();
    list[j].focus();
  });
}

const reduced = (ctx) => !!ctx.settings.get().reduceMotion;

/* ═══════════════════════════ specimen + legend ═══════════════════════════ */

function initSpecimen(ctx, root) {
  const q = (k) => root.querySelector(`[data-anat="${k}"]`);
  const host = root.querySelector('#anat-band');
  const stage = host.parentElement;
  const svg = q('svg');
  const holes = q('holes');
  const rings = q('rings');
  const tags = q('tags');
  const key = q('key');
  const items = [...key.querySelectorAll('[data-el]')];
  const nameOf = Object.fromEntries(
    items.map((b) => [b.dataset.el, b.querySelector('.anat-key__name').firstChild.textContent.trim()]),
  );

  // ±63 frames around the bar hold the whole slice; below 680px the band
  // keeps a readable ×1 and the legend brings each element under the bar
  const scaleFor = (w) => (w >= 680 ? clamp(w / 760, 0.9, 1.5) : 1);
  const fitsSlice = () => band.width / band.ppf / 2 >= 62;

  // At rest the slice holds only the reading bar, the ruler and one line.
  // Choosing a legend entry brings that one element onto the band.
  const ALL = { lines: sliceLines(), markers: sliceMarkers(), strokes: [sliceStroke()] };
  const BASE = [4];
  const REVEALS = {
    note: { lines: [6] },
    karaoke: { lines: [5] },
    breath: { lines: [2, 7] },
    reaction: { lines: [1] },
    ambiance: { lines: [3] },
    drawing: { strokes: true },
    boucle: { markers: ['boucle'] },
    out: { markers: ['out'] },
    scene: { markers: ['scene'] },
  };
  const project = { lines: [], markers: [], strokes: [] };
  const reveal = (k, extraLines = []) => {
    const r = (k && REVEALS[k]) || {};
    const ids = new Set([...BASE, ...(r.lines || []), ...extraLines]);
    project.lines = ALL.lines.filter((l) => ids.has(l.id));
    project.markers = ALL.markers.filter((m) => (r.markers || []).includes(m.kind));
    project.strokes = r.strokes ? ALL.strokes : [];
  };
  reveal(null);

  const band = new ctx.Band(host, {
    project,
    tracks: 4,
    startFrame: START,
    stopAt: F,
    scale: scaleFor(host.getBoundingClientRect().width || 1100),
    editable: false,
    label: 'Tranche de bande rythmo agrandie',
    // the slice is composed at ×1 and always shows the yellow read word
    settings: {
      get: () => ({ ...ctx.settings.get(), scrollSpeed: 1, highlightWord: true }),
      subscribe: (fn) => ctx.settings.subscribe(fn),
    },
    announce: ctx.announce,
  });
  band.setFrame(F);
  const lines = () => band.project.lines;

  new ResizeObserver(() => {
    const s = scaleFor(host.getBoundingClientRect().width);
    if (s !== band.opts.scale) {
      band.opts.scale = s;
      band.layout();
    }
  }).observe(host);

  /* ── geometry: every element as rects in band pixels ── */
  const onScreen = () => {
    const geo = new Map();
    for (const l of lines()) {
      if (l.karaoke) continue;
      const g = band.lineGeometry(l);
      if (band.isLineOnScreen(l, g)) geo.set(l.id, g);
    }
    return geo;
  };
  // same rule as the renderer: a label that lands on a line of the same
  // character on its track is hidden (rythmo_cpu_renderer.rs, badge collisions)
  const labelShown = (line, g, geo) => {
    if (!g.labelText) return false;
    for (const [id, og] of geo) {
      if (id === line.id) continue;
      const other = lines().find((l) => l.id === id);
      if (!other || other.track !== line.track) continue;
      if (g.labelX < og.x1 + og.w && g.labelX + g.labelW > og.x1 && other.character === line.character && line.kind !== 'ambiance') return false;
    }
    return true;
  };
  const box = (g) => ({ x: g.x1, y: g.y, w: g.w, h: g.h });
  const labelBox = (g, l) => {
    const m = band.labelMetrics(g, l); // same geometry the renderer draws
    const top = m.top - 4;
    return { x: g.labelX - 4, y: top, w: g.labelW + 8, h: m.bottom + 3 - top };
  };
  const linesOf = (role) =>
    lines().filter((l) => l.role === role && (!l.karaoke || band.karaokeVisible(l)));
  const lineRects = (role) => linesOf(role).map((l) => box(band.lineGeometry(l)));
  const markerRect = (kind, left, right) =>
    band.project.markers
      .filter((m) => m.kind === kind)
      .map((m) => band.frameToX(m.frame))
      .filter((x) => x > -40 && x < band.width + 40)
      .map((x) => ({ x: x - left * band.s, y: 0, w: (left + right) * band.s, h: band.height }));

  const readWordRects = () => {
    const out = [];
    for (const line of lines()) {
      if (line.karaoke || line.action || line.text === '↑' || line.text === '↓' || !line.text) continue;
      const g = band.lineGeometry(line);
      const s = band.s;
      const reserve = line.kind === 'ambiance' ? Math.min(54 * s, g.w * 0.3) : 0;
      const x = g.x1 + reserve;
      const w = g.w - reserve;
      const font = band.fontText(line.note ? Math.round(band.bodyH * 0.48) : band.textSize);
      const natural = band.measure(line.text, font);
      const padX = 5 * s;
      const sx = clamp(Math.max(4, w - padX * 2) / Math.max(1, natural), 0.2, 3.2);
      const px = (band.cx - (x + padX)) / sx;
      if (px < 0 || px > natural) continue;
      for (const wd of words(line.text)) {
        const a = band.measure(line.text.slice(0, wd.start), font);
        const b = band.measure(line.text.slice(0, wd.end), font);
        if (px >= a && px <= b + band.measure(' ', font)) {
          out.push({ x: x + padX + a * sx - 3, y: g.y + 3, w: (b - a) * sx + 6, h: g.h - 6 });
          break;
        }
      }
    }
    return out;
  };

  const ELEMENTS = {
    playhead: { rects: () => [{ x: band.cx - 8, y: 0, w: 16, h: band.height }] },
    ruler: { rects: () => [{ x: 0, y: 0, w: band.width, h: 13 * band.s }] },
    tracks: {
      rects: () =>
        [0, 1, 2, 3].map((t) => ({
          x: 3,
          y: band.rulerH + t * band.trackH + 3,
          w: band.width - 6,
          h: band.trackH - 6,
          tag: `Piste ${t + 1}`,
        })),
    },
    readword: { rects: readWordRects, at: F },
    label: {
      rects: () => {
        const geo = onScreen();
        const out = [];
        for (const l of lines()) {
          if (l.kind === 'ambiance') continue;
          if (l.karaoke) {
            if (!band.karaokeVisible(l)) continue;
            out.push(labelBox(band.lineGeometry(l), l));
          } else if (geo.has(l.id) && labelShown(l, geo.get(l.id), geo)) out.push(labelBox(geo.get(l.id), l));
        }
        return out;
      },
    },
    dialogue: { rects: () => lineRects('dialogue'), at: F },
    note: {
      rects: () =>
        lines()
          .filter((l) => l.note)
          .map((l) => {
            const g = band.lineGeometry(l);
            const s = band.s;
            const size = Math.max(9, Math.round(10 * s));
            const w = band.measure(l.note, band.fontText(size)); // the note's own font
            return { x: g.x1 + 2 * s, y: g.y + g.h - 5 * s - size, w: w + 6 * s, h: size + 4 * s, below: true };
          }),
      at: F + 31,
    },
    karaoke: { rects: () => lineRects('karaoke'), at: F },
    breath: { rects: () => lineRects('breath'), at: F - 33 },
    reaction: { rects: () => lineRects('reaction'), at: F - 34 },
    ambiance: {
      rects: () =>
        linesOf('ambiance').map((l) => {
          const g = band.lineGeometry(l);
          const lb = labelBox(g, l);
          return { x: lb.x, y: g.y, w: g.x1 + g.w - lb.x, h: g.h };
        }),
      at: F - 30,
    },
    drawing: {
      rects: () =>
        band.project.strokes.map((st) => {
          const xs = st.points.map(([f]) => band.frameToX(f));
          const ys = st.points.map(([, y]) => y * band.height);
          const pad = Math.max(1.5, st.r * 2 * band.height) + 5;
          const x = Math.min(...xs) - pad;
          const y = Math.min(...ys) - pad;
          return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
        }),
      at: F + 22,
    },
    boucle: { rects: () => markerRect('boucle', 10, 24), at: F - 56 },
    out: { rects: () => markerRect('out', 11, 11), at: F + 46 },
    scene: { rects: () => markerRect('scene', 6, 6), at: F + 56 },
  };
  // band → legend: what the pointer is over, most specific first
  const HOVER_ORDER = ['note', 'readword', 'label', 'karaoke', 'breath', 'reaction', 'drawing', 'boucle', 'out', 'scene', 'ambiance', 'dialogue', 'playhead', 'ruler'];

  const visibleRects = (list) => list.filter((r) => r.x + r.w > 0 && r.x < band.width && r.w > 0);

  /* ── state: who asks for a spotlight ── */
  const state = { legendHover: null, legendFocus: null, bandHover: null, pin: null, custom: null };
  const active = () => {
    if (state.legendHover) return { key: state.legendHover, dim: true };
    if (state.legendFocus) return { key: state.legendFocus, dim: true };
    if (state.bandHover) return { key: state.bandHover, dim: false };
    if (state.pin) return { key: state.pin, dim: true };
    if (state.custom) return { custom: state.custom, dim: true };
    return null;
  };

  let raf = 0;
  let shown = true; // something is drawn in the overlay
  const render = () => {
    raf = 0;
    const W = band.width;
    const H = band.height;
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const a = active();
    if (!a && !shown) return; // nothing to spotlight: playback costs nothing here
    shown = !!a;
    let rects = [];
    let label = '';
    if (a?.key) {
      rects = visibleRects(ELEMENTS[a.key].rects());
      label = nameOf[a.key];
    } else if (a?.custom) {
      rects = visibleRects(a.custom.rects());
      label = a.custom.label;
    }
    const r2 = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
    holes.innerHTML = rects.map((r) => ((r = r2(r)), `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" fill="#000"/>`)).join('');
    rings.innerHTML = rects
      .map((r) => ((r = r2(r)), `<rect x="${r.x + 0.5}" y="${r.y + 0.5}" width="${Math.max(0, r.w - 1)}" height="${Math.max(0, r.h - 1)}" rx="3"/>`))
      .join('');
    svg.classList.toggle('is-dim', !!(a && a.dim && rects.length));

    // tags: the element's name above its first rect, like the app tooltip
    const tagList = rects.some((r) => r.tag)
      ? rects.map((r) => ({ r, text: r.tag, small: true }))
      : rects.length
        ? [{ r: rects[0], text: label, below: rects[0].below }]
        : [];
    tags.innerHTML = tagList
      .map(
        ({ r, text, small, below }) =>
          `<span class="anat-spec__tag${small ? ' anat-spec__tag--track' : ''}" data-x="${r.x}" data-y="${r.y}" data-w="${r.w}" data-h="${r.h}"${below ? ' data-below' : ''}>${esc(text)}</span>`,
      )
      .join('');
    for (const el of tags.children) {
      const x = +el.dataset.x;
      const y = +el.dataset.y;
      const w = +el.dataset.w;
      const h = +el.dataset.h;
      const tw = el.offsetWidth;
      const th = el.offsetHeight;
      let left;
      let top;
      if (el.classList.contains('anat-spec__tag--track')) {
        left = clamp(x + 8, 4, W - tw - 4);
        top = y + 6;
      } else {
        left = clamp(x + w / 2 - tw / 2, 6, W - tw - 6);
        top = 'below' in el.dataset ? y + h + 6 : y - th - 6;
        if (top < 4) top = y + h + 6;
        if (top + th > H - 4) top = clamp(y + 6, 4, H - th - 4);
      }
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    const hot = a?.key || null;
    for (const b of items) b.classList.toggle('is-hot', b.dataset.el === hot);
  };
  const update = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };

  /* ── toolbar: play the two seconds before the slice, come back to it ── */
  const playBtn = q('play');
  const playIcon = root.querySelector('[data-anat-play-icon]');
  const backBtn = q('back');
  const tc = q('tc');
  const syncPlay = () => {
    const on = band.playing;
    playIcon.style.setProperty('--src', `url(/icons/${on ? 'pause' : 'resume'}.svg)`);
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.dataset.tip = on ? 'Pause' : 'Lecture';
  };
  const syncFrame = (f) => {
    tc.textContent = ctx.timecode(f);
    backBtn.setAttribute('aria-disabled', String(Math.abs(f - F) < 0.5));
  };
  playBtn.addEventListener('click', () => {
    if (band.playing) {
      band.pause();
      return;
    }
    if (band.frame >= F - 0.5) band.setFrame(START);
    band.play();
  });
  backBtn.addEventListener('click', () => {
    if (backBtn.getAttribute('aria-disabled') === 'true') return;
    band.seek(F, { animate: true, duration: 600 });
    ctx.announce('Bande revenue sur la tranche');
  });
  band.on('play', syncPlay);
  band.on('pause', syncPlay);
  band.on('parked', () => ctx.announce('Lecture arrêtée sur la tranche'));
  band.on('frame', (f) => {
    syncFrame(f);
    update();
  });
  band.on('resize', update);
  syncPlay();
  syncFrame(F);

  /* ── legend → band ── */
  // an element off the slice (narrow screens, or after scrubbing) is brought
  // under the reading bar, the way « Aller dessus » moves the playhead
  const bringIntoView = (k) => {
    const el = ELEMENTS[k];
    if (el.at == null) return false; // bar, ruler, tracks, labels: always there
    const all = el.rects();
    const inside = all.length > 0 && all.every((r) => r.x >= -2 && r.x + r.w <= band.width + 2);
    let goal = null;
    if (el.at === F) goal = F; // defined by the slice itself (read word, karaoke)
    else if (!inside) goal = fitsSlice() ? F : el.at;
    if (goal == null || Math.abs(band.frame - goal) < 0.5) return false;
    band.seek(goal, { animate: true, duration: 520 });
    return true;
  };
  // the caption above the band names the chosen element and explains it
  const caption = q('caption');
  const CAPTION_REST = caption.innerHTML;
  const setCaption = (k) => {
    if (!k) {
      caption.innerHTML = CAPTION_REST;
      return;
    }
    const b = items.find((x) => x.dataset.el === k);
    const name = b.querySelector('.anat-key__name').cloneNode(true);
    name.className = 'anat-spec__caption-name';
    const desc = document.createElement('span');
    desc.className = 'anat-spec__caption-desc';
    desc.textContent = b.querySelector('.anat-key__desc').textContent.trim();
    caption.replaceChildren(name, desc);
  };
  const pin = (k, { from = 'legend' } = {}) => {
    state.pin = state.pin === k ? null : k;
    state.custom = null;
    for (const b of items) b.setAttribute('aria-pressed', String(b.dataset.el === state.pin));
    reveal(state.pin);
    band.invalidate();
    setCaption(state.pin);
    if (state.pin && from === 'legend') {
      bringIntoView(state.pin);
      ctx.announce(`${nameOf[state.pin]} affiché sur la bande`);
    }
    update();
  };
  const unpin = () => {
    if (!state.pin && !state.custom) return;
    state.pin = null;
    state.custom = null;
    for (const b of items) b.setAttribute('aria-pressed', 'false');
    reveal(null);
    band.invalidate();
    setCaption(null);
    update();
  };
  for (const b of items) b.addEventListener('click', () => pin(b.dataset.el));
  key.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') unpin();
  });
  roving(key, '[data-el]');

  /* ── band → legend ── */
  const hitAt = (x, y) => {
    for (const k of HOVER_ORDER) {
      for (const r of ELEMENTS[k].rects()) {
        if (x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2) return k;
      }
    }
    return null;
  };
  const local = (e) => {
    const r = band.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let down = null;
  band.canvas.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pointerType === 'touch') {
      if (state.bandHover) {
        state.bandHover = null;
        update();
      }
      return;
    }
    const p = local(e);
    const k = hitAt(p.x, p.y);
    if (k !== state.bandHover) {
      state.bandHover = k;
      update();
    }
  });
  band.canvas.addEventListener('pointerleave', () => {
    state.bandHover = null;
    update();
  });
  band.canvas.addEventListener('pointerdown', (e) => {
    down = local(e);
  });
  band.canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const p = local(e);
    const moved = Math.abs(p.x - down.x) + Math.abs(p.y - down.y) > 5;
    down = null;
    if (moved) return;
    const k = hitAt(p.x, p.y);
    if (!k) return unpin();
    pin(k, { from: 'band' });
    // lines announce themselves (band.select); name the other elements here
    if (!band.hitTest(p.x, p.y) && state.pin) {
      const desc = key.querySelector(`[data-el="${k}"] .anat-key__desc`)?.textContent.trim();
      ctx.announce(`${nameOf[k]}. ${desc || ''}`);
    }
  });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') unpin();
  });

  ctx.settings.subscribe(update);
  if (document.fonts?.ready) document.fonts.ready.then(update);
  update();

  /* ── API for the tables below ── */
  const scrollToBand = () => {
    const r = stage.getBoundingClientRect();
    if (r.top < 40 || r.bottom > window.innerHeight) {
      stage.scrollIntoView({ block: 'center', behavior: reduced(ctx) ? 'auto' : 'smooth' });
    }
  };
  const spotlight = (label, rectsFn) => {
    state.pin = null;
    for (const b of items) b.setAttribute('aria-pressed', 'false');
    state.custom = { label, rects: rectsFn };
    update();
  };
  const lineAndLabel = (l) => () => {
    if (l.karaoke && !band.karaokeVisible(l)) return [];
    const g = band.lineGeometry(l);
    const geo = onScreen();
    const out = [box(g)];
    if (l.karaoke || (geo.has(l.id) && labelShown(l, geo.get(l.id), geo))) out.unshift(labelBox(g, l));
    return out;
  };
  return {
    band,
    lines: () => ALL.lines, // the tables list every line, shown or not
    goToLine(line) {
      // « Aller dessus »: the line appears and the playhead goes to its start
      for (const b of items) b.setAttribute('aria-pressed', 'false');
      reveal(null, [line.id]);
      setCaption(null);
      band.seek(line.start, { animate: true, duration: 600 });
      band.select(line);
      spotlight(line.character, lineAndLabel(line));
      scrollToBand();
      ctx.announce(`Tête de lecture sur la ligne : ${band.describe(line)}`);
    },
    showRole(name) {
      for (const b of items) b.setAttribute('aria-pressed', 'false');
      reveal(null, ALL.lines.filter((l) => l.character === name).map((l) => l.id));
      setCaption(null);
      band.invalidate();
      if (Math.abs(band.frame - F) > 0.5) band.seek(F, { animate: true, duration: 600 });
      spotlight(name, () => lines().filter((l) => l.character === name).flatMap((l) => lineAndLabel(l)()));
      scrollToBand();
      ctx.announce(`Répliques de ${name} mises en évidence sur la bande`);
    },
  };
}

/* ═══════════════════════════ respirations + réactions ═══════════════════════════ */

function initCodes(ctx, root) {
  const host = root.querySelector('[data-anat="qband"]');
  const Q = 2400;
  // AddQuickLine: a one-second line at the playhead, on track 1 (state.rs add_quick_line)
  const line = { id: 1, track: 0, start: Q, dur: 24, character: 'MAYA', color: CAST.MAYA, kind: 'dialogue', text: '(ah)', note: '', karaoke: false };
  const scaleFor = (w) => clamp(w / 460, 0.9, 1.25);
  const band = new ctx.Band(host, {
    project: { lines: [line], markers: [], strokes: [] },
    tracks: 1,
    startFrame: Q,
    scale: scaleFor(host.getBoundingClientRect().width || 500),
    interactive: false,
    settings: {
      get: () => ({ ...ctx.settings.get(), scrollSpeed: 1, highlightWord: false }),
      subscribe: (fn) => ctx.settings.subscribe(fn),
    },
  });
  new ResizeObserver(() => {
    const s = scaleFor(host.getBoundingClientRect().width);
    if (s !== band.opts.scale) {
      band.opts.scale = s;
      band.layout();
    }
  }).observe(host);

  const all = [...root.querySelectorAll('[data-anat="codes"] [data-code]')];
  for (const list of root.querySelectorAll('[data-anat="codes"]')) roving(list, '[data-code]', { keys: 'vertical' });
  for (const b of all) {
    b.addEventListener('click', () => {
      const code = b.dataset.code;
      line.text = code;
      line.kind = code === '↑' || code === '↓' ? 'breath' : 'dialogue';
      band.invalidate();
      for (const x of all) x.setAttribute('aria-pressed', String(x === b));
      const name = b.lastChild.textContent.trim(); // the item's meaning, after its code
      ctx.announce(`${name} : ligne d’une seconde posée à la tête de lecture`);
    });
  }
}

/* ═══════════════════════════ émotions du texte ═══════════════════════════ */

// Menu: src/workspaces/rythmo/view.rs EMOTION_CATEGORIES; labels: i18n/fr.toml text_emotion.*
const EMOTIONS = [
  ['Colère', [['anger_soft', 'Colère légère'], ['shake', 'Colère'], ['anger_contained', 'Colère sourde'], ['anger_heavy', 'Fureur'], ['anger_extreme', 'Colère extrême']]],
  ['Joie', [['joy_soft', 'Joie douce'], ['yay', 'Joie'], ['bounce', 'Excitation'], ['joy_burst', 'Joie débordante'], ['joy_extreme', 'Joie extrême']]],
  ['Peur', [['fear_soft', 'Peur légère'], ['wiggle', 'Peur'], ['fear_panic', 'Panique'], ['fear_strong', 'Peur forte'], ['fear_extreme', 'Peur extrême']]],
  ['Tristesse', [['sadness_soft', 'Tristesse légère'], ['pendulum', 'Tristesse'], ['sadness_deep', 'Tristesse profonde'], ['sadness_strong', 'Tristesse forte'], ['sadness_extreme', 'Tristesse extrême']]],
  ['Tendresse', [['tenderness_soft', 'Tendresse légère'], ['swing', 'Tendresse'], ['love_tender', 'Amour tendre'], ['tenderness_strong', 'Tendresse forte'], ['tenderness_extreme', 'Tendresse extrême']]],
  ['Dégoût', [['disgust_soft', 'Dégoût léger'], ['slide', 'Dégoût'], ['disgust', 'Dégoût'], ['disgust_strong', 'Dégoût fort'], ['disgust_extreme', 'Dégoût extrême']]],
  ['Doute', [['doubt_soft', 'Doute léger'], ['oscillation', 'Doute'], ['doubt', 'Doute'], ['doubt_strong', 'Doute fort'], ['doubt_extreme', 'Doute extrême']]],
  ['Question', [['question_soft', 'Question légère'], ['question', 'Question'], ['question_strong', 'Question forte'], ['question_extreme', 'Question extrême'], ['question_fast', 'Question rapide']]],
  ['Exclamation', [['exclamation_soft', 'Exclamation légère'], ['exclamation', 'Exclamation'], ['exclamation_strong', 'Exclamation forte'], ['exclamation_extreme', 'Exclamation extrême'], ['exclamation_huge', 'Exclamation énorme']]],
];

function rainbow(hue) {
  const h = (((hue % 1) + 1) % 1) * 6;
  const x = 1 - Math.abs((h % 2) - 1);
  const rgb = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][Math.min(5, Math.floor(h))];
  return `rgb(${rgb.map((c) => Math.round(c * 255)).join(' ')})`;
}

/** Port of text_emotion_transform (src/rythmo_line.rs): per grapheme offset
 *  (px), rotation (rad), horizontal skew, pivot (0–1 of the glyph box), tint. */
function emotionTransform(k, i, n, t) {
  const { sin, cos, PI } = Math;
  const p = t * 4 + i * 0.42;
  const v = { ox: 0, oy: 0, rot: 0, skew: 0, px: 0.5, py: 0.5, tint: null };
  const mod = (a, b) => ((a % b) + b) % b;
  switch (k) {
    case 'pendulum': v.rot = sin(p) * 0.22; v.py = 0; break;
    case 'swing': v.rot = sin(p) * 0.18; v.skew = cos(p) * 0.18; v.py = 0; v.ox = cos(p) * 1.5; break;
    case 'yay': v.tint = rainbow(t * 0.22 + i / n); break;
    case 'bounce': { const c = mod(t, 1) * n; const a = Math.floor(c); if (a === i) v.oy = -sin((c - a) * PI) * 7; break; }
    case 'slide': v.skew = sin(p) * 0.28; break;
    case 'oscillation': v.rot = sin(p) * 0.2; break;
    case 'shake': v.ox = sin(p * 3.7) * 2; v.oy = sin(p * 5.1 + 1.7) * 2; v.rot = sin(p * 4.3) * 0.035; break;
    case 'wiggle': v.ox = sin(p) * 3.2; v.oy = cos(p * 0.73) * 1.4; v.rot = sin(p * 0.8) * 0.055; break;
    case 'anger_heavy': v.ox = sin(p * 3.7) * 5.5; v.oy = sin(p * 5.1 + 1.7) * 5.5; v.rot = sin(p * 4.3) * 0.09; break;
    case 'anger_contained': v.ox = sin(p * 3.7) * 0.8; v.oy = sin(p * 5.1 + 1.7) * 0.8; v.rot = sin(p * 4.3) * 0.02; break;
    case 'joy_soft': v.tint = rainbow(t * 0.12 + i / n); break;
    case 'joy_burst': { const c = mod(t * 10, n); const a = Math.floor(c); if (a === i) v.oy = -sin((c - a) * PI) * 11; break; }
    case 'fear_panic': v.ox = sin(p * 6) * 4.5; v.oy = sin(p * 8 + 1.7) * 2; v.rot = sin(p * 7) * 0.08; break;
    case 'sadness_deep': v.rot = sin(t * 2 + i * 0.42) * 0.12; v.py = 0; v.oy = sin(t * 2 + i * 0.42) * 2; break;
    case 'love_tender': v.rot = sin(p) * 0.08; v.skew = cos(p) * 0.08; v.py = 0; v.oy = sin(p) * 1.5; break;
    case 'anger_soft':
    case 'exclamation_soft': v.ox = sin(p * 5) * 1.2; v.oy = cos(p * 6) * 1.2; v.rot = sin(p * 5) * 0.025; break;
    case 'anger_extreme':
    case 'exclamation_extreme': v.ox = sin(p * 3) * 8; v.oy = cos(p * 4) * 8; v.rot = sin(p * 4) * 0.13; break;
    case 'joy_strong': v.oy = sin(p * 1.4) * 8; break;
    case 'joy_extreme': v.oy = sin(p * 2) * 13; break;
    case 'fear_soft': v.ox = sin(p * 4) * 1.5; v.oy = cos(p * 5) * 0.8; break;
    case 'fear_strong': v.ox = sin(p * 7) * 5.5; v.oy = cos(p * 9) * 2.5; v.rot = sin(p * 8) * 0.1; break;
    case 'fear_extreme': v.ox = sin(p * 10) * 8; v.oy = cos(p * 12) * 4; v.rot = sin(p * 11) * 0.16; break;
    case 'sadness_soft': v.oy = sin(p * 0.7); break;
    case 'sadness_strong': v.oy = sin(p * 1.3) * 3.5; break;
    case 'sadness_extreme': v.oy = sin(p * 1.8) * 6; break;
    case 'tenderness_soft': v.rot = sin(p) * 0.04; break;
    case 'tenderness_strong': v.rot = sin(p) * 0.14; break;
    case 'tenderness_extreme': v.rot = sin(p) * 0.24; break;
    case 'disgust_soft': v.skew = sin(p) * 0.08; break;
    case 'disgust': v.skew = sin(p) * 0.22; break;
    case 'disgust_strong': v.skew = sin(p) * 0.38; break;
    case 'disgust_extreme': v.skew = sin(p) * 0.6; break;
    case 'doubt_soft': v.rot = sin(p) * 0.06; break;
    case 'doubt': v.rot = sin(p) * 0.2; break;
    case 'doubt_strong': v.rot = sin(p) * 0.34; break;
    case 'doubt_extreme': v.rot = sin(p) * 0.55; break;
    case 'question_soft': v.oy = sin(p) * 2; break;
    case 'question': v.oy = sin(p) * 4.5; break;
    case 'question_strong': v.oy = sin(p) * 6.5; break;
    case 'question_extreme': v.oy = sin(p) * 10; break;
    case 'question_fast': v.oy = sin(p * 2) * 7; break;
    case 'exclamation':
    case 'exclamation_strong': v.ox = sin(p * 3.7) * 3.8; v.oy = sin(p * 5.1) * 3.8; v.rot = sin(p * 4.3) * 0.06; break;
    case 'exclamation_huge': v.ox = sin(p * 2.5) * 10; v.oy = sin(p * 3.5) * 10; v.rot = sin(p * 3.5) * 0.16; break;
  }
  return v;
}

function initEmotions(ctx, root) {
  const q = (k) => root.querySelector(`[data-anat="${k}"]`);
  const canvas = q('emo-canvas');
  const g = canvas.getContext('2d');
  const famList = q('emo-families');
  const varList = q('emo-variants');
  const varHead = varList.querySelector('.anat-emo__dd-head');
  const readout = q('emo-readout');
  const pauseBtn = q('emo-pause');
  const pauseIcon = q('emo-pause-icon');
  const FONT = '"Archivo Variable", "Segoe UI", system-ui, sans-serif';
  const TEXT = 'Tu es enfin revenu…';
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('fr', { granularity: 'grapheme' }) : null;
  const graphemes = seg ? [...seg.segment(TEXT)].map((x) => x.segment) : Array.from(TEXT);

  // committed emotion, and the one previewed under the pointer
  let committed = { fam: 3, variant: 1 }; // Tristesse › Tristesse (pendulum)
  let preview = null;
  let shownFam = committed.fam;
  const current = () => preview || committed;

  /* ── menu (the app's « Émotion du texte » submenu and its variants) ── */
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'dropdown__item';
  remove.textContent = 'Retirer l’émotion';
  remove.dataset.emo = 'remove';
  famList.append(remove);
  const famButtons = EMOTIONS.map(([name], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dropdown__item anat-emo__fam';
    b.dataset.emo = 'family';
    b.dataset.fam = String(i);
    b.setAttribute('aria-controls', 'anat-emo-variants');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = `<span>${name}</span><span class="anat-emo__chev" aria-hidden="true"></span>`;
    famList.append(b);
    return b;
  });
  const variantButtons = [0, 1, 2, 3, 4].map((j) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dropdown__item';
    b.dataset.emo = 'variant';
    b.dataset.variant = String(j);
    b.setAttribute('aria-pressed', 'false');
    varList.append(b);
    return b;
  });

  const showFamily = (fi) => {
    shownFam = fi;
    const [name, vars] = EMOTIONS[fi];
    varHead.textContent = name;
    variantButtons.forEach((b, j) => {
      b.textContent = vars[j][1];
      b.setAttribute('aria-pressed', String(committed && committed.fam === fi && committed.variant === j));
    });
    famButtons.forEach((b, i) => {
      b.setAttribute('aria-expanded', String(i === fi));
      b.classList.toggle('is-open', i === fi);
    });
  };
  const describe = (c) => (c ? `${EMOTIONS[c.fam][0]} · ${EMOTIONS[c.fam][1][c.variant][1]}` : 'Aucune émotion');
  const syncReadout = () => {
    readout.textContent = describe(current());
  };
  const commit = (c) => {
    committed = c;
    preview = null;
    showFamily(c ? c.fam : shownFam);
    remove.setAttribute('aria-pressed', String(!c));
    syncReadout();
    kick();
    ctx.announce(c ? `Émotion du texte : ${EMOTIONS[c.fam][1][c.variant][1]}` : 'Émotion retirée');
  };

  remove.setAttribute('aria-pressed', 'false');
  remove.addEventListener('click', () => commit(null));
  famButtons.forEach((b, i) => {
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') showFamily(i);
    });
    b.addEventListener('click', (e) => {
      showFamily(i);
      if (e.detail === 0) variantButtons[0].focus(); // keyboard: step into the variants
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        showFamily(i);
        variantButtons[0].focus();
      }
    });
  });
  variantButtons.forEach((b, j) => {
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      preview = { fam: shownFam, variant: j };
      syncReadout();
      kick();
    });
    b.addEventListener('focus', () => {
      if (!b.matches(':focus-visible')) return;
      preview = { fam: shownFam, variant: j };
      syncReadout();
      kick();
    });
    b.addEventListener('click', () => commit({ fam: shownFam, variant: j }));
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'Escape') {
        e.preventDefault();
        preview = null;
        syncReadout();
        famButtons[shownFam].focus();
      }
    });
  });
  const endPreview = () => {
    preview = null;
    syncReadout();
    kick();
  };
  varList.addEventListener('pointerleave', endPreview);
  varList.addEventListener('focusout', (e) => {
    if (!varList.contains(e.relatedTarget)) endPreview();
  });
  roving(famList, '.dropdown__item', { keys: 'vertical' });
  roving(varList, '.dropdown__item', { keys: 'vertical' });
  showFamily(committed.fam);
  syncReadout();

  /* ── the line itself: a band crop, one track with its emotion lane ── */
  let W = 0;
  let H = 0;
  let dpr = 1;
  let s = 1;
  const layout = () => {
    const w = canvas.parentElement.getBoundingClientRect().width;
    s = clamp(w / 420, 0.8, 1.3);
    W = Math.max(200, w);
    // ruler, pad, line row, gap, emotion lane row, pad (rythmo_layout.rs text_emotion_copy_rect)
    H = Math.round(22 * s + 7 * s + 46 * s + 2 * s + 46 * s + 7 * s + 4 * s);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    draw(lastT);
  };

  let lastT = 0.9;
  const draw = (t) => {
    lastT = t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#050508';
    g.fillRect(0, 0, W, H);
    // ruler ticks every 2 frames (TICK_GAP_FRAMES)
    const ppf = 6 * s;
    g.fillStyle = 'rgba(100,100,115,0.5)';
    for (let k = 0, x = 6; x < W; k++, x += ppf * 2) g.fillRect(Math.round(x), 0, Math.max(1, s), (k % 2 ? 6 : 12) * s);

    const bodyH = Math.round(46 * s);
    const y = Math.round(22 * s + 7 * s);
    const labelSize = Math.round(bodyH * 0.6);
    const textSize = Math.round(bodyH * 0.56);
    const labelX = Math.round(14 * s);
    g.font = `italic 700 ${labelSize}px ${FONT}`;
    const labelW = g.measureText('JADE').width;
    g.textBaseline = 'alphabetic';
    g.fillStyle = CAST.JADE;
    // capitals level with the line's capitals, like the band engine (labelMetrics)
    g.font = `500 ${textSize}px ${FONT}`;
    g.textBaseline = 'middle';
    const tm = g.measureText('H');
    const capMid = y + bodyH * 0.52 + (tm.actualBoundingBoxDescent - tm.actualBoundingBoxAscent) / 2;
    g.font = `italic 700 ${labelSize}px ${FONT}`;
    g.textBaseline = 'alphabetic';
    const base = capMid + g.measureText('H').actualBoundingBoxAscent / 2;
    g.fillText('JADE', labelX, base);
    for (const off of [2, 5.5]) g.fillRect(labelX, base + off * s, labelW, 1.5 * s);

    const x1 = Math.round(labelX + labelW + Math.max(8 * s, 4 * ppf));
    const font = `500 ${textSize}px ${FONT}`;
    g.font = font;
    const natural = g.measureText(TEXT).width;
    const padX = 5 * s;
    // the line lasts a little longer than it reads: a gentle stretch
    const w = Math.round(Math.min(W - x1 - 14 * s, natural * 1.3 + padX * 2));
    g.fillStyle = 'rgba(20,20,26,0.3)';
    g.fillRect(x1, y, w, bodyH);
    g.strokeStyle = 'rgba(128,128,140,0.3)';
    g.lineWidth = 1;
    g.strokeRect(x1 + 0.5, y + 0.5, w - 1, bodyH - 1);

    // stretched text, drawn grapheme by grapheme like blit_emotional_text
    const sx = clamp((w - padX * 2) / natural, 0.2, 3.2);
    const c = current();
    const emo = c ? EMOTIONS[c.fam][1][c.variant][0] : null;
    let before = '';
    const midY = y + bodyH * 0.52;
    graphemes.forEach((gr, i) => {
      g.font = font;
      const a = g.measureText(before).width;
      const gw = g.measureText(gr).width;
      before += gr;
      const gx = x1 + padX + a * sx;
      const v = emo ? emotionTransform(emo, i, graphemes.length, t) : null;
      g.save();
      g.beginPath();
      g.rect(x1 - 20 * s, y - 16 * s, w + 40 * s, bodyH + 22 * s);
      g.clip();
      if (v) {
        const pxX = gw * sx * v.px;
        const pxY = bodyH * v.py;
        g.translate(gx + v.ox * s, y + v.oy * s);
        g.translate(pxX, pxY);
        g.rotate(v.rot);
        g.transform(1, 0, v.skew, 1, 0, 0);
        g.translate(-pxX, -pxY);
      } else g.translate(gx, y);
      g.scale(sx, 1);
      g.textBaseline = 'middle';
      g.fillStyle = v?.tint || '#ffffff';
      g.fillText(gr, 0, midY - y);
      g.restore();

      // emotion lane: a still copy under the line keeps the text readable
      if (v) {
        g.save();
        g.font = `500 ${Math.round(textSize * 0.68)}px ${FONT}`;
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,255,255,0.86)';
        g.translate(gx, y + bodyH + 2 * s + bodyH * 0.5);
        g.scale(sx, 1);
        g.fillText(gr, 0, 0);
        g.restore();
      }
    });
    if (emo) {
      g.strokeStyle = 'rgba(128,128,140,0.18)';
      g.setLineDash([3 * s, 3 * s]);
      g.strokeRect(x1 + 0.5, y + bodyH + 2 * s + 0.5, w - 1, bodyH - 1);
      g.setLineDash([]);
    }
  };

  /* ── animation: only on screen, only when allowed ── */
  let visible = false;
  let paused = false;
  let allowed = false; // one explicit press plays it even with reduced motion
  let raf = 0;
  const t0 = performance.now();
  const still = () => paused || (reduced(ctx) && !allowed);
  const moving = () => visible && !still() && current();
  const loop = (now) => {
    raf = 0;
    draw((now - t0) / 1000);
    if (moving()) raf = requestAnimationFrame(loop);
  };
  function kick() {
    if (moving()) {
      if (!raf) raf = requestAnimationFrame(loop);
    } else draw(reduced(ctx) && !allowed ? 0.9 : lastT);
  }
  const syncPause = () => {
    const off = still();
    pauseIcon.style.setProperty('--src', `url(/icons/${off ? 'resume' : 'pause'}.svg)`);
    const label = off ? 'Animer les lettres' : 'Mettre l’animation en pause';
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.dataset.tip = label;
    pauseBtn.setAttribute('aria-pressed', String(off));
  };
  pauseBtn.addEventListener('click', () => {
    if (still()) {
      paused = false;
      allowed = true;
    } else paused = true;
    syncPause();
    kick();
    ctx.announce(still() ? 'Animation en pause' : 'Animation des lettres');
  });
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    kick();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden && canvas.getBoundingClientRect().bottom > 0;
    kick();
  });
  ctx.settings.subscribe(() => {
    syncPause();
    kick();
  });
  new ResizeObserver(layout).observe(canvas.parentElement);
  if (document.fonts?.ready) document.fonts.ready.then(() => draw(lastT));
  syncPause();
  layout();
}

/* ═══════════════════════════ tableaux (Ctrl+I, Ctrl+P) ═══════════════════════════ */

function initTables(ctx, root, spec) {
  const linesList = root.querySelector('[data-anat="lines"]');
  const rolesList = root.querySelector('[data-anat="roles"]');
  const sorted = [...spec.lines()].sort((a, b) => a.start - b.start || a.track - b.track);
  linesList.innerHTML = sorted
    .map(
      (l) => `<li><button class="anat-table__row" type="button" data-line="${l.id}" aria-label="${esc(spec.band.describe(l))}. Aller dessus">
        <span class="anat-table__role">${esc(l.character)}</span><span class="anat-table__text">${esc(l.text)}</span></button></li>`,
    )
    .join('');
  // roles: dialogue characters, alphabetical (side_panel.rs roles())
  const roles = [...new Map(spec.lines().filter((l) => l.kind !== 'ambiance').map((l) => [l.character, l.color])).entries()].sort((a, b) =>
    a[0].localeCompare(b[0], 'fr'),
  );
  rolesList.innerHTML = roles
    .map(
      ([name, color]) => `<li><button class="anat-table__row anat-table__row--role" type="button" data-role="${esc(name)}" aria-label="${esc(name)}, voir ses répliques sur la bande">
        <span class="anat-table__swatch" style="--c:${color}"></span><span class="anat-table__role">${esc(name)}</span></button></li>`,
    )
    .join('');

  roving(linesList, '.anat-table__row', { keys: 'vertical' });
  roving(rolesList, '.anat-table__row', { keys: 'vertical' });
  linesList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-line]');
    if (!b) return;
    const line = spec.lines().find((l) => String(l.id) === b.dataset.line);
    if (line) spec.goToLine(line);
  });
  rolesList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-role]');
    if (b) spec.showRole(b.dataset.role);
  });
  // selection on the band shows in the table, as in the app
  spec.band.on('select', (line) => {
    for (const b of linesList.querySelectorAll('[data-line]')) b.classList.toggle('is-selected', !!line && b.dataset.line === String(line.id));
  });
}

export function init(ctx) {
  const root = document.getElementById('bande');
  if (!root) return;
  const spec = initSpecimen(ctx, root);
  initCodes(ctx, root);
  initEmotions(ctx, root);
  initTables(ctx, root, spec);
}
