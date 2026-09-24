// Bande rythmo renderer + instrument.
// Geometry and colours follow src/rythmo_cpu_renderer.rs and src/ui/theme.rs:
// fixed red reading bar in the centre, time flowing right → left, dialogue
// stretched over its duration, bold-italic double-underlined character labels,
// boucle / out / scene markers, breath diagonals, karaoke dot, drawings pinned
// to the timeline.

import { syllabify, words } from './text.js';

export const FPS = 24;
const FONT = '"Archivo Variable", "Segoe UI", system-ui, sans-serif';
const COUNT_IN = Math.round(1.5 * FPS); // KARAOKE_COUNT_IN_SECONDS
const TICK_GAP = 2; // TICK_GAP_FRAMES

const C = {
  bg: '#050508',
  tick: 'rgba(100,100,115,0.5)',
  playhead: '#ff050d',
  glow: 'rgba(255,0,8,0.55)',
  boucle: 'rgba(230,38,38,0.9)',
  boucle2: 'rgba(217,38,38,0.9)',
  out: 'rgba(217,115,115,0.7)',
  scene: 'rgba(230,230,240,0.78)',
  lineBg: 'rgba(20,20,26,0.3)',
  lineBgHover: 'rgba(26,26,33,0.4)',
  lineBorder: 'rgba(128,128,140,0.3)',
  lineBorderHover: 'rgba(153,153,166,0.5)',
  handle: 'rgba(230,230,242,0.8)',
  actionBg: 'rgba(115,102,217,0.07)',
  actionBgHover: 'rgba(115,102,217,0.22)',
  actionBorder: 'rgba(140,128,255,0.45)',
  actionBorderHover: '#8c80ff',
  focus: '#6194f5',
  text: '#ffffff',
  readWord: '#ffe14d',
  note: 'rgba(224,224,224,0.78)',
  breath: 'rgba(220,220,230,0.9)',
  ambiance: '#338cff',
  ambianceText: '#f21f29',
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let uid = 1000;

export class Band {
  /**
   * @param {HTMLElement} host  empty element; the band sizes its height itself
   * @param {object} opts
   *   project   {lines:[], markers:[], strokes:[]}
   *   tracks    number of visible tracks (1–4)
   *   scale     number | undefined (auto from width)
   *   startFrame, stopAt (frame where playback parks)
   *   interactive (default true), editable (default true)
   *   label     accessible name
   *   settings  store with get()/subscribe(): scrollSpeed, highlightWord, charColorText, reduceMotion
   *   announce  (text, {priority}) => void
   */
  constructor(host, opts = {}) {
    this.loop = this.loop.bind(this);
    this.raf = 0;
    this.lastT = performance.now();
    this.host = host;
    this.opts = opts;
    this.project = opts.project || { lines: [], markers: [], strokes: [] };
    this.project.strokes ||= [];
    this.tracks = opts.tracks || 4;
    this.frame = opts.startFrame ?? 0;
    this.stopAt = opts.stopAt ?? null;
    this.playing = false;
    this.selection = new Set();
    this.hoverId = null;
    this.focusId = null;
    this.tool = 'select';
    this.brush = { color: '#ffffff', size: 'M' };
    this.listeners = {};
    this.measureCache = new Map();
    this.settings = opts.settings || {
      get: () => ({ scrollSpeed: 1, highlightWord: true, charColorText: false, reduceMotion: false }),
      subscribe: () => () => {},
    };
    this.announce = opts.announce || (() => {});
    this.interactive = opts.interactive !== false;
    this.editable = opts.editable !== false && this.interactive;
    this.visible = true;
    this.dirty = true;
    this.tween = null;
    this.held = { q: false, d: false };

    host.classList.add('band');
    host.innerHTML = '';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'band__canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.hits = document.createElement('div');
    this.hits.className = 'band__hits';
    host.append(this.canvas, this.hits);
    this.ctx = this.canvas.getContext('2d');
    this.anchors = new Map();

    if (this.interactive) {
      host.tabIndex = 0;
      host.setAttribute('role', 'group');
      host.setAttribute('aria-roledescription', 'bande rythmo');
      host.setAttribute('aria-label', opts.label || 'Bande rythmo');
      this.bindPointer();
      this.bindKeys();
    }

    this.unsub = this.settings.subscribe(() => {
      this.measureCache.clear();
      this.layout();
    });
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(host);
    this.io = new IntersectionObserver((entries) => {
      // the last entry is the freshest one after fast scrolls or hash jumps
      this.visible = entries[entries.length - 1].isIntersecting;
      if (this.visible) this.invalidate();
    });
    this.io.observe(host);

    this.layout();
    if (document.fonts?.ready) document.fonts.ready.then(() => { this.measureCache.clear(); this.invalidate(); });
    this.kick();
  }

  /* ───────────── events ───────────── */
  on(evt, fn) {
    (this.listeners[evt] ||= new Set()).add(fn);
    return () => this.listeners[evt].delete(fn);
  }
  emit(evt, payload) {
    this.listeners[evt]?.forEach((fn) => fn(payload, this));
  }

  /* ───────────── geometry ───────────── */
  layout() {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(200, rect.width || this.host.clientWidth || 800);
    const st = this.settings.get();
    const s = this.opts.scale ?? clamp(width / 1150, 0.8, 1.3);
    this.s = s;
    this.width = width;
    this.rulerH = Math.round(22 * s);
    this.pad = Math.round(7 * s);
    this.bodyH = Math.round(40 * s);
    this.trackH = this.bodyH + this.pad * 2;
    this.height = this.rulerH + this.tracks * this.trackH + Math.round(4 * s);
    this.ppf = 6 * s * (st.scrollSpeed || 1);
    this.textSize = Math.round(this.bodyH * 0.56);
    this.labelSize = Math.round(this.bodyH * 0.6);
    this.host.style.height = `${this.height}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.emit('resize', { width, height: this.height, s, ppf: this.ppf });
    this.invalidate();
  }

  get cx() {
    return this.width / 2;
  }
  frameToX(f) {
    return this.cx + (f - this.frame) * this.ppf;
  }
  xToFrame(x) {
    return this.frame + (x - this.cx) / this.ppf;
  }
  trackY(t) {
    return this.rulerH + t * this.trackH + this.pad;
  }
  visibleFrames() {
    const half = this.width / this.ppf / 2;
    return [this.frame - half - 2, this.frame + half + 2];
  }

  /* ───────────── measuring ───────────── */
  measure(text, font) {
    const key = font + '|' + text;
    let w = this.measureCache.get(key);
    if (w === undefined) {
      this.ctx.font = font;
      w = this.ctx.measureText(text).width;
      this.measureCache.set(key, w);
    }
    return w;
  }
  fontText(size = this.textSize) {
    return `500 ${size}px ${FONT}`;
  }
  fontLabel(size = this.labelSize) {
    return `italic 700 ${size}px ${FONT}`;
  }

  lineGeometry(line) {
    const y = this.trackY(line.track);
    let x1;
    let w;
    let centered = false;
    if (line.karaoke) {
      const size = Math.round(this.textSize * 1.2);
      w = this.measure(line.text, this.fontText(size)) + this.bodyH * 0.4;
      x1 = this.cx - w / 2;
      centered = true;
    } else {
      x1 = this.frameToX(line.start);
      w = line.dur * this.ppf;
    }
    let labelW = 0;
    let labelText = '';
    if (line.character && line.kind !== 'breath-anon') {
      labelText = line.kind === 'ambiance' ? `amb. ${line.character}` : line.character;
      labelW = this.measure(labelText.toUpperCase(), this.fontLabel());
    }
    const gap = centered ? 6 * this.s : Math.max(8 * this.s, 4 * this.ppf);
    const labelX = x1 - gap - labelW;
    return { x1, w, y, h: this.bodyH, labelX, labelW, labelText, gap, centered };
  }

  karaokeVisible(line) {
    return this.frame >= line.start - COUNT_IN && this.frame <= line.start + line.dur;
  }

  isLineOnScreen(line, g = this.lineGeometry(line)) {
    if (line.karaoke) return this.karaokeVisible(line);
    return g.x1 + g.w >= -40 && g.labelX <= this.width + 40;
  }

  /* ───────────── playback ───────────── */
  play() {
    if (this.playing) return;
    if (this.stopAt != null && Math.abs(this.frame - this.stopAt) < 0.5) {
      // replay from the start of the scene when parked
      this.frame = this.opts.startFrame ?? 0;
    }
    this.playing = true;
    this.tween = null;
    this.lastT = performance.now();
    this.emit('play');
    this.kick();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.emit('pause');
    this.invalidate();
  }
  toggle() {
    this.playing ? this.pause() : this.play();
  }
  seek(frame, { animate = false, duration = 900 } = {}) {
    this.pause();
    const reduce = this.settings.get().reduceMotion;
    if (animate && !reduce) {
      this.tween = { from: this.frame, to: frame, t0: performance.now(), duration };
      this.kick();
    } else {
      this.tween = null;
      this.setFrame(frame);
    }
  }
  step(n) {
    this.pause();
    this.setFrame(Math.round(this.frame) + n);
  }
  setFrame(f) {
    this.frame = f;
    this.emit('frame', f);
    this.invalidate();
  }
  invalidate() {
    this.dirty = true;
    this.kick();
  }
  kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  loop(now) {
    this.raf = 0;
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    let keepGoing = false;

    if (this.tween) {
      const t = clamp((now - this.tween.t0) / this.tween.duration, 0, 1);
      this.frame = this.tween.from + (this.tween.to - this.tween.from) * easeInOut(t);
      this.emit('frame', this.frame);
      this.dirty = true;
      if (t >= 1) {
        this.tween = null;
        this.emit('seeked', this.frame);
      } else keepGoing = true;
    } else if (this.playing) {
      let rate = 1;
      if (this.stopAt != null && this.frame < this.stopAt) {
        const left = this.stopAt - this.frame;
        if (left < 30) rate = Math.max(0.12, left / 30); // tape slowing to a stop
      }
      let next = this.frame + dt * FPS * rate;
      if (this.stopAt != null && this.frame < this.stopAt && next >= this.stopAt) {
        next = this.stopAt;
        this.frame = next;
        this.playing = false;
        this.emit('frame', next);
        this.emit('pause');
        this.emit('parked');
      } else {
        this.frame = next;
        this.emit('frame', next);
        keepGoing = true;
      }
      this.dirty = true;
    }

    const pan = (this.held.d ? 1 : 0) - (this.held.q ? 1 : 0);
    if (pan) {
      this.frame += pan * dt * FPS * 2.5;
      this.emit('frame', this.frame);
      this.dirty = true;
      keepGoing = true;
    }

    const hasKaraokeBounce =
      this.project.lines.some((l) => l.karaoke && this.karaokeVisible(l)) && this.playing;
    if (this.dirty && this.visible) {
      this.draw();
      this.dirty = false;
    }
    if ((keepGoing || hasKaraokeBounce) && this.visible) this.raf = requestAnimationFrame(this.loop);
  }

  /* ───────────── drawing ───────────── */
  draw() {
    const { ctx, width: W, height: H, s } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    this.drawRuler();
    this.drawMarkers();

    const lines = this.project.lines;
    const geo = new Map();
    for (const line of lines) {
      if (line.karaoke) continue;
      const g = this.lineGeometry(line);
      if (!this.isLineOnScreen(line, g)) continue;
      geo.set(line.id, g);
    }
    // body first, labels on top (labels overlap previous lines' tails)
    for (const line of lines) if (geo.has(line.id)) this.drawLineBody(line, geo.get(line.id));
    for (const line of lines) if (geo.has(line.id)) this.drawLabel(line, geo.get(line.id), geo);
    for (const line of lines) {
      if (!line.karaoke || !this.karaokeVisible(line)) continue;
      const g = this.lineGeometry(line);
      geo.set(line.id, g);
      this.drawKaraoke(line, g);
      this.drawLabel(line, g, geo);
    }
    this.drawStrokes();
    if (this.pendingStroke) this.drawStroke(this.pendingStroke);
    this.drawPlayhead();
    this.syncAnchors(geo);
    void s;
  }

  drawRuler() {
    const { ctx, s } = this;
    const [f0, f1] = this.visibleFrames();
    const first = Math.floor(f0 / TICK_GAP) * TICK_GAP;
    ctx.fillStyle = C.tick;
    const tw = Math.max(1, s);
    for (let f = first; f <= f1; f += TICK_GAP) {
      const x = this.frameToX(f);
      const long = Math.floor(f / TICK_GAP) % 2 === 0;
      ctx.fillRect(Math.round(x), 0, tw, (long ? 12 : 6) * s);
    }
  }

  drawMarkers() {
    const { ctx, s, height: H } = this;
    const markers = this.project.markers;
    let loop = 0;
    const sorted = [...markers].sort((a, b) => a.frame - b.frame);
    const numbers = new Map();
    for (const m of sorted) if (m.kind === 'boucle') numbers.set(m, ++loop);
    for (const m of sorted) {
      const x = this.frameToX(m.frame);
      if (x < -20 * s || x > this.width + 20 * s) continue;
      const cy = H / 2;
      if (m.kind === 'boucle') {
        ctx.fillStyle = C.boucle;
        ctx.fillRect(x - s, 0, 2 * s, H);
        const arm = 10 * s;
        ctx.strokeStyle = C.boucle;
        ctx.lineWidth = 2.5 * s;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(x - arm / 2, cy - arm / 2);
        ctx.lineTo(x + arm / 2, cy + arm / 2);
        ctx.moveTo(x - arm / 2, cy + arm / 2);
        ctx.lineTo(x + arm / 2, cy - arm / 2);
        ctx.stroke();
        ctx.fillStyle = C.boucle2;
        ctx.font = `700 ${Math.round(16 * s)}px ${FONT}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(numbers.get(m)), x + 8 * s, cy + 12 * s);
      } else if (m.kind === 'out') {
        ctx.fillStyle = C.out;
        ctx.fillRect(x - s, 0, 2 * s, H);
        const bh = H * 0.15;
        ctx.strokeStyle = C.out;
        ctx.lineWidth = 2 * s;
        for (const off of [-5, 5]) {
          const ox = x + off * s;
          ctx.beginPath();
          ctx.moveTo(ox - bh * 0.3, cy - bh);
          ctx.lineTo(ox + bh * 0.3, cy + bh);
          ctx.stroke();
        }
      } else if (m.kind === 'scene') {
        ctx.fillStyle = C.scene;
        ctx.fillRect(x - s, 0, 2 * s, H);
      }
    }
  }

  lineStyle(line) {
    const hovered = this.hoverId === line.id;
    if (line.action) {
      return {
        bg: hovered ? C.actionBgHover : C.actionBg,
        border: hovered ? C.actionBorderHover : C.actionBorder,
      };
    }
    return {
      bg: hovered ? C.lineBgHover : C.lineBg,
      border: hovered ? C.lineBorderHover : C.lineBorder,
    };
  }

  drawLineBody(line, g) {
    const { ctx, s } = this;
    const st = this.settings.get();
    const { x1, w, y, h } = g;
    if (this.interactive || line.action) {
      const style = this.lineStyle(line);
      ctx.fillStyle = style.bg;
      ctx.fillRect(x1, y, w, h);
      ctx.strokeStyle = style.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x1) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
    }

    if (line.text === '↑' || line.text === '↓') {
      const m = 4 * Math.max(1, s);
      const up = line.text === '↑';
      ctx.strokeStyle = C.breath;
      ctx.lineWidth = 2 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1 + m, up ? y + h - m : y + m);
      ctx.lineTo(x1 + w - m, up ? y + m : y + h - m);
      ctx.stroke();
    } else if (line.text) {
      let tint = '#ffffff';
      if (line.kind === 'ambiance') tint = C.ambianceText;
      else if (st.charColorText && line.color) tint = line.color;
      if (line.action) tint = '#ffffff';
      const reserve = line.kind === 'ambiance' ? Math.min(54 * s, w * 0.3) : 0;
      this.drawStretched(line, x1 + reserve, y, w - reserve, h, tint, st.highlightWord && !line.action);
    }

    if (line.note) {
      const size = Math.max(11, Math.round(10 * s));
      ctx.font = `500 ${size}px ${FONT}`;
      ctx.fillStyle = C.note;
      ctx.textBaseline = 'alphabetic';
      ctx.save();
      ctx.beginPath();
      ctx.rect(x1 + 4 * s, y, w - 8 * s, h);
      ctx.clip();
      ctx.fillText(line.note, x1 + 5 * s, y + h - 4 * s);
      ctx.restore();
    }

    if (this.selection.has(line.id)) {
      const hw = 6 * s;
      ctx.fillStyle = C.handle;
      ctx.fillRect(x1, y, hw, h);
      ctx.fillRect(x1 + w - hw, y, hw, h);
      ctx.strokeStyle = 'rgba(230,230,242,0.6)';
      ctx.strokeRect(Math.round(x1) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
    }
    if (this.focusId === line.id) {
      ctx.strokeStyle = C.focus;
      ctx.lineWidth = 2;
      const lx = g.labelW ? g.labelX - 4 : x1 - 3;
      ctx.strokeRect(lx, y - 3, x1 + w + 3 - lx, h + 6);
    }
  }

  drawStretched(line, x, y, w, h, tint, highlight) {
    const { ctx, s } = this;
    const hasNote = !!line.note;
    const font = this.fontText(hasNote ? Math.round(this.bodyH * 0.48) : this.textSize);
    const natural = this.measure(line.text, font);
    const padX = 5 * s;
    const avail = Math.max(4, w - padX * 2);
    // the app stretches text over the whole duration; buttons cap it so the
    // download lines stay readable at a glance
    const sx = clamp(avail / Math.max(1, natural), 0.2, line.action ? 1.9 : 3.2);
    // capitals centred on the line's text axis (the label uses the same axis)
    const baseline = y + h * this.textAxis(line) + this.capHeight(font) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x + padX, baseline);
    ctx.scale(sx, 1);
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = tint;
    ctx.fillText(line.text, 0, 0);
    if (highlight && !line.action) {
      // "Illuminer en jaune le mot à la ligne de lecture"
      const px = (this.cx - (x + padX)) / sx;
      if (px >= 0 && px <= natural) {
        for (const wd of words(line.text)) {
          const a = this.measure(line.text.slice(0, wd.start), font);
          const b = this.measure(line.text.slice(0, wd.end), font);
          if (px >= a && px <= b + this.measure(' ', font)) {
            ctx.fillStyle = C.readWord;
            ctx.fillText(line.text.slice(wd.start, wd.end), a, 0);
            break;
          }
        }
      }
    }
    ctx.restore();
  }

  drawLabel(line, g, geo) {
    if (!g.labelText) return;
    const { ctx, s } = this;
    const color = line.kind === 'ambiance' ? C.ambiance : line.color || '#fff';
    // collisions: same character → hide, other character → 60 % (CHARACTER_BADGE_COLLISION_OPACITY)
    let alpha = 1;
    for (const [id, og] of geo) {
      if (id === line.id) continue;
      const other = this.project.lines.find((l) => l.id === id);
      if (!other || other.track !== line.track) continue;
      if (g.labelX < og.x1 + og.w && g.labelX + g.labelW > og.x1) {
        if (other.character === line.character && line.kind !== 'ambiance') return;
        alpha = 0.6;
      }
    }
    const text = g.labelText.toUpperCase();
    const m = this.labelMetrics(g, line);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = this.fontLabel();
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(text, g.labelX, m.baseline);
    for (const y of m.underlines) ctx.fillRect(g.labelX, y, g.labelW, 1.5 * s);
    ctx.restore();
  }

  /** Where a line's text sits: the vertical axis its capitals are centred on. */
  textAxis(line) {
    if (line?.karaoke) return 0.6; // room for the bouncing dot above
    if (line?.note) return 0.38; // room for the note below
    return 0.5;
  }

  /** Cap height of a font, measured on the real glyphs (cached). */
  capHeight(font) {
    const key = 'cap|' + font;
    let v = this.measureCache.get(key);
    if (v === undefined) {
      this.ctx.font = font;
      v = this.ctx.measureText('H').actualBoundingBoxAscent || parseFloat(font.match(/(\d+)px/)?.[1] || 16) * 0.7;
      this.measureCache.set(key, v);
    }
    return v;
  }

  /** Vertical geometry of a character label: its capitals sit on the same
   *  axis as the capitals of its line; the double underline hangs below. */
  labelMetrics(g, line) {
    const s = this.s;
    const cap = this.capHeight(this.fontLabel());
    const baseline = g.y + g.h * this.textAxis(line) + cap / 2;
    return {
      baseline,
      top: baseline - cap,
      underlines: [baseline + 2 * s, baseline + 5.5 * s],
      bottom: baseline + 7 * s,
    };
  }

  drawKaraoke(line, g) {
    const { ctx, s } = this;
    const size = Math.round(this.textSize * 1.2);
    const font = this.fontText(size);
    const { x1, w, y, h } = g;
    const padX = this.bodyH * 0.2;
    const sylls = (line._syll ||= syllabify(line.text));
    const total = line.text.length || 1;
    const p = clamp((this.frame - line.start) / line.dur, 0, 1);
    const charPos = p * total;
    let k = sylls.findIndex((sy) => charPos < sy.start + sy.text.length);
    if (k < 0) k = sylls.length - 1;

    const style = this.lineStyle(line);
    if (this.interactive) {
      ctx.fillStyle = style.bg;
      ctx.fillRect(x1, y, w, h);
      ctx.strokeStyle = style.border;
      ctx.strokeRect(Math.round(x1) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
    }
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    const tx = x1 + padX;
    const ty = y + h * this.textAxis(line) + this.capHeight(font) / 2;
    const counting = this.frame < line.start;
    sylls.forEach((sy, i) => {
      const a = this.measure(line.text.slice(0, sy.start), font);
      ctx.fillStyle = !counting && i < k ? line.color || '#fff' : '#fff';
      if (!counting && i === k) ctx.fillStyle = line.color || '#fff';
      ctx.fillText(sy.text, tx + a, ty);
    });

    // bouncing dot (KARAOKE_DOT_SIZE 7)
    const r = 3.5 * s * 1.3;
    const top = y + h * 0.18;
    const amp = h * 0.22;
    const center = (i) => {
      const sy = sylls[clamp(i, 0, sylls.length - 1)];
      const a = this.measure(line.text.slice(0, sy.start), font);
      const b = this.measure(line.text.slice(0, sy.start + sy.text.trimEnd().length), font);
      return tx + (a + b) / 2;
    };
    let dx;
    let dy;
    if (counting) {
      const q = clamp((this.frame - (line.start - COUNT_IN)) / COUNT_IN, 0, 1);
      const bounce = (q * 3) % 1;
      dx = x1 - 50 * s + (center(0) - (x1 - 50 * s)) * q;
      dy = top + amp - amp * Math.abs(Math.sin(Math.PI * bounce));
    } else {
      const sy = sylls[k];
      const segStart = sy.start / total;
      const segEnd = (sy.start + sy.text.length) / total;
      const q = clamp((p - segStart) / Math.max(1e-6, segEnd - segStart), 0, 1);
      dx = center(k) + (center(k + 1) - center(k)) * (k + 1 < sylls.length ? q : 0);
      dy = top + amp - amp * Math.sin(Math.PI * q);
    }
    ctx.fillStyle = line.color || '#fff';
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();

    if (this.selection.has(line.id)) {
      ctx.fillStyle = C.handle;
      ctx.fillRect(x1, y, 6 * s, h);
      ctx.fillRect(x1 + w - 6 * s, y, 6 * s, h);
    }
  }

  drawStrokes() {
    for (const st of this.project.strokes) this.drawStroke(st);
  }
  drawStroke(st) {
    const { ctx, height: H } = this;
    if (!st.points.length) return;
    ctx.strokeStyle = st.color;
    ctx.fillStyle = st.color;
    ctx.lineWidth = Math.max(1.5, st.r * 2 * H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    st.points.forEach(([f, yf], i) => {
      const x = this.frameToX(f);
      const y = yf * H;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    if (st.points.length === 1) {
      const [f, yf] = st.points[0];
      ctx.arc(this.frameToX(f), yf * H, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.stroke();
  }

  drawPlayhead() {
    const { ctx, height: H } = this;
    const x = this.cx - 1.5;
    ctx.save();
    ctx.shadowColor = C.glow;
    ctx.shadowBlur = 10;
    ctx.fillStyle = C.playhead;
    ctx.fillRect(x, 0, 3, H);
    ctx.restore();
  }

  /* ───────────── accessible hit layer ─────────────
     Action lines (downloads, links) get real <a> elements positioned over the
     canvas: native links, keyboard focus, screen-reader names. */
  syncAnchors(geo) {
    const actionLines = this.project.lines.filter((l) => l.action);
    const seen = new Set();
    for (const line of actionLines) {
      seen.add(line.id);
      let a = this.anchors.get(line.id);
      if (!a) {
        a = document.createElement('a');
        a.className = 'band__hit';
        a.addEventListener('focus', () => {
          this.focusId = line.id;
          const g = this.lineGeometry(line);
          if (g.x1 < 0 || g.x1 + g.w > this.width) this.seek(line.start + line.dur / 2 - 4, { animate: true, duration: 500 });
          this.invalidate();
        });
        a.addEventListener('blur', () => {
          if (this.focusId === line.id) this.focusId = null;
          this.invalidate();
        });
        a.addEventListener('pointerenter', () => {
          this.hoverId = line.id;
          this.invalidate();
          this.emit('hover', { line, el: a });
        });
        a.addEventListener('pointerleave', () => {
          if (this.hoverId === line.id) this.hoverId = null;
          this.invalidate();
          this.emit('hover', { line: null, el: a });
        });
        a.addEventListener('click', (e) => {
          this.selection = new Set([line.id]);
          this.invalidate();
          if (line.action.onActivate) line.action.onActivate(e, line);
          this.emit('activate', line);
        });
        this.hits.append(a);
        this.anchors.set(line.id, a);
      }
      const act = line.action;
      if (act.href) a.href = act.href;
      else a.removeAttribute('href');
      if (!act.href) {
        a.setAttribute('role', 'button');
        a.tabIndex = 0;
      }
      if (act.external) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      a.setAttribute('aria-label', act.label || line.text);
      if (act.description) a.setAttribute('aria-description', act.description);
      if (this.opts.hitsFocusable === false) {
        // a DOM equivalent exists next to this band: keep the pointer target only
        a.tabIndex = -1;
        a.setAttribute('aria-hidden', 'true');
      }
      const g = geo.get(line.id) || this.lineGeometry(line);
      const left = g.labelW ? g.labelX - 4 : g.x1;
      const right = g.x1 + g.w;
      const onScreen = right > 0 && left < this.width;
      a.style.transform = `translate(${Math.round(Math.max(-2000, left))}px, ${Math.round(g.y)}px)`;
      a.style.width = `${Math.max(24, Math.round(right - left))}px`;
      a.style.height = `${Math.round(g.h)}px`;
      a.dataset.offscreen = onScreen ? 'false' : 'true';
    }
    for (const [id, a] of this.anchors) {
      if (!seen.has(id)) {
        a.remove();
        this.anchors.delete(id);
      }
    }
  }

  anchorFor(id) {
    return this.anchors.get(id);
  }

  /* ───────────── pointer ───────────── */
  hitTest(x, y) {
    const lines = this.project.lines;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.karaoke && !this.karaokeVisible(line)) continue;
      const g = this.lineGeometry(line);
      if (y >= g.y && y <= g.y + g.h && x >= g.x1 && x <= g.x1 + g.w) return line;
    }
    return null;
  }

  bindPointer() {
    const el = this.canvas;
    let drag = null;
    const pos = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = pos(e);
      el.setPointerCapture(e.pointerId);
      this.host.focus({ preventScroll: true });
      if (this.tool === 'draw' && this.editable) {
        this.pendingStroke = { id: uid++, color: this.brush.color, r: { S: 0.008, M: 0.015, L: 0.028 }[this.brush.size], points: [[this.xToFrame(p.x), p.y / this.height]] };
        drag = { mode: 'draw' };
        this.invalidate();
        return;
      }
      if (this.tool === 'erase' && this.editable) {
        drag = { mode: 'erase' };
        this.eraseAt(p);
        return;
      }
      const line = this.hitTest(p.x, p.y);
      drag = { mode: 'pending', x0: p.x, y0: p.y, frame0: this.frame, line, start0: line?.start, track0: line?.track };
    });
    el.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (!drag) {
        const line = this.hitTest(p.x, p.y);
        const id = line ? line.id : null;
        if (id !== this.hoverId) {
          this.hoverId = id;
          this.invalidate();
        }
        el.style.cursor = this.tool === 'draw' ? 'crosshair' : this.tool === 'erase' ? 'cell' : line && this.editable && !line.karaoke ? 'move' : 'grab';
        return;
      }
      if (drag.mode === 'draw') {
        this.pendingStroke.points.push([this.xToFrame(p.x), p.y / this.height]);
        this.invalidate();
        return;
      }
      if (drag.mode === 'erase') return this.eraseAt(p);
      const dx = p.x - drag.x0;
      if (drag.mode === 'pending' && Math.abs(dx) + Math.abs(p.y - drag.y0) > 4) {
        const movable = drag.line && this.editable && !drag.line.karaoke && !drag.line.locked;
        drag.mode = movable ? 'move' : 'scrub';
        if (drag.mode === 'scrub') this.pause();
        el.style.cursor = movable ? 'move' : 'grabbing';
      }
      if (drag.mode === 'scrub') this.setFrame(drag.frame0 - dx / this.ppf);
      if (drag.mode === 'move') {
        const line = drag.line;
        line.start = Math.round(drag.start0 + dx / this.ppf);
        const dt = Math.round((p.y - drag.y0) / this.trackH);
        line.track = clamp(drag.track0 + dt, 0, this.tracks - 1);
        this.selection = new Set([line.id]);
        this.invalidate();
      }
    });
    const end = (e) => {
      if (!drag) return;
      const p = pos(e);
      if (drag.mode === 'draw') {
        this.project.strokes.push(this.pendingStroke);
        this.pendingStroke = null;
        this.announce('Trait ajouté à la bande');
        this.emit('change');
      } else if (drag.mode === 'pending') {
        if (drag.line) this.select(drag.line, { announce: true });
        else if (this.selection.size) {
          this.selection.clear();
          this.emit('select', null);
        }
        void p;
      } else if (drag.mode === 'move') {
        this.announce(`${drag.line.character || 'Ligne'} déplacée, piste ${drag.line.track + 1}`);
        this.emit('change');
      }
      drag = null;
      el.style.cursor = 'grab';
      this.invalidate();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => {
      if (!drag && this.hoverId) {
        this.hoverId = null;
        this.invalidate();
      }
    });
    el.addEventListener(
      'wheel',
      (e) => {
        // horizontal intent only; vertical wheel keeps scrolling the page
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
          e.preventDefault();
          this.pause();
          const d = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
          this.setFrame(this.frame + d / this.ppf);
        }
      },
      { passive: false },
    );
  }

  eraseAt(p) {
    const H = this.height;
    const before = this.project.strokes.length;
    this.project.strokes = this.project.strokes.filter(
      (st) => !st.points.some(([f, yf]) => Math.hypot(this.frameToX(f) - p.x, yf * H - p.y) < 14 * this.s),
    );
    if (this.project.strokes.length !== before) {
      this.announce('Trait effacé');
      this.emit('change');
      this.invalidate();
    }
  }

  /* ───────────── keyboard (RACCOURCIS_CLAVIER.md, section Bande rythmo) ───────────── */
  bindKeys() {
    this.host.addEventListener('keydown', (e) => {
      if (e.target !== this.host) return;
      const k = e.key;
      const sel = this.selectedLine();
      if (k === ' ') {
        e.preventDefault();
        this.toggle();
        this.announce(this.playing ? 'Lecture' : 'Pause');
      } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && e.shiftKey && e.ctrlKey && sel) {
        e.preventDefault();
        sel.start += k === 'ArrowLeft' ? -1 : 1;
        this.invalidate();
        this.emit('change');
      } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && e.shiftKey) {
        e.preventDefault();
        this.gotoLine(k === 'ArrowLeft' ? -1 : 1);
      } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        this.step(k === 'ArrowLeft' ? -1 : 1);
      } else if ((k === 'ArrowUp' || k === 'ArrowDown') && sel && this.editable) {
        e.preventDefault();
        sel.track = clamp(sel.track + (k === 'ArrowUp' ? -1 : 1), 0, this.tracks - 1);
        this.announce(`Piste ${sel.track + 1}`);
        this.invalidate();
        this.emit('change');
      } else if (k === 'Enter') {
        e.preventDefault();
        this.selectLineAtFrame();
      } else if (k === 'Escape') {
        if (this.selection.size) {
          this.selection.clear();
          this.announce('Sélection annulée');
          this.invalidate();
          this.emit('select', null);
        }
      } else if ((k === 'Delete' || k === 'Suppr') && sel && this.editable && !sel.action) {
        e.preventDefault();
        this.deleteSelection();
      } else if ((k === 'i' || k === 'I' || k === 'o' || k === 'O') && sel && this.editable && !e.ctrlKey && !sel.karaoke) {
        e.preventDefault();
        const f = Math.round(this.frame);
        if (k.toLowerCase() === 'i') {
          const end = sel.start + sel.dur;
          if (f < end - 1) {
            sel.start = f;
            sel.dur = end - f;
          }
        } else if (f > sel.start + 1) sel.dur = f - sel.start;
        this.announce(k.toLowerCase() === 'i' ? 'Début de ligne fixé' : 'Fin de ligne fixée');
        this.invalidate();
        this.emit('change');
      } else if ((k === 'q' || k === 'Q' || k === 'd' || k === 'D') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.pause();
        this.held[k.toLowerCase()] = true;
        this.kick();
      } else if (k === 'Home') {
        e.preventDefault();
        this.seek(this.opts.startFrame ?? 0, { animate: true });
      } else if (k === 'End' && this.stopAt != null) {
        e.preventDefault();
        this.seek(this.stopAt, { animate: true });
      }
    });
    this.host.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'q' || k === 'd') this.held[k] = false;
    });
    this.host.addEventListener('blur', () => {
      this.held.q = this.held.d = false;
    });
  }

  /* ───────────── editing API (toolbar, shortcuts) ───────────── */
  selectedLine() {
    const id = [...this.selection][0];
    return this.project.lines.find((l) => l.id === id) || null;
  }
  describe(line) {
    if (line.text === '↑') return `${line.character}, inspiration, piste ${line.track + 1}`;
    if (line.text === '↓') return `${line.character}, expiration, piste ${line.track + 1}`;
    const kar = line.karaoke ? ', karaoké' : '';
    return `${line.kind === 'ambiance' ? 'Ambiance ' : ''}${line.character || ''}, ${line.action?.label || line.text}, piste ${line.track + 1}${kar}`;
  }
  select(line, { announce = false } = {}) {
    this.selection = new Set([line.id]);
    if (announce) this.announce(this.describe(line));
    this.emit('select', line);
    this.invalidate();
  }
  linesAt(frame) {
    return this.project.lines
      .filter((l) => frame >= l.start && frame <= l.start + l.dur)
      .sort((a, b) => a.track - b.track);
  }
  selectLineAtFrame() {
    const at = this.linesAt(this.frame);
    if (!at.length) {
      this.announce('Aucune ligne à la tête de lecture');
      return;
    }
    const cur = this.selectedLine();
    const i = cur ? at.indexOf(cur) : -1;
    this.select(at[(i + 1) % at.length], { announce: true });
  }
  gotoLine(dir) {
    const sorted = [...this.project.lines].sort((a, b) => a.start - b.start || a.track - b.track);
    if (!sorted.length) return;
    const cur = this.selectedLine();
    let next;
    if (cur) {
      const i = sorted.indexOf(cur);
      next = sorted[clamp(i + dir, 0, sorted.length - 1)];
    } else {
      next = sorted.reduce((best, l) => (Math.abs(l.start - this.frame) < Math.abs(best.start - this.frame) ? l : best), sorted[0]);
    }
    this.select(next, { announce: true });
    this.seek(next.start + Math.min(next.dur / 2, 12), { animate: true, duration: 400 });
  }
  addMarker(kind) {
    const frame = Math.round(this.frame);
    if (this.project.markers.some((m) => m.kind === kind && m.frame === frame)) return;
    this.project.markers.push({ kind, frame });
    const names = { boucle: 'Boucle ajoutée', out: 'Out ajouté', scene: 'Changement de scène ajouté' };
    this.announce(names[kind] || 'Marqueur ajouté');
    this.emit('change');
    this.invalidate();
  }
  insertLine(partial) {
    const ref = this.selectedLine();
    const line = {
      id: uid++,
      track: ref ? ref.track : 0,
      start: Math.round(this.frame),
      dur: 12,
      character: ref?.character || 'MAYA',
      color: ref?.color || '#ff8033',
      kind: 'dialogue',
      ...partial,
    };
    line.track = clamp(line.track, 0, this.tracks - 1);
    this.project.lines.push(line);
    this.select(line);
    this.emit('change');
    return line;
  }
  deleteSelection() {
    const sel = this.selectedLine();
    if (!sel || sel.action) return;
    this.project.lines = this.project.lines.filter((l) => l !== sel);
    this.selection.clear();
    this.announce('Ligne supprimée');
    this.emit('change');
    this.invalidate();
  }
  toggleKaraoke() {
    const sel = this.selectedLine() || this.linesAt(this.frame).find((l) => !l.action && l.text.length > 2);
    if (!sel || sel.action) {
      this.announce('Sélectionnez une ligne pour le karaoké');
      return;
    }
    sel.karaoke = !sel.karaoke;
    this.announce(sel.karaoke ? 'Karaoké activé' : 'Karaoké désactivé');
    this.emit('change');
    this.invalidate();
  }
  setNote(text) {
    const sel = this.selectedLine() || this.linesAt(this.frame)[0];
    if (!sel || sel.action) {
      this.announce('Sélectionnez une ligne pour ajouter une note');
      return;
    }
    sel.note = text;
    this.announce(`Note ajoutée : ${text}`);
    this.emit('change');
    this.invalidate();
  }
  setTool(tool) {
    this.tool = tool;
    this.canvas.style.cursor = tool === 'draw' ? 'crosshair' : tool === 'erase' ? 'cell' : 'grab';
    this.emit('tool', tool);
  }
  setBrush(patch) {
    Object.assign(this.brush, patch);
    this.emit('brush', this.brush);
  }
  setProject(project) {
    this.project = project;
    this.project.strokes ||= [];
    this.selection.clear();
    this.invalidate();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    this.unsub?.();
    this.host.innerHTML = '';
  }
}
