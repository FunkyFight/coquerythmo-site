// Espace Enregistrement: the choice screen, then the solo DAW under a
// read-only band, as in src/ui/recording_workspace.rs. Colours, sizes and
// strings are the app's; the capture flow follows src/recording.rs
// (3-second countdown, Échap cancels or stops) and src/state.rs (capture
// view, take placed at the playhead captured before the countdown).
// Nothing here opens a microphone: takes are synthetic and labelled so.

import { visemeFor, VISEMES } from '../../band/text.js';

const ROW_H = 58; // TRACK_ROW_H
const COUNTDOWN = 3; // RECORDING_COUNTDOWN, seconds
const PEAKS = 4; // synthetic waveform peaks per frame
const END = 264; // the demo scene parks here (11 s at 24 fps)
const FONT = '"Archivo Variable", "Segoe UI", system-ui, sans-serif';

// recording_workspace.rs quad colours
const C = {
  lane: ['#111115', '#131418'],
  line: 'rgba(61,64,79,0.85)',
  clip: '#213375',
  clipSel: '#33459e',
  clipSelBorder: '#9eb3ff',
  mid: 'rgba(128,153,219,0.45)',
  wave: 'rgba(184,209,255,0.82)',
  labelBg: 'rgba(20,30,70,0.78)',
  text: '#e1e3ec',
  record: '#d12e3d',
  guide: 'rgba(255,255,255,0.85)',
};

// Fictional microphones: the site never enumerates real devices.
// Issue label format: microphone_modal.rs issue_label + fr.toml reason.sample_rate.
const MICS = [
  { name: 'Microphone par défaut du système' },
  { name: 'Micro USB de démonstration' },
  { name: 'Interface audio, entrée 1 (démo)' },
  { name: 'Casque Bluetooth (démo)', issue: '16000 Hz — 48 kHz minimum' },
];

/* ───────────── demo scene (fictional) ───────────── */
const CAST = { 'LÉNA': '#cc4dff', SACHA: '#33cccc' };
let lineId = 1;
const L = (o) => ({ id: `rec-${lineId++}`, kind: 'dialogue', note: '', karaoke: false, color: CAST[o.character], ...o });

function sceneLines() {
  return [
    L({ track: 0, start: 10, dur: 44, character: 'LÉNA', text: 'Tu as entendu ? Ça vient du grenier.' }),
    L({ track: 1, start: 58, dur: 9, character: 'SACHA', text: '↑', kind: 'breath' }),
    L({ track: 1, start: 70, dur: 44, character: 'SACHA', text: 'Reste derrière moi. Pas un bruit.' }),
    L({ track: 0, start: 120, dur: 14, character: 'LÉNA', text: '(ah)' }),
    L({ track: 0, start: 138, dur: 38, character: 'LÉNA', text: 'Trop tard, il nous a vus !' }),
    L({ track: 1, start: 184, dur: 50, character: 'SACHA', text: 'Cours ! Je te rejoins en bas.' }),
  ];
}
const sceneMarkers = () => [
  { kind: 'boucle', frame: 4 },
  { kind: 'out', frame: 242 },
  { kind: 'scene', frame: 250 },
];

/* ───────────── synthetic takes ───────────── */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const VOWEL = /[aeiouyàâäéèêëîïôöùûü]/i;
const LETTER = /\p{L}/u;

/** Peaks for a take that started at scene frame `from`: loud on vowels,
 *  softer on consonants, a breath is a swell, the rest is room tone. */
function synthPeaks(from, frames, lines, seed) {
  const r = rng(seed);
  const n = Math.max(1, Math.round(frames * PEAKS));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = from + i / PEAKS;
    const l = lines.find((x) => f >= x.start && f < x.start + x.dur);
    let a = 0.002 + r() * 0.004;
    if (l && l.kind === 'breath') a = (0.05 + r() * 0.06) * Math.sin(Math.PI * ((f - l.start) / l.dur));
    else if (l) {
      const pos = ((f - l.start) / l.dur) * l.text.length;
      const ch = l.text[Math.floor(pos)] || ' ';
      if (LETTER.test(ch)) {
        a = (VOWEL.test(ch) ? 0.46 + r() * 0.42 : 0.12 + r() * 0.22) * (0.55 + 0.45 * Math.sin(Math.PI * (pos % 1)));
      } else a = 0.008 + r() * 0.02;
    }
    out[i] = a;
  }
  for (let i = 1; i < n; i++) out[i] = Math.max(out[i], out[i - 1] * 0.8); // meter-like release
  return out;
}

const pad2 = (n) => String(n).padStart(2, '0');
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}
const seconds = (frames, FPS) => `${(frames / FPS).toFixed(1).replace('.', ',')} s`;

/** The recording project: tracks, clips on the timeline, and the audio
 *  library ("Audios du projet", grouped by the username prefix). */
function buildProject(lines) {
  let id = 1;
  const of = (who) => lines.filter((l) => l.character === who);
  const assets = new Map();
  const asset = (owner, when, from, frames, src) => {
    const a = { id: id++, owner, name: `${owner}_${when}.flac`, frames, peaks: synthPeaks(from, frames, src, id * 7919) };
    assets.set(a.id, a);
    return a;
  };
  const lena1 = asset('lena', '2026-09-12_20-14-03', 4, 56, of('LÉNA'));
  const lena2 = asset('lena', '2026-09-12_20-16-47', 114, 70, of('LÉNA'));
  asset('sacha', '2026-09-12_20-17-05', 52, 70, of('SACHA')); // alternate take, not on the timeline
  const sacha = asset('sacha', '2026-09-12_20-18-22', 52, 190, of('SACHA'));
  const track = (tid, name, armed = false) => ({ id: tid, name, muted: false, solo: false, armed, volume: 1 });
  const clip = (a, tid, start) => ({ id: id++, asset: a.id, track: tid, start, src: 0, dur: a.frames });
  return {
    tracks: [track(1, 'Léna'), track(2, 'Sacha'), track(3, 'Piste 3', true)],
    clips: [clip(lena1, 1, 4), clip(lena2, 1, 114), clip(sacha, 2, 52)],
    assets,
    nextId: () => id++,
  };
}

/* ───────────── lanes renderer (shared by the DAW and the choice card) ───────────── */
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

/** Draws track lanes, clips and waveforms around a centred playhead
 *  (sync_view_to_playhead: the DAW uses the band's centred view). Returns
 *  the clip rectangles for hit testing. */
function paintLanes(g, W, rowH, v) {
  const cx = W / 2;
  const anySolo = v.tracks.some((t) => t.solo);
  const rects = [];
  v.tracks.forEach((t, row) => {
    g.fillStyle = C.lane[row % 2];
    g.fillRect(0, row * rowH, W, rowH);
    g.fillStyle = C.line;
    g.fillRect(0, (row + 1) * rowH - 1, W, 1);
  });
  const pad = Math.round(rowH * 0.1);
  for (const clip of v.clips) {
    const row = v.tracks.findIndex((t) => t.id === clip.track);
    const asset = v.assets.get(clip.asset);
    if (row < 0 || !asset) continue;
    const t = v.tracks[row];
    const x = cx + (clip.start - v.frame) * v.ppf;
    const full = Math.max(3, clip.dur * v.ppf);
    const w = v.reveal?.id === clip.id ? Math.max(3, full * v.reveal.p) : full;
    const y = row * rowH + pad;
    const h = rowH - pad * 2;
    rects.push({ clip, x, y, w: full, h, row });
    if (x + w < -2 || x > W + 2) continue;
    const sel = v.selected?.has(clip.id);
    g.save();
    roundRect(g, x, y, w, h, 5);
    g.fillStyle = sel ? C.clipSel : C.clip;
    g.fill();
    g.clip();
    // mute / solo: what is not heard is drawn faint; volume scales the peaks
    g.globalAlpha = t.muted || (anySolo && !t.solo) ? 0.32 : 1;
    const x0 = Math.max(Math.floor(x), 0);
    const x1 = Math.min(Math.ceil(x + w), W);
    g.fillStyle = C.mid;
    g.fillRect(x0, y + h / 2 - 0.5, x1 - x0, 1);
    g.fillStyle = C.wave;
    const step = 2;
    for (let px = x0; px < x1; px += step) {
      const k0 = Math.floor((clip.src + (px - x) / v.ppf) * PEAKS);
      const k1 = Math.max(k0 + 1, Math.ceil((clip.src + (px + step - x) / v.ppf) * PEAKS));
      let peak = 0;
      for (let k = k0; k < k1; k++) peak = Math.max(peak, asset.peaks[k] || 0);
      const bh = Math.max(1, Math.min(1, Math.sqrt(peak * t.volume)) * (h - 8));
      g.fillRect(px, y + h / 2 - bh / 2, step, bh);
    }
    g.globalAlpha = 1;
    if (v.labels && w > 40) {
      g.font = `500 10.5px ${FONT}`;
      g.textBaseline = 'top';
      const lx = Math.max(x, 0) + 6;
      const tw = Math.min(g.measureText(asset.name).width, x + w - lx - 6);
      if (tw > 12) {
        g.fillStyle = C.labelBg;
        g.fillRect(lx - 3, y + 3, tw + 6, 15);
        g.fillStyle = C.text;
        g.fillText(asset.name, lx, y + 5);
      }
    }
    g.restore();
    roundRect(g, Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1, 5);
    g.strokeStyle = sel ? C.clipSelBorder : C.line;
    g.lineWidth = 1;
    g.stroke();
  }
  if (v.cut) {
    g.fillStyle = C.guide;
    g.fillRect(Math.round(v.cut.x), v.cut.y, 1, v.cut.h);
  }
  if (v.playhead) {
    g.fillStyle = C.record;
    g.fillRect(Math.round(cx) - 1, 0, 2, v.tracks.length * rowH);
  }
  return rects;
}

function fitCanvas(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

/* ═══════════════════════════════════════════════════════════════════ */
export function init(ctx) {
  const root = document.querySelector('[data-rec]');
  if (!root) return;
  const $ = (sel) => root.querySelector(sel);
  const { announce, FPS } = ctx;

  const lines = sceneLines();
  const project = buildProject(lines);
  const state = {
    view: 'choice',
    tool: 'select',
    selected: new Set(),
    selectedAsset: null,
    expanded: new Set(['lena', 'sacha']),
    mic: 0,
    detached: false,
    capture: null, // {phase, start, left, timer}
    reveal: null,
  };
  let band = null;

  const els = {
    choice: $('[data-rec-choice]'),
    online: $('[data-rec-online]'),
    studio: $('[data-rec-studio]'),
    mode: $('[data-rec-mode]'),
    barBack: $('.rec__bar [data-rec-back]'),
    detach: $('[data-rec-detach]'),
    attach: $('[data-rec-attach]'),
    bandHost: $('[data-rec-band]'),
    mouth: $('[data-rec-mouth]'),
    who: $('[data-rec-who]'),
    tc: $('[data-rec-tc]'),
    tcOut: $('[data-rec-tc-out]'),
    scrub: $('[data-rec-scrub]'),
    play: $('[data-rec-cmd="play"]'),
    playIcon: $('[data-rec-play-icon]'),
    capture: $('[data-rec-capture]'),
    status: $('[data-rec-status]'),
    stop: $('[data-rec-stop]'),
    count: $('[data-rec-count]'),
    tracksBox: $('[data-rec-tracks]'),
    headers: $('[data-rec-headers]'),
    lanes: $('[data-rec-lanes]'),
    canvas: $('[data-rec-canvas]'),
    hits: $('[data-rec-hits]'),
    record: $('[data-rec-record]'),
    del: $('[data-rec-delete]'),
    assets: $('[data-rec-assets]'),
    toast: $('[data-rec-toast]'),
    micDialog: $('[data-rec-mic-dialog]'),
    micList: $('[data-rec-mic-list]'),
  };

  const track = (id) => project.tracks.find((t) => t.id === id);
  const armed = () => project.tracks.find((t) => t.armed);
  const tc = (f) => ctx.timecode(f).slice(3);
  const onOff = (on) => (on ? 'activé' : 'désactivé'); // accessibility.on / .off
  const reduce = () => ctx.settings.get().reduceMotion;

  /* ── toast (ui/toast.rs: bottom centre, fades) ── */
  let toastTimer = 0;
  const nbsp = (s) => s.replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0'); // French spacing
  const toast = (text, secs = 3.5, { speak = true } = {}) => {
    clearTimeout(toastTimer);
    els.toast.textContent = nbsp(text);
    els.toast.hidden = false;
    els.toast.classList.remove('is-out');
    toastTimer = setTimeout(() => {
      els.toast.classList.add('is-out');
      toastTimer = setTimeout(() => (els.toast.hidden = true), 500);
    }, secs * 1000);
    if (speak) announce(text);
  };
  els.toast.addEventListener('click', () => (els.toast.hidden = true));

  /* ───────────── views: choice / solo / online ───────────── */
  const MODE = { solo: 'S’enregistrer en solo', online: 'S’enregistrer en ligne' };
  let lastChoice = 'solo';
  function setView(view, { focus = true } = {}) {
    if (state.capture) stopCapture({ cancel: true });
    if (view !== 'solo') band?.pause();
    state.view = view;
    root.dataset.view = view;
    els.choice.hidden = view !== 'choice';
    els.online.hidden = view !== 'online';
    els.studio.hidden = view !== 'solo';
    els.mode.hidden = view === 'choice';
    els.mode.textContent = MODE[view] || '';
    els.barBack.hidden = view === 'choice';
    els.detach.hidden = view !== 'solo';
    if (view !== 'solo' && state.detached) setDetached(false, { quiet: true });
    if (view === 'solo') {
      ensureStudio();
      announce(MODE.solo);
      if (focus) els.play.focus({ preventScroll: true });
    } else if (view === 'online') {
      announce('Serveurs de collaboration');
      if (focus) $('#rec-online-title').focus({ preventScroll: true });
    } else if (focus) {
      root.querySelector(`[data-choose="${lastChoice}"]`)?.focus({ preventScroll: true });
    }
  }
  root.querySelectorAll('[data-choose]').forEach((b) =>
    b.addEventListener('click', () => {
      lastChoice = b.dataset.choose;
      setView(b.dataset.choose);
    }),
  );
  root.querySelectorAll('[data-rec-back]').forEach((b) => b.addEventListener('click', () => setView('choice')));

  /* ───────────── mini lanes on the solo card ───────────── */
  const mini = $('[data-rec-mini]');
  const drawMini = () => {
    const w = mini.parentElement.clientWidth;
    const h = mini.parentElement.clientHeight - 1;
    if (!w || h <= 0) return;
    const g = fitCanvas(mini, w, h);
    const rowH = h / project.tracks.length;
    paintLanes(g, w, rowH, { ...view(), frame: END / 2, ppf: w / (END + 12), labels: false, playhead: true, selected: null, cut: null, reveal: null });
  };
  new ResizeObserver(drawMini).observe(mini.parentElement);

  /* ───────────── studio (built on first entry) ───────────── */
  function view() {
    return {
      tracks: project.tracks,
      clips: project.clips,
      assets: project.assets,
      frame: band ? band.frame : 60,
      ppf: band ? band.ppf : 6,
      selected: state.selected,
      reveal: state.reveal,
    };
  }

  function ensureStudio() {
    if (band) {
      requestDraw();
      return;
    }
    band = new ctx.Band(els.bandHost, {
      project: { lines, markers: sceneMarkers(), strokes: [] },
      tracks: 2,
      startFrame: 0,
      stopAt: END,
      editable: false,
      label: 'Bande rythmo en lecture seule',
      settings: ctx.settings,
      announce,
    });
    band.setFrame(60);
    band.on('frame', onFrame);
    band.on('resize', () => requestDraw());
    band.on('play', syncPlay);
    band.on('pause', syncPlay);
    band.on('parked', () => {
      if (state.capture?.phase === 'capturing') stopCapture();
    });
    onFrame(band.frame);
    syncPlay();
    renderHeaders();
    renderAssets();
    syncTools();
    new ResizeObserver(() => requestDraw()).observe(els.lanes);
  }

  /* ── video: burned timecode + lips following the scene ── */
  const mouths = new Map(
    VISEMES.map((v) => {
      const img = new Image();
      img.src = `/icons/detection/rhubarb_lips/${v}.png`;
      return [v, img.src];
    }),
  );
  let lastViseme = 'P_B_M';
  let lastWho = '';
  let scrubbing = false;
  function onFrame(f) {
    els.tc.textContent = ctx.timecode(f);
    els.tcOut.textContent = tc(f);
    if (!scrubbing) {
      els.scrub.value = String(Math.round(f));
      els.scrub.style.setProperty('--fill', `${(Math.max(0, f) / END) * 100}%`);
    }
    const q = Math.floor(f / 2) * 2; // 12 fps mouth, like an animation
    const speaking = lines.find((l) => l.kind === 'dialogue' && l.text.length > 2 && !l.text.startsWith('(') && q >= l.start && q < l.start + l.dur);
    let v = 'P_B_M';
    if (speaking) {
      let i = Math.floor(((q - speaking.start) / speaking.dur) * speaking.text.length);
      while (i >= 0 && !visemeFor(speaking.text[i])) i--;
      v = (i >= 0 && visemeFor(speaking.text[i])) || 'P_B_M';
    }
    if (v !== lastViseme) {
      lastViseme = v;
      els.mouth.src = mouths.get(v);
    }
    const who = speaking ? speaking.character : '';
    if (who !== lastWho) {
      lastWho = who;
      els.who.textContent = who;
      els.who.classList.toggle('is-on', !!who);
    }
    requestDraw();
  }
  els.scrub.max = String(END);
  els.scrub.addEventListener('input', () => {
    scrubbing = true;
    band?.seek(Number(els.scrub.value));
    els.scrub.style.setProperty('--fill', `${(els.scrub.value / END) * 100}%`);
  });
  els.scrub.addEventListener('change', () => (scrubbing = false));

  /* ── transport ── */
  function syncPlay() {
    const on = !!band?.playing;
    els.playIcon.style.setProperty('--src', `url(/icons/${on ? 'pause' : 'resume'}.svg)`);
    els.play.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
    els.play.dataset.tip = on ? 'Pause' : 'Lecture';
    els.play.setAttribute('aria-pressed', String(on));
  }
  const commands = {
    prev: () => band.step(-1),
    next: () => band.step(1),
    play: () => {
      band.toggle();
      announce(band.playing ? 'Lecture' : 'Pause');
    },
  };
  root.querySelectorAll('[data-rec-cmd]').forEach((b) => b.addEventListener('click', () => band && commands[b.dataset.recCmd]()));

  /* ───────────── DAW drawing ───────────── */
  let rects = [];
  let raf = 0;
  let cutHover = null;
  const hitEls = new Map();
  function requestDraw() {
    if (!raf) raf = requestAnimationFrame(draw);
  }
  function draw() {
    raf = 0;
    if (!band || state.view !== 'solo' || els.studio.hidden) return;
    const W = els.lanes.clientWidth;
    const H = project.tracks.length * ROW_H;
    if (!W) return;
    els.lanes.style.height = `${H}px`;
    const g = fitCanvas(els.canvas, W, H);
    rects = paintLanes(g, W, ROW_H, { ...view(), labels: true, playhead: true, cut: cutHover });
    syncHits(W);
  }

  /* accessible clips: real buttons over the canvas, like the band's hit layer */
  function syncHits(W) {
    const seen = new Set();
    for (const r of rects) {
      const { clip } = r;
      seen.add(clip.id);
      let b = hitEls.get(clip.id);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'rec__hit';
        b.addEventListener('focus', () => {
          const rr = rects.find((x) => x.clip === clip);
          if (rr && (rr.x + rr.w < 0 || rr.x > els.lanes.clientWidth)) band.seek(clip.start + clip.dur / 2, { animate: true, duration: 450 });
        });
        b.addEventListener('click', (e) => {
          if (e.detail !== 0) return; // pointer clicks are handled on the lanes
          if (state.tool === 'cut') cutAt(clip, Math.round(band.frame), { keyboard: true });
          else selectClip(clip, e.ctrlKey || e.shiftKey || e.metaKey, { speak: true });
        });
        els.hits.append(b);
        hitEls.set(clip.id, b);
      }
      const asset = project.assets.get(clip.asset);
      const t = track(clip.track);
      b.setAttribute('aria-label', `${asset.name}, ${t.name}, de ${tc(clip.start)} à ${tc(clip.start + clip.dur)}`);
      b.setAttribute('aria-pressed', String(state.selected.has(clip.id)));
      const left = Math.max(-4000, Math.round(r.x));
      b.style.transform = `translate(${left}px, ${Math.round(r.y)}px)`;
      b.style.width = `${Math.max(8, Math.round(r.w))}px`;
      b.style.height = `${Math.round(r.h)}px`;
      b.dataset.offscreen = String(r.x + r.w < 0 || r.x > W);
    }
    for (const [id, b] of hitEls) {
      if (!seen.has(id)) {
        b.remove();
        hitEls.delete(id);
      }
    }
    // keep DOM order = timeline order, so Tab walks the clips left to right
    const order = [...rects].sort((a, b) => a.row - b.row || a.clip.start - b.clip.start);
    order.forEach((r, i) => {
      const b = hitEls.get(r.clip.id);
      if (els.hits.children[i] !== b) els.hits.insertBefore(b, els.hits.children[i] || null);
    });
  }

  /* ── clip editing (RecordingEditor: select, cut, delete, move) ── */
  function selectClip(clip, additive, { speak = false } = {}) {
    if (additive) state.selected.has(clip.id) ? state.selected.delete(clip.id) : state.selected.add(clip.id);
    else state.selected = new Set([clip.id]);
    state.selectedAsset = null;
    syncTools();
    renderAssets();
    requestDraw();
    if (speak) announce(`${project.assets.get(clip.asset).name}${state.selected.has(clip.id) ? ', sélectionné' : ', désélectionné'}`);
  }
  function clearSelection() {
    if (!state.selected.size) return;
    state.selected.clear();
    syncTools();
    requestDraw();
  }
  function cutAt(clip, at, { keyboard = false } = {}) {
    if (at <= clip.start || at >= clip.start + clip.dur) {
      // "cut must be strictly inside the clip" (recording.rs split_clip)
      if (keyboard) announce('La barre de lecture doit être à l’intérieur du clip pour couper');
      return;
    }
    const right = { ...clip, id: project.nextId(), start: at, src: clip.src + (at - clip.start), dur: clip.start + clip.dur - at };
    clip.dur = at - clip.start;
    project.clips.push(right);
    state.selected = new Set([clip.id, right.id]); // both halves stay selected
    syncTools();
    requestDraw();
    announce(`Clip coupé à ${tc(at)}, deux clips sélectionnés`);
  }
  function deleteSelected() {
    const n = state.selected.size;
    if (!n) return;
    project.clips = project.clips.filter((c) => !state.selected.has(c.id));
    state.selected.clear();
    syncTools();
    renderAssets();
    requestDraw();
    announce(n > 1 ? `${n} clips supprimés` : 'Clip supprimé');
  }

  /* ── pointer on the lanes: select + move, cut, or scrub the empty lane ── */
  let drag = null;
  const lanePos = (e) => {
    const r = els.lanes.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clipAt = (x, y) => {
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  };
  const xToFrame = (x) => band.frame + (x - els.lanes.clientWidth / 2) / band.ppf;
  els.lanes.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !band || state.capture) return;
    const p = lanePos(e);
    const hit = clipAt(p.x, p.y);
    if (state.tool === 'cut' && hit) {
      cutAt(hit.clip, Math.round(xToFrame(p.x)));
      return;
    }
    els.lanes.setPointerCapture(e.pointerId);
    const additive = e.ctrlKey || e.shiftKey || e.metaKey;
    drag = { x0: p.x, frame0: band.frame, hit, start0: hit?.clip.start, moved: false };
    if (hit) selectClip(hit.clip, additive);
  });
  els.lanes.addEventListener('pointermove', (e) => {
    if (!band) return;
    const p = lanePos(e);
    if (!drag) {
      const hit = clipAt(p.x, p.y);
      const next = state.tool === 'cut' && hit ? { x: p.x, y: hit.y, h: hit.h } : null;
      if (JSON.stringify(next) !== JSON.stringify(cutHover)) {
        cutHover = next;
        requestDraw();
      }
      els.lanes.style.cursor = state.tool === 'cut' ? (hit ? 'crosshair' : 'default') : hit ? 'move' : 'grab';
      return;
    }
    const dx = p.x - drag.x0;
    if (!drag.moved && Math.abs(dx) < 4) return;
    drag.moved = true;
    if (drag.hit) {
      drag.hit.clip.start = Math.max(0, Math.round(drag.start0 + dx / band.ppf));
      requestDraw();
    } else {
      els.lanes.style.cursor = 'grabbing';
      band.pause();
      band.setFrame(drag.frame0 - dx / band.ppf);
    }
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.hit && drag.moved) announce(`${project.assets.get(drag.hit.clip.asset).name} déplacé à ${tc(drag.hit.clip.start)}`);
    else if (drag.hit && !drag.moved) announce(project.assets.get(drag.hit.clip.asset).name);
    else if (!drag.hit && !drag.moved) clearSelection();
    drag = null;
    els.lanes.style.cursor = state.tool === 'cut' ? 'default' : 'grab';
  };
  els.lanes.addEventListener('pointerup', endDrag);
  els.lanes.addEventListener('pointercancel', endDrag);
  els.lanes.addEventListener('pointerleave', () => {
    if (cutHover) {
      cutHover = null;
      requestDraw();
    }
  });
  els.lanes.addEventListener(
    'wheel',
    (e) => {
      if (!band || !(Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey)) return;
      e.preventDefault();
      band.pause();
      band.setFrame(band.frame + (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / band.ppf);
    },
    { passive: false },
  );
  root.querySelector('.rec__daw').addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.closest('input')) {
      e.preventDefault();
      deleteSelected();
    }
  });

  /* ── tools column: Sélection, Couper, +, ×, REC ── */
  const TOOL_NAMES = { select: 'Sélection', cut: 'Couper' };
  const setTool = (tool) => {
    state.tool = tool;
    cutHover = null;
    syncTools();
    requestDraw();
    announce(TOOL_NAMES[tool]);
  };
  root.querySelectorAll('[data-rec-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.recTool)));
  $('.rec__toolset').addEventListener('keydown', (e) => {
    // radio group: arrows move the choice, Tab leaves the group
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    setTool(state.tool === 'select' ? 'cut' : 'select');
    $(`[data-rec-tool="${state.tool}"]`).focus();
  });
  $('[data-rec-add]').addEventListener('click', () => {
    const n = project.tracks.length + 1;
    const id = Math.max(...project.tracks.map((t) => t.id)) + 1;
    project.tracks.push({ id, name: `Piste ${n}`, muted: false, solo: false, armed: false, volume: 1 });
    renderHeaders();
    requestDraw();
    els.tracksBox.scrollTop = els.tracksBox.scrollHeight;
    announce(`Piste ${n} ajoutée`);
  });
  els.del.addEventListener('click', deleteSelected);
  els.record.addEventListener('click', startCapture);

  function syncTools() {
    root.querySelectorAll('[data-rec-tool]').forEach((b) => {
      const on = b.dataset.recTool === state.tool;
      b.setAttribute('aria-checked', String(on));
    });
    els.del.disabled = !state.selected.size;
    const a = armed();
    els.record.disabled = !a;
    els.record.dataset.tip = a ? 'Démarrer l’enregistrement sur la piste' : 'Armez une piste pour enregistrer';
    els.record.setAttribute('aria-label', a ? `${a.name} — Démarrer l’enregistrement sur la piste` : 'Démarrer l’enregistrement sur la piste, aucune piste armée');
    els.lanes.dataset.tool = state.tool;
  }

  /* ───────────── track headers ───────────── */
  const X_SVG = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" /></svg>';
  const TOGGLES = [
    ['mute', 'M', 'Muet'],
    ['solo', 'S', 'Solo'],
    ['arm', 'R', 'Armer l’enregistrement'],
    ['export', 'E', 'Exporter l’audio'],
  ];
  function renderHeaders() {
    els.headers.innerHTML = project.tracks
      .map(
        (t) => `
      <div class="rec-track" role="group" aria-label="${t.name}" data-track="${t.id}">
        <span class="rec-track__name">${t.name}</span>
        <span class="rec-track__vol">
          <output class="rec-track__pct tnum" aria-hidden="true">${Math.round(t.volume * 100)}%</output>
          <input class="ui-slider rec-track__slider" type="range" min="0" max="200" step="10" value="${Math.round(t.volume * 100)}"
            aria-label="${t.name} — Volume de la piste" data-tip="Volume de la piste" />
        </span>
        <button class="rec-track__remove" type="button" data-t="remove" aria-label="${t.name} — Supprimer" data-tip="Supprimer">${X_SVG}</button>
        <div class="rec-track__btns">
          ${TOGGLES.map(([k, letter, name]) => `<button class="rec-tb rec-tb--${k}" type="button" data-t="${k}" ${k === 'export' ? '' : 'aria-pressed="false"'} aria-label="${t.name} — ${name}" data-tip="${name}">${letter}</button>`).join('')}
        </div>
      </div>`,
      )
      .join('');
    syncHeaders();
  }
  function syncHeaders() {
    for (const row of els.headers.children) {
      const t = track(Number(row.dataset.track));
      row.querySelector('[data-t="mute"]').setAttribute('aria-pressed', String(t.muted));
      row.querySelector('[data-t="solo"]').setAttribute('aria-pressed', String(t.solo));
      row.querySelector('[data-t="arm"]').setAttribute('aria-pressed', String(t.armed));
      row.querySelector('[data-t="remove"]').disabled = project.tracks.length < 2;
      const slider = row.querySelector('input');
      const pct = Math.round(t.volume * 100);
      slider.style.setProperty('--fill', `${pct / 2}%`);
      slider.setAttribute('aria-valuetext', `${pct} %`);
      row.querySelector('output').textContent = `${pct}%`;
      row.classList.toggle('is-armed', t.armed);
    }
    syncTools();
  }
  els.headers.addEventListener('input', (e) => {
    const slider = e.target.closest('input');
    if (!slider) return;
    track(Number(slider.closest('[data-track]').dataset.track)).volume = Number(slider.value) / 100;
    syncHeaders();
    requestDraw();
  });
  els.headers.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b) return;
    const t = track(Number(b.closest('[data-track]').dataset.track));
    const k = b.dataset.t;
    if (k === 'mute') {
      t.muted = !t.muted;
      announce(`${t.name} — Muet : ${onOff(t.muted)}`);
    } else if (k === 'solo') {
      t.solo = !t.solo;
      announce(`${t.name} — Solo : ${onOff(t.solo)}`);
    } else if (k === 'arm') {
      // one armed track at most (RecordingOperation::ArmTrack)
      const on = !t.armed;
      project.tracks.forEach((x) => (x.armed = on && x === t));
      announce(`${t.name} — Armer l’enregistrement : ${onOff(on)}`);
    } else if (k === 'export') {
      toast(`Exporter l’audio : Coquerythmo enregistre « ${t.name}.flac ». Rien n’est téléchargé ici.`, 4.5);
      return;
    } else if (k === 'remove') {
      if (project.clips.some((c) => c.track === t.id)) {
        // RecordingError::TrackInUse
        toast(`${t.name} contient encore des clips : supprimez-les avant la piste.`);
        return;
      }
      const i = project.tracks.indexOf(t);
      project.tracks.splice(i, 1);
      renderHeaders();
      requestDraw();
      announce(`${t.name} supprimée`);
      const next = els.headers.children[Math.min(i, els.headers.children.length - 1)];
      (next?.querySelector('[data-t="mute"]') || $('[data-rec-add]')).focus();
      return;
    }
    syncHeaders();
    requestDraw();
  });

  /* ───────────── Audios du projet ───────────── */
  const CHEVRON = '<svg class="rec-group__chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M4 2.5L7.5 6 4 9.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>';
  function renderAssets() {
    const groups = new Map();
    for (const a of project.assets.values()) {
      if (!groups.has(a.owner)) groups.set(a.owner, []);
      groups.get(a.owner).push(a);
    }
    const used = new Set(project.clips.map((c) => c.asset));
    const focused = document.activeElement?.closest?.('[data-asset],[data-owner]');
    const focusKey = focused && (focused.dataset.asset || `o:${focused.dataset.owner}`);
    els.assets.innerHTML = [...groups.keys()]
      .sort()
      .map((owner) => {
        const open = state.expanded.has(owner);
        const items = open
          ? `<ul class="rec-group__list" role="list">${groups
              .get(owner)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(
                (a) => `<li><button class="rec-asset" type="button" data-asset="${a.id}" aria-pressed="${state.selectedAsset === a.id}" ${used.has(a.id) ? 'data-used' : ''}
                  aria-label="${a.name}, ${seconds(a.frames, FPS)}${used.has(a.id) ? ', sur la timeline' : ''}">
                  <span class="rec-asset__name">${a.name}</span><span class="rec-asset__dur tnum" aria-hidden="true">${seconds(a.frames, FPS)}</span></button></li>`,
              )
              .join('')}</ul>`
          : '';
        return `<div class="rec-group"><button class="rec-group__head" type="button" data-owner="${owner}" aria-expanded="${open}">${CHEVRON}${owner}</button>${items}</div>`;
      })
      .join('');
    if (focusKey) {
      const sel = focusKey.startsWith('o:') ? `[data-owner="${focusKey.slice(2)}"]` : `[data-asset="${focusKey}"]`;
      els.assets.querySelector(sel)?.focus();
    }
  }
  els.assets.addEventListener('click', (e) => {
    const head = e.target.closest('[data-owner]');
    if (head) {
      const o = head.dataset.owner;
      state.expanded.has(o) ? state.expanded.delete(o) : state.expanded.add(o);
      renderAssets();
      return;
    }
    const b = e.target.closest('[data-asset]');
    if (!b) return;
    const id = Number(b.dataset.asset);
    state.selectedAsset = state.selectedAsset === id ? null : id;
    renderAssets();
  });

  /* ───────────── capture: countdown → capturing → finalizing ───────────── */
  function renderCapture() {
    const c = state.capture;
    els.capture.hidden = !c;
    root.toggleAttribute('data-capture', !!c);
    if (!c) return;
    els.capture.dataset.phase = c.phase;
    if (c.phase === 'countdown') {
      // the app speaks this once, when the countdown starts (state.rs)
      els.status.textContent = c.left === COUNTDOWN ? 'L’enregistrement commence dans 3 secondes' : '';
      els.stop.innerHTML = 'Annuler <kbd class="kbd">Échap</kbd>';
      els.stop.hidden = false;
      els.count.textContent = String(c.left);
      els.count.style.setProperty('--s', { 3: 92, 2: 126, 1: 164 }[c.left] || 92); // countdown_font_size
      els.count.hidden = false;
      if (!reduce()) {
        els.count.classList.remove('is-in');
        void els.count.offsetWidth;
        els.count.classList.add('is-in');
      }
    } else if (c.phase === 'capturing') {
      els.status.textContent = '';
      els.stop.textContent = 'Enregistrement en cours — Échap pour terminer';
      els.stop.hidden = false;
      els.count.hidden = true;
    } else {
      els.status.textContent = 'Finalisation de la prise…';
      els.stop.hidden = true;
      els.count.hidden = true;
    }
  }
  function captureScale(on) {
    // capture view (RecordingLayout::capturing): video + a taller band only
    band.opts.scale = on ? Math.min(1.6, Math.max(0.9, els.studio.clientWidth / 900)) : undefined;
    band.layout();
  }
  function startCapture() {
    const t = armed();
    if (!band || state.capture || !t) return;
    band.pause();
    let f = Math.round(band.frame);
    if (f >= END - 24) f = 0; // parked at the end: take from the top of the scene
    band.setFrame(f);
    state.capture = { phase: 'countdown', start: f, left: COUNTDOWN, track: t.id, timer: 0 };
    els.bandHost.inert = true;
    renderCapture();
    captureScale(true);
    announce('L’enregistrement commence dans 3 secondes', { priority: true });
    els.stop.focus({ preventScroll: true });
    state.capture.timer = setInterval(() => {
      const c = state.capture;
      if (!c) return;
      c.left -= 1;
      if (c.left > 0) renderCapture();
      else {
        clearInterval(c.timer);
        c.phase = 'capturing';
        renderCapture();
        els.stop.focus({ preventScroll: true });
        band.play();
        announce('Enregistrement en cours — Échap pour terminer', { priority: true });
      }
    }, 1000);
  }
  function exitCapture() {
    clearInterval(state.capture?.timer);
    state.capture = null;
    els.bandHost.inert = false;
    renderCapture();
    captureScale(false);
    els.record.focus({ preventScroll: true });
  }
  /** Échap: cancels a countdown, finalizes a running take. */
  function stopCapture({ cancel = false } = {}) {
    const c = state.capture;
    if (!c) return;
    if (c.phase === 'countdown') {
      exitCapture();
      toast('Enregistrement annulé', 3);
      return;
    }
    if (c.phase !== 'capturing') return;
    band.pause();
    const end = Math.round(band.frame);
    if (cancel) {
      exitCapture();
      finish(c, end, { quiet: true });
      return;
    }
    c.phase = 'finalizing';
    renderCapture();
    announce('Finalisation de la prise…');
    setTimeout(() => {
      exitCapture();
      finish(c, end);
    }, reduce() ? 150 : 700);
  }
  /** CompletedCapture::into_project_operation: one FLAC asset + one clip on
   *  the armed track, starting at the frame captured before the countdown. */
  function finish(c, end, { quiet = false } = {}) {
    const dur = end - c.start;
    if (dur < 2 || !track(c.track)) {
      if (!quiet) toast('Enregistrement annulé', 3);
      return;
    }
    const a = { id: project.nextId(), owner: 'vous', name: `vous_${stamp()}.flac`, frames: dur, peaks: synthPeaks(c.start, dur, lines, Date.now() & 0xffff) };
    project.assets.set(a.id, a);
    const clip = { id: project.nextId(), asset: a.id, track: c.track, start: c.start, src: 0, dur };
    project.clips.push(clip);
    state.expanded.add('vous'); // reveal_asset
    renderAssets();
    const row = project.tracks.findIndex((t) => t.id === c.track);
    els.tracksBox.scrollTop = Math.max(0, row * ROW_H - ROW_H);
    revealClip(clip);
    if (!quiet) toast('Prise ajoutée à la timeline', 4);
  }
  function revealClip(clip) {
    if (reduce()) return requestDraw();
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 520);
      state.reveal = p < 1 ? { id: clip.id, p: 1 - Math.pow(1 - p, 3) } : null;
      draw();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  els.stop.addEventListener('click', () => stopCapture());
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !state.capture || ctx.tabs.current() !== 'recording') return;
      e.preventDefault();
      e.stopPropagation();
      stopCapture();
    },
    true,
  );

  /* ───────────── Détacher la vue DAW (Affichage Secondaire) ───────────── */
  function setDetached(on, { quiet = false } = {}) {
    state.detached = on;
    root.toggleAttribute('data-detached', on);
    els.detach.setAttribute('aria-pressed', String(on));
    if (!quiet) announce(on ? 'Vue DAW détachée : Affichage Secondaire' : 'Affichage secondaire fermé');
    requestDraw();
  }
  els.detach.addEventListener('click', () => setDetached(!state.detached));
  els.attach.addEventListener('click', () => {
    setDetached(false);
    els.detach.focus();
  });

  /* ───────────── Choisir le microphone (fictional list) ───────────── */
  let micActive = 0;
  const micLabel = (m) => (m.issue ? `${m.name} — ${m.issue}` : m.name);
  function renderMics() {
    els.micList.innerHTML = MICS.map(
      (m, i) =>
        `<li class="rec-mic__opt" role="option" id="rec-mic-${i}" data-i="${i}" aria-selected="${i === state.mic}" ${m.issue ? 'aria-disabled="true"' : ''}>${micLabel(m)}</li>`,
    ).join('');
    els.micList.setAttribute('aria-activedescendant', `rec-mic-${micActive}`);
    els.micList.querySelectorAll('li').forEach((li) => li.classList.toggle('is-active', Number(li.dataset.i) === micActive));
  }
  function chooseMic(i) {
    const m = MICS[i];
    if (m.issue) {
      announce(micLabel(m));
      return;
    }
    state.mic = i;
    els.micDialog.close();
    toast(`Microphone sélectionné : ${m.name}`, 3);
  }
  $('[data-rec-mic]').addEventListener('click', () => {
    micActive = state.mic;
    renderMics();
    els.micDialog.showModal();
    els.micList.focus();
  });
  els.micList.addEventListener('keydown', (e) => {
    const last = MICS.length - 1;
    const moves = { ArrowDown: micActive + 1, ArrowUp: micActive - 1, Home: 0, End: last };
    if (e.key in moves) {
      e.preventDefault();
      micActive = Math.max(0, Math.min(last, moves[e.key]));
      renderMics();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      chooseMic(micActive);
    }
  });
  els.micList.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (!li) return;
    micActive = Number(li.dataset.i);
    renderMics();
    chooseMic(micActive);
  });
  $('[data-rec-mic-cancel]').addEventListener('click', () => els.micDialog.close());
  els.micDialog.addEventListener('click', (e) => {
    if (e.target === els.micDialog) els.micDialog.close();
  });

  /* ───────────── tab visibility: nothing runs behind another tab ───────────── */
  ctx.tabs.onChange((name) => {
    if (name === 'recording') {
      if (state.view === 'solo') requestDraw();
      requestAnimationFrame(drawMini);
      return;
    }
    if (state.capture) stopCapture(); // countdown cancelled, running take kept
    band?.pause();
  });
  ctx.settings.subscribe(() => requestDraw());
}
