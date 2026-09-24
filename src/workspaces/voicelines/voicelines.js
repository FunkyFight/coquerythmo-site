// Voicelines workspace: one long recording cut into named clips.
// Rules come from src/voicelines.rs (silence detection, naming, raccord,
// export names) and the layout from src/ui/voicelines_workspace.rs. Audio
// never leaves the browser: files are decoded with the Web Audio API, and
// save, export and send only say what the app would do.

/* ── app constants (voicelines.rs:27-30, media_recording.rs:21, :35, :57) ── */
const MIN_REGION_MS = 20;
const AUTO_SILENCE_MS = 200;
const AUTO_PADDING_MS = 40;
const AUTO_THRESHOLD = 0.01;
const RATE = 48000; // the app converts every import to 48 kHz mono
const PEAKS_PER_SECOND = 100; // one waveform peak per 10 ms
const VIEW_MAX_MS = 10000; // a newly selected audio opens on its first 10 s
const HANDLE_W = 7;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');

/** format_duration (voicelines_workspace.rs): mm:ss.mmm */
const fmt = (ms) => {
  const t = Math.max(0, Math.round(ms));
  return `${pad(t / 60000)}:${pad((t % 60000) / 1000)}.${pad(t % 1000, 3)}`;
};

/* ───────────── model (voicelines.rs) ───────────── */

function computePeaks(samples, rate) {
  const spp = Math.max(1, Math.floor(rate / PEAKS_PER_SECOND));
  const n = Math.ceil(samples.length / spp);
  const peaks = new Float32Array(n);
  let i = 0;
  for (let p = 0; p < n; p++) {
    const end = Math.min(samples.length, i + spp);
    let m = 0;
    for (; i < end; i++) {
      const a = Math.abs(samples[i]);
      if (a > m) m = a;
    }
    peaks[p] = Math.min(1, m);
  }
  return { peaks, peakMs: (spp * 1000) / rate };
}

/** detect_regions: sound runs split by ≥ 200 ms under the threshold, padded 40 ms. */
function detectRegions(peaks, peakMs, durationMs) {
  if (!peaks.length || durationMs < MIN_REGION_MS) return [];
  const minSilence = Math.max(1, Math.ceil(AUTO_SILENCE_MS / peakMs));
  const out = [];
  const push = (a, b) => {
    const lo = Math.max(0, Math.round(a * peakMs) - AUTO_PADDING_MS);
    const hi = Math.min(Math.round(b * peakMs) + AUTO_PADDING_MS, durationMs);
    if (hi >= lo + MIN_REGION_MS) out.push([lo, hi]);
  };
  let start = -1;
  let silent = 0;
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i] >= AUTO_THRESHOLD) {
      if (start < 0) start = i;
      silent = 0;
    } else if (start >= 0) {
      silent++;
      if (silent >= minSilence) {
        push(start, i + 1 - silent);
        start = -1;
        silent = 0;
      }
    }
  }
  if (start >= 0) push(start, peaks.length - silent);
  return out;
}

const durationOf = (a) => Math.floor((a.samples.length * 1000) / a.rate);
const validBounds = (s, e, d) => {
  const lo = Math.min(s, d);
  const hi = Math.min(e, d);
  return hi >= lo + MIN_REGION_MS ? [lo, hi] : null;
};
const byStart = (a, b) => a.start - b.start || a.id - b.id;
const cleanName = (name) =>
  Array.from(name.trim())
    .filter((c) => !/[\u0000-\u001f\u007f-\u009f]/.test(c))
    .slice(0, 120)
    .join('');
const fillNum = (pattern, n) => pattern.split('{num}').join(pad(n, 3));
const editableName = (pattern) => (pattern.endsWith('_{num}') ? pattern.slice(0, -6) : pattern);

/** export_stem: Windows-safe file name for a zone */
function exportStem(name) {
  let s = Array.from(name.trim())
    .map((c) => (/[\u0000-\u001f\u007f-\u009f]/.test(c) || '<>:"/\\|?*'.includes(c) ? '_' : c))
    .join('');
  s = s.replace(/^[ .]+|[ .]+$/g, '').trim();
  if (!s) return 'voiceline';
  const dev = s.split('.')[0].trim().toUpperCase();
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(dev) ? `_${s}` : s;
}

/** export_all: one .ogg per zone, _2, _3… when two zones share a name */
function exportNames(regions) {
  const taken = new Set();
  return regions.map((r) => {
    const stem = exportStem(r.name);
    let n = 1;
    let file = `${stem}.ogg`;
    while (taken.has(file)) file = `${stem}_${++n}.ogg`;
    taken.add(file);
    return { file, dur: r.end - r.start, id: r.id };
  });
}

/**
 * join_audio_regions: the selected clips, in selection order, are laid end to
 * end at the first one's start. Their old places go silent and everything
 * after the destination moves later by the joined length.
 */
function joinSamples(samples, rate, ranges, dest, outDur) {
  const at = (ms) => Math.round((ms * rate) / 1000);
  const moved = ranges.reduce((s, [a, b]) => s + b - a, 0);
  const origLen = at(outDur - moved);
  const clean = new Float32Array(origLen);
  clean.set(samples.subarray(0, Math.min(samples.length, origLen)));
  for (const [a, b] of ranges) clean.fill(0, Math.min(origLen, at(a)), Math.min(origLen, at(b)));
  const out = new Float32Array(at(outDur));
  const d = Math.min(at(dest), origLen);
  out.set(clean.subarray(0, d), 0);
  const tail = clean.subarray(d);
  const shift = d + at(moved);
  out.set(tail.subarray(0, Math.max(0, out.length - shift)), Math.min(shift, out.length));
  let w = d;
  for (const [a, b] of ranges) {
    const seg = samples.subarray(at(a), Math.min(samples.length, at(b)));
    for (let i = 0; i < seg.length && w + i < out.length; i++) out[w + i] += seg[i];
    w += seg.length;
  }
  return out;
}

/* ───────────── demo audio: a fictional synthetic voice ───────────── */

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Five lines. Words inside a line are 70–170 ms apart (under the 200 ms
// rule, so they stay together); lines are 550 ms or more apart.
const EXAMPLE_LINES = [
  { f0: 196, amp: 0.52, words: [[0.3, 0.62], [0.7, 1.05], [1.12, 1.4]] },
  { f0: 148, amp: 0.44, words: [[1.95, 2.4], [2.52, 2.85]] },
  { f0: 212, amp: 0.58, words: [[3.4, 3.9], [4.07, 4.5], [4.58, 5.0]] },
  { f0: 250, amp: 0.66, words: [[5.55, 5.84]] },
  { f0: 166, amp: 0.48, words: [[6.45, 6.85], [6.95, 7.4], [7.48, 7.8], [7.92, 8.3]] },
];
const EXAMPLE_BREATHS = [[1.58, 1.82], [8.64, 8.92]]; // audible, but under the 0.01 threshold
const EXAMPLE_SECONDS = 9.6;
const VOWELS = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [270, 2290, 3010],
  [570, 840, 2410],
  [300, 870, 2240],
  [440, 1020, 2240],
  [400, 1700, 2400],
];

function synthesizeExample() {
  const rate = RATE;
  const out = new Float32Array(Math.round(EXAMPLE_SECONDS * rate));
  const rnd = mulberry32(0xc0c0a);
  for (let i = 0; i < out.length; i++) out[i] = (rnd() * 2 - 1) * 0.0022; // room tone
  for (const [t0, t1] of EXAMPLE_BREATHS) {
    const i0 = Math.round(t0 * rate);
    const n = Math.round((t1 - t0) * rate);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += 0.08 * ((rnd() * 2 - 1) - lp);
      out[i0 + i] += lp * 0.018 * Math.sin((Math.PI * i) / n);
    }
  }
  for (const line of EXAMPLE_LINES) {
    const first = line.words[0][0];
    const span = line.words.at(-1)[1] - first;
    for (const [t0, t1] of line.words) {
      // pitch falls along the line, like a spoken sentence
      const f0 = line.f0 * (1.08 - (0.2 * (t0 - first)) / Math.max(span, 0.3));
      synthWord(out, rate, t0, t1, f0, line.amp * (0.85 + rnd() * 0.3), rnd);
    }
  }
  return out;
}

function synthWord(out, rate, t0, t1, f0base, amp, rnd) {
  const i0 = Math.round(t0 * rate);
  const n = Math.round((t1 - t0) * rate);
  const buf = new Float32Array(n);
  const syllables = Math.max(1, Math.round((t1 - t0) / 0.15));
  const bw = [90, 120, 170];
  const mix = [1, 0.55, 0.3];
  const state = [[0, 0], [0, 0], [0, 0]];
  let phase = 0;
  for (let s = 0; s < syllables; s++) {
    const vowel = VOWELS[Math.floor(rnd() * VOWELS.length)];
    const coefs = vowel.map((f, k) => {
      const r = Math.exp((-Math.PI * bw[k]) / rate);
      const th = (2 * Math.PI * f) / rate;
      const gain = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * th) + r * r);
      return [2 * r * Math.cos(th), -r * r, gain];
    });
    const plosive = rnd() < 0.7;
    const a = Math.floor((s * n) / syllables);
    const b = Math.floor(((s + 1) * n) / syllables);
    for (let i = a; i < b; i++) {
      const tt = (i - a) / (b - a);
      const f0 = f0base * (1 - 0.06 * (i / n)) * (1 + 0.03 * Math.sin((2 * Math.PI * 5.5 * i) / rate));
      const dt = f0 / rate;
      phase += dt;
      if (phase >= 1) phase -= 1;
      let saw = 2 * phase - 1; // polyBLEP sawtooth: a soft glottal buzz
      if (phase < dt) {
        const x = phase / dt;
        saw -= x + x - x * x - 1;
      } else if (phase > 1 - dt) {
        const x = (phase - 1) / dt;
        saw -= x * x + x + x + 1;
      }
      let y = 0;
      for (let k = 0; k < 3; k++) {
        const [b1, b2, g] = coefs[k];
        const v = g * saw + b1 * state[k][0] + b2 * state[k][1];
        state[k][1] = state[k][0];
        state[k][0] = v;
        y += v * mix[k];
      }
      const env = 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * tt), 0.6); // dips between syllables
      let v = y * env;
      if (plosive && tt < 0.12) v += (rnd() * 2 - 1) * 0.12 * (1 - tt / 0.12);
      buf[i] = v;
    }
  }
  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const att = 0.025 * rate;
  const rel = 0.045 * rate;
  for (let i = 0; i < n; i++) {
    const e = Math.min(1, i / att, (n - 1 - i) / rel);
    out[i0 + i] += (buf[i] / peak) * amp * e;
  }
}

/* ───────────── workspace ───────────── */

export function init(ctx) {
  const root = document.querySelector('[data-vl]');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const el = {
    audios: $('[data-audios]'),
    audiosEmpty: $('[data-audios-empty]'),
    audiosHint: $('[data-audios-hint]'),
    detect: $('#vl-detect'),
    naming: $('#vl-naming'),
    namingLabel: $('[data-naming]'),
    namingEdit: $('[data-naming-edit]'),
    namingInput: $('#vl-naming-input'),
    actionsWrap: $('[data-actions-wrap]'),
    actionsBtn: $('#vl-actions-btn'),
    actionsMenu: $('#vl-actions'),
    join: $('#vl-join'),
    play: $('#vl-play'),
    playIcon: $('[data-play-icon]'),
    seek: $('#vl-seek'),
    time: $('[data-time]'),
    mute: $('#vl-mute'),
    muteIcon: $('[data-mute-icon]'),
    vol: $('#vl-vol'),
    stage: $('[data-stage]'),
    drop: $('[data-drop]'),
    example: $('#vl-example'),
    wave: $('[data-wave]'),
    ticks: $('[data-ticks]'),
    canvas: $('[data-canvas]'),
    scan: $('[data-scan]'),
    overlay: $('[data-overlay]'),
    playhead: $('[data-playhead]'),
    view: $('[data-view]'),
    viewThumb: $('[data-view-thumb]'),
    list: $('[data-regions]'),
    listEmpty: $('[data-regions-empty]'),
    hint: $('[data-hint]'),
    multi: $('#vl-multi'),
    files: $('[data-files]'),
    filesCount: $('[data-files-count]'),
    filesEmpty: $('[data-files-empty]'),
    ctxMenu: $('#vl-ctx'),
    toasts: $('[data-toasts]'),
  };
  const g = el.canvas.getContext('2d');
  const reduce = () => ctx.settings.get().reduceMotion;

  /* ── project state (VoicelinesProject) ── */
  const project = { audios: [], active: null, pattern: 'voiceline_{num}', next: 1, nextId: 1 };
  const ui = {
    view: { start: 0, dur: 1 },
    selected: [], // region ids, in selection order (the raccord keeps it)
    activeRow: null,
    drag: null,
    rename: null,
    cursor: 0,
    playing: false,
    playRegion: null,
    multi: false,
    born: new Map(), // region id → {delay, dur} for the detection sweep
    visible: true,
  };
  const active = () => project.audios.find((a) => a.id === project.active) || null;
  const regionById = (id) => active()?.regions.find((r) => r.id === id) || null;
  const allocId = () => {
    const id = Math.max(1, project.nextId);
    project.nextId = id + 1;
    return id;
  };
  const allocName = () => fillNum(project.pattern, project.next++);

  /* ── undo / redo (the app keeps one history per workspace) ── */
  const undoStack = [];
  const redoStack = [];
  const snapshot = () => ({
    audios: project.audios.map((a) => ({ ...a, regions: a.regions.map((r) => ({ ...r })) })),
    active: project.active,
    pattern: project.pattern,
    next: project.next,
    nextId: project.nextId,
  });
  const restore = (snap) => Object.assign(project, snap); // a popped snapshot is never reused
  const change = (fn) => {
    const before = snapshot();
    const changed = fn();
    if (changed) {
      undoStack.push(before);
      if (undoStack.length > 60) undoStack.shift();
      redoStack.length = 0;
    }
    return changed;
  };
  const history = (from, to, message) => {
    const snap = from.pop();
    if (!snap) return;
    to.push(snapshot());
    const prevAudio = project.active;
    restore(snap);
    if (project.active !== prevAudio) resetView();
    stop();
    syncView();
    drawWave();
    render();
    ctx.announce(message);
  };

  /* ───────────── toasts (src/ui/toast.rs: bottom centre, fade 0.3 s / 0.5 s) ───────────── */
  function toast(message, seconds = 3) {
    const t = document.createElement('p');
    t.className = 'vl-toast';
    t.textContent = message;
    el.toasts.append(t);
    while (el.toasts.children.length > 3) el.toasts.firstElementChild.remove();
    const out = () => {
      t.classList.add('is-out');
      setTimeout(() => t.remove(), reduce() ? 0 : 500);
    };
    const timer = setTimeout(out, Math.max(800, seconds * 1000 - 500));
    t.addEventListener('click', () => {
      clearTimeout(timer);
      t.remove();
    });
    ctx.announce(message); // show_toast also speaks the message
  }

  /* ───────────── playback (Web Audio) ───────────── */
  let ac = null;
  let gain = null;
  let source = null;
  let startedAt = 0;
  let playFrom = 0;
  let playUntil = null;
  let raf = 0;
  let muted = false;

  const audioContext = () => {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      gain = ac.createGain();
      gain.connect(ac.destination);
      applyVolume();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };
  const applyVolume = () => {
    const v = Number(el.vol.value) / 100;
    el.vol.style.setProperty('--fill', `${el.vol.value}%`);
    if (gain) gain.gain.value = muted ? 0 : v;
  };
  const bufferFor = (a) => {
    if (!a.buffer) {
      const b = ac.createBuffer(1, a.samples.length, a.rate);
      if (b.copyToChannel) b.copyToChannel(a.samples, 0);
      else b.getChannelData(0).set(a.samples);
      a.buffer = b;
    }
    return a.buffer;
  };
  const currentMs = () => (ui.playing && ac ? playFrom + (ac.currentTime - startedAt) * 1000 : ui.cursor);

  function play(fromMs, untilMs = null, regionId = null) {
    const a = active();
    if (!a) return;
    const dur = durationOf(a);
    stop(false);
    audioContext();
    const from = clamp(fromMs, 0, Math.max(0, dur - 1));
    const src = ac.createBufferSource();
    src.buffer = bufferFor(a);
    src.connect(gain);
    if (untilMs != null) src.start(0, from / 1000, Math.max(0.02, (untilMs - from) / 1000));
    else src.start(0, from / 1000);
    src.onended = () => {
      if (source !== src) return;
      ui.cursor = playUntil != null ? playUntil : dur;
      source = null;
      ui.playing = false;
      ui.playRegion = null;
      cancelAnimationFrame(raf);
      syncTransport();
    };
    source = src;
    startedAt = ac.currentTime;
    playFrom = from;
    playUntil = untilMs;
    ui.cursor = from;
    ui.playing = true;
    ui.playRegion = regionId;
    syncTransport();
    tick();
  }
  function stop(sync = true) {
    if (source) {
      ui.cursor = clamp(currentMs(), 0, active() ? durationOf(active()) : 0);
      const s = source;
      source = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    ui.playing = false;
    ui.playRegion = null;
    cancelAnimationFrame(raf);
    if (sync) syncTransport();
  }
  function togglePlay() {
    const a = active();
    if (!a) return;
    if (ui.playing) {
      stop();
      ctx.announce('Pause');
    } else {
      play(ui.cursor >= durationOf(a) - 10 ? 0 : ui.cursor);
      ctx.announce('Lecture');
    }
  }
  /** voicelines_play_region: from the zone's start, stopping at its end */
  function playRegion(id) {
    const r = regionById(id);
    if (!r) return;
    if (ui.playing && ui.playRegion === id) {
      stop();
      return;
    }
    play(r.start, r.end, id);
    revealRange(r.start, r.end);
    ctx.announce(`Écoute de ${r.name}`);
  }
  function tick() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!ui.playing) return;
      ui.cursor = currentMs();
      const a = active();
      // the view pages along with the playhead
      if (a && (ui.cursor > ui.view.start + ui.view.dur || ui.cursor < ui.view.start)) {
        ui.view.start = clamp(ui.cursor - ui.view.dur * 0.1, 0, Math.max(0, durationOf(a) - ui.view.dur));
        drawWave();
        renderOverlay();
        renderTicks();
        renderViewBar();
      }
      syncTransport();
      if (ui.visible) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function syncTransport() {
    const a = active();
    const dur = a ? durationOf(a) : 0;
    const on = ui.playing;
    el.playIcon.style.setProperty('--src', `url(/icons/${on ? 'pause' : 'resume'}.svg)`);
    el.play.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
    el.play.dataset.tip = on ? 'Pause' : 'Lecture';
    el.play.setAttribute('aria-pressed', String(on));
    el.play.disabled = !a;
    el.seek.disabled = !a;
    el.seek.max = String(Math.max(1, dur));
    if (document.activeElement !== el.seek || on) el.seek.value = String(Math.round(ui.cursor));
    el.seek.style.setProperty('--fill', `${dur ? (ui.cursor / dur) * 100 : 0}%`);
    el.seek.setAttribute('aria-valuetext', fmt(ui.cursor));
    el.time.textContent = `${fmt(ui.cursor)} / ${fmt(dur)}`;
    placePlayhead();
  }

  /* ───────────── view (visible time window) ───────────── */
  function resetView() {
    const a = active();
    ui.view.start = 0;
    ui.view.dur = a ? clamp(durationOf(a), 1, VIEW_MAX_MS) : 1;
    ui.cursor = 0;
    ui.selected = [];
    ui.activeRow = null;
    ui.drag = null;
    ui.rename = null;
  }
  function syncView() {
    const a = active();
    if (!a) return;
    const d = Math.max(1, durationOf(a));
    ui.view.dur = clamp(ui.view.dur, Math.min(100, d), d);
    ui.view.start = clamp(ui.view.start, 0, Math.max(0, d - ui.view.dur));
    ui.selected = ui.selected.filter((id) => a.regions.some((r) => r.id === id));
    if (ui.activeRow != null && !a.regions.some((r) => r.id === ui.activeRow)) ui.activeRow = null;
    ui.cursor = clamp(ui.cursor, 0, d);
  }
  /** Ctrl+molette: ×0.75 in, ×1.35 out, anchored under the pointer */
  function zoom(zoomIn, ratio = 0.5) {
    const a = active();
    if (!a) return;
    const d = durationOf(a);
    const anchor = ui.view.start + ui.view.dur * ratio;
    const next = clamp(Math.round(ui.view.dur * (zoomIn ? 0.75 : 1.35)), Math.min(100, d), d);
    ui.view.dur = next;
    ui.view.start = clamp(anchor - next * ratio, 0, Math.max(0, d - next));
    refreshView();
  }
  function pan(ms) {
    const a = active();
    if (!a) return;
    ui.view.start = clamp(ui.view.start + ms, 0, Math.max(0, durationOf(a) - ui.view.dur));
    refreshView();
  }
  function revealRange(s, e) {
    const a = active();
    if (!a) return;
    if (s >= ui.view.start && e <= ui.view.start + ui.view.dur) return;
    const d = durationOf(a);
    if (e - s > ui.view.dur) ui.view.dur = clamp(Math.round((e - s) * 1.2), 100, d);
    ui.view.start = clamp((s + e) / 2 - ui.view.dur / 2, 0, Math.max(0, d - ui.view.dur));
    refreshView();
  }
  const refreshView = () => {
    drawWave();
    renderOverlay();
    renderTicks();
    renderViewBar();
    placePlayhead();
  };

  /* ───────────── waveform (render_waveform) ───────────── */
  const waveBox = () => ({ w: el.wave.clientWidth, h: el.wave.clientHeight });
  const msToX = (ms, w) => (w * clamp(ms - ui.view.start, 0, ui.view.dur)) / Math.max(1, ui.view.dur);
  const xToMs = (clientX) => {
    const a = active();
    const r = el.wave.getBoundingClientRect();
    const ratio = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
    return Math.min(durationOf(a), Math.round(ui.view.start + ui.view.dur * ratio));
  };

  function drawWave() {
    const a = active();
    const { w, h } = waveBox();
    if (!a || !w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (el.canvas.width !== Math.round(w * dpr) || el.canvas.height !== Math.round(h * dpr)) {
      el.canvas.width = Math.round(w * dpr);
      el.canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const center = Math.round(h * 0.52);
    g.fillStyle = 'rgba(71, 74, 87, 0.8)';
    g.fillRect(1, center, w - 2, 1);
    const { peaks, peakMs } = a;
    if (!peaks.length) return;
    const first = Math.floor(ui.view.start / peakMs);
    const last = Math.min(peaks.length, Math.ceil((ui.view.start + ui.view.dur) / peakMs));
    const span = Math.max(0, last - first);
    const cols = Math.max(1, Math.floor(w));
    g.fillStyle = 'rgba(97, 158, 245, 0.9)';
    for (let c = 0; c < cols; c++) {
      const p0 = Math.min(peaks.length - 1, first + Math.floor((span * c) / cols));
      const p1 = Math.min(peaks.length, Math.max(p0 + 1, first + Math.floor((span * (c + 1)) / cols)));
      let m = 0;
      for (let p = p0; p < p1; p++) if (peaks[p] > m) m = peaks[p];
      const ht = Math.max(1, m * (h - 34) * 0.46);
      g.fillRect(c, center - ht, 1.2, ht * 2);
    }
  }

  /** time labels along the top: six like the app, fewer on a narrow waveform */
  function renderTicks() {
    const steps = clamp(Math.floor(waveBox().w / 120), 2, 5);
    if (el.ticks.children.length !== steps + 1) {
      el.ticks.innerHTML = '';
      for (let i = 0; i <= steps; i++) {
        const s = document.createElement('span');
        s.className = 'tnum';
        s.style.left = `${(i * 100) / steps}%`;
        el.ticks.append(s);
      }
    }
    [...el.ticks.children].forEach((s, i) => {
      s.textContent = fmt(ui.view.start + (ui.view.dur * i) / steps);
    });
  }

  function placePlayhead() {
    const a = active();
    const { w } = waveBox();
    const inView = a && ui.cursor >= ui.view.start && ui.cursor <= ui.view.start + ui.view.dur;
    el.playhead.hidden = !inView;
    if (inView) el.playhead.style.transform = `translateX(${clamp(msToX(ui.cursor, w) - 1, 0, w - 2)}px)`;
  }

  /** region_color: a hue per id, stronger when selected */
  const regionColor = (id, selected) => {
    const hue = ((id * 47) % 255) / 255;
    const c = (v) => Math.round(v * 255);
    return `rgba(${c(0.22 + hue * 0.16)}, ${c(0.2 + (1 - hue) * 0.12)}, ${c(0.52 + hue * 0.18)}, ${selected ? 0.72 : 0.48})`;
  };

  /** preview_bounds while a handle or body is dragged */
  const previewBounds = (r) => {
    const d = ui.drag;
    if (!d || d.id !== r.id) return [r.start, r.end];
    if (d.kind === 'start') return [Math.min(d.current, d.end - MIN_REGION_MS), d.end];
    if (d.kind === 'end') return [d.start, Math.max(d.current, d.start + MIN_REGION_MS)];
    if (d.kind === 'move') {
      const delta = d.current - d.anchor;
      return [Math.max(0, d.start + delta), Math.max(MIN_REGION_MS, d.end + delta)];
    }
    return [r.start, r.end];
  };

  const overlayEls = new Map();
  function renderOverlay() {
    const a = active();
    const { w } = waveBox();
    const seen = new Set();
    const vEnd = ui.view.start + ui.view.dur;
    for (const r of a ? a.regions : []) {
      const [s, e] = previewBounds(r);
      if (e < ui.view.start || s > vEnd) continue;
      seen.add(r.id);
      let node = overlayEls.get(r.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'vl-region';
        node.append(document.createElement('span'));
        node.firstChild.className = 'vl-region__name';
        el.overlay.append(node);
        overlayEls.set(r.id, node);
      }
      const x1 = msToX(s, w);
      const x2 = msToX(e, w);
      const sel = ui.selected.includes(r.id);
      node.style.left = `${x1}px`;
      node.style.width = `${Math.max(2, x2 - x1)}px`;
      node.style.setProperty('--rc', regionColor(r.id, sel));
      node.classList.toggle('is-selected', sel);
      node.classList.toggle('is-playing', ui.playRegion === r.id);
      node.firstChild.textContent = r.name;
      const born = ui.born.get(r.id);
      if (born && !node.classList.contains('is-born')) {
        node.style.setProperty('--born-delay', `${born.delay}ms`);
        node.style.setProperty('--born-dur', `${born.dur}ms`);
        node.classList.add('is-born');
      }
    }
    for (const [id, node] of overlayEls) {
      if (!seen.has(id)) {
        node.remove();
        overlayEls.delete(id);
      }
    }
    // the zone being drawn with a drag on empty waveform
    let draft = el.overlay.querySelector('.vl-region--draft');
    if (ui.drag?.kind === 'create' && ui.drag.moved) {
      if (!draft) {
        draft = document.createElement('div');
        draft.className = 'vl-region vl-region--draft';
        el.overlay.append(draft);
      }
      const x1 = msToX(Math.min(ui.drag.anchor, ui.drag.current), w);
      const x2 = msToX(Math.max(ui.drag.anchor, ui.drag.current), w);
      draft.style.left = `${x1}px`;
      draft.style.width = `${Math.max(2, x2 - x1)}px`;
    } else draft?.remove();
  }

  function renderViewBar() {
    const a = active();
    el.view.hidden = !a;
    if (!a) return;
    const d = Math.max(1, durationOf(a));
    const left = (ui.view.start / d) * 100;
    const width = (ui.view.dur / d) * 100;
    el.viewThumb.style.left = `${left}%`;
    el.viewThumb.style.width = `${Math.max(2, width)}%`;
    const room = Math.max(1, d - ui.view.dur);
    el.view.setAttribute('aria-valuenow', String(Math.round((ui.view.start / room) * 100) || 0));
    el.view.setAttribute('aria-valuetext', `de ${fmt(ui.view.start)} à ${fmt(ui.view.start + ui.view.dur)}`);
  }

  /* ───────────── lists ───────────── */

  /** keyed list update: reuse nodes so focus and animations survive */
  function syncList(container, items, key, create, update) {
    const existing = new Map([...container.children].map((n) => [n.dataset.key, n]));
    let prev = null;
    for (const item of items) {
      const k = String(key(item));
      let node = existing.get(k);
      if (node) existing.delete(k);
      else {
        node = create(item);
        node.dataset.key = k;
      }
      update(node, item);
      const want = prev ? prev.nextSibling : container.firstChild;
      if (node !== want) container.insertBefore(node, want);
      prev = node;
    }
    existing.forEach((n) => n.remove());
  }

  const closeIcon =
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" /></svg>';

  function renderAudios() {
    syncList(
      el.audios,
      project.audios,
      (a) => a.id,
      (a) => {
        const li = document.createElement('li');
        li.className = 'vl-audio';
        li.innerHTML = `<button class="vl-audio__pick" type="button" aria-haspopup="menu" data-tip="Clic droit : Envoyer les voicelines vers…"><span class="vl-audio__name"></span><span class="vl-audio__meta tnum"></span></button><button class="icon-btn vl-audio__remove" type="button">${closeIcon}</button>`;
        const pick = li.firstChild;
        pick.addEventListener('click', () => selectAudio(a.id));
        pick.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          openSendMenu(a.id, pick, e.clientX, e.clientY);
        });
        pick.addEventListener('keydown', (e) => {
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            openSendMenu(a.id, pick);
          }
        });
        li.lastChild.addEventListener('click', () => removeAudio(a.id));
        return li;
      },
      (li, a) => {
        const on = a.id === project.active;
        li.classList.toggle('is-active', on);
        const pick = li.firstChild;
        pick.setAttribute('aria-current', String(on));
        pick.setAttribute('aria-label', `${a.name}, ${fmt(durationOf(a))}${on ? ', audio actif' : ''}`);
        pick.querySelector('.vl-audio__name').textContent = a.name;
        pick.querySelector('.vl-audio__meta').textContent = `${fmt(durationOf(a))} · ${a.origin}`;
        li.lastChild.setAttribute('aria-label', `Retirer ${a.name}`);
        li.lastChild.dataset.tip = `Retirer ${a.name}`;
      },
    );
    el.audiosEmpty.hidden = project.audios.length > 0;
    el.audiosHint.hidden = project.audios.length === 0;
  }

  function renderRegions() {
    const a = active();
    const regions = a ? a.regions : [];
    syncList(
      el.list,
      regions,
      (r) => r.id,
      (r) => {
        const li = document.createElement('li');
        li.className = 'vl-row';
        li.id = `vl-row-${r.id}`;
        li.setAttribute('role', 'option');
        li.innerHTML = '<span class="vl-row__name"></span><span class="vl-row__time tnum"></span>';
        return li;
      },
      (li, r) => {
        const sel = ui.selected.includes(r.id);
        li.setAttribute('aria-selected', String(sel));
        li.classList.toggle('is-active', ui.activeRow === r.id);
        li.classList.toggle('is-playing', ui.playRegion === r.id);
        li.setAttribute('aria-label', `${r.name} : ${fmt(r.start)} à ${fmt(r.end)}`);
        const renaming = ui.rename?.id === r.id;
        const nameEl = li.firstChild;
        if (renaming && nameEl.tagName !== 'INPUT') {
          const input = document.createElement('input');
          input.className = 'vl-row__name vl-input';
          input.type = 'text';
          input.maxLength = 120;
          input.spellcheck = false;
          input.autocomplete = 'off';
          input.value = ui.rename.text;
          input.setAttribute('aria-label', `Renommer ${r.name}`);
          bindRenameInput(input);
          nameEl.replaceWith(input);
        } else if (!renaming && nameEl.tagName === 'INPUT') {
          const span = document.createElement('span');
          span.className = 'vl-row__name';
          nameEl.replaceWith(span);
        }
        if (!renaming) li.firstChild.textContent = r.name;
        li.lastChild.textContent = `${fmt(r.start)}  →  ${fmt(r.end)}`;
        const born = ui.born.get(r.id);
        if (born && !li.classList.contains('is-born')) {
          li.style.setProperty('--born-delay', `${born.delay}ms`);
          li.classList.add('is-born');
        }
      },
    );
    el.listEmpty.hidden = regions.length > 0;
    el.list.hidden = !regions.length;
    el.listEmpty.textContent = a
      ? 'Aucune zone : lancez « Détection auto » ou glissez sur la forme d’onde pour en tracer une.'
      : 'Aucune zone pour l’instant.';
    if (ui.activeRow != null) el.list.setAttribute('aria-activedescendant', `vl-row-${ui.activeRow}`);
    else el.list.removeAttribute('aria-activedescendant');
    el.list.tabIndex = regions.length ? 0 : -1;
    markClipped(el.list);
  }

  /** fade the last visible row of a list that scrolls further */
  const markClipped = (list) => {
    list.classList.toggle('is-clipped', list.scrollHeight - list.scrollTop - list.clientHeight > 2);
  };
  el.list.addEventListener('scroll', () => markClipped(el.list), { passive: true });
  el.files.addEventListener('scroll', () => markClipped(el.files), { passive: true });

  function renderExport() {
    const a = active();
    const files = a ? exportNames(a.regions) : [];
    syncList(
      el.files,
      files,
      (f) => f.file,
      () => {
        const li = document.createElement('li');
        li.innerHTML = '<span class="vl-export__file"></span><span class="vl-export__dur tnum"></span>';
        return li;
      },
      (li, f) => {
        li.firstChild.textContent = f.file;
        li.lastChild.textContent = fmt(f.dur);
        const born = ui.born.get(f.id);
        if (born && !li.classList.contains('is-born')) {
          li.style.setProperty('--born-delay', `${born.delay}ms`);
          li.classList.add('is-born');
        }
      },
    );
    markClipped(el.files);
    el.filesEmpty.hidden = files.length > 0;
    el.files.hidden = !files.length;
    el.filesCount.textContent = files.length ? `${files.length} fichier${files.length > 1 ? 's' : ''}` : '';
  }

  function render() {
    const a = active();
    root.dataset.state = a ? 'audio' : 'empty';
    el.drop.hidden = !!a;
    el.wave.hidden = !a;
    el.detect.disabled = !a;
    el.namingLabel.textContent = editableName(project.pattern);
    const canJoin = ui.selected.length >= 2;
    el.actionsBtn.disabled = !canJoin;
    if (canJoin) el.actionsWrap.removeAttribute('data-tip');
    else el.actionsWrap.dataset.tip = 'Ctrl+clic sur au moins deux zones';
    el.actionsWrap.classList.toggle('is-ready', canJoin);
    renderAudios();
    renderRegions();
    renderExport();
    renderOverlay();
    renderTicks();
    renderViewBar();
    syncTransport();
  }

  /* ───────────── actions ───────────── */

  function addAudio({ name, samples, rate, origin }) {
    const { peaks, peakMs } = computePeaks(samples, rate);
    stop(false);
    change(() => {
      project.audios.push({ id: allocId(), name, samples, rate, peaks, peakMs, origin, regions: [], buffer: null });
      project.active = project.audios.at(-1).id;
      return true;
    });
    resetView();
    syncView();
    render();
    requestAnimationFrame(drawWave);
  }

  function selectAudio(id) {
    if (project.active === id) return;
    stop(false);
    project.active = id; // selecting an audio is not an undoable edit in the app
    resetView();
    syncView();
    render();
    drawWave();
    ctx.announce(`${active().name} sélectionné`);
  }

  function removeAudio(id) {
    const index = project.audios.findIndex((a) => a.id === id);
    if (index < 0) return;
    const name = project.audios[index].name;
    stop(false);
    change(() => {
      project.audios.splice(index, 1);
      if (project.active === id) project.active = project.audios[Math.min(index, project.audios.length - 1)]?.id ?? null;
      return true;
    });
    resetView();
    syncView();
    render();
    drawWave();
    ctx.announce(`${name} retiré`);
    const next = el.audios.querySelector('.vl-audio__pick');
    (next || el.example).focus({ preventScroll: true });
  }

  function addRegion(start, end) {
    const a = active();
    const bounds = a && validBounds(start, end, durationOf(a));
    if (!bounds) return null;
    let id = null;
    change(() => {
      id = allocId();
      a.regions.push({ id, name: allocName(), start: bounds[0], end: bounds[1], manual: false });
      a.regions.sort(byStart);
      return true;
    });
    return id;
  }

  function moveRegion(id, start, end) {
    const a = active();
    const r = regionById(id);
    const bounds = r && validBounds(start, end, durationOf(a));
    if (!bounds || (bounds[0] === r.start && bounds[1] === r.end)) return false;
    return change(() => {
      const target = regionById(id);
      [target.start, target.end] = bounds;
      a.regions.sort(byStart);
      return true;
    });
  }

  function deleteRegion(id) {
    const r = regionById(id);
    if (!r) return;
    const list = active().regions;
    const index = list.indexOf(r);
    change(() => {
      list.splice(list.indexOf(regionById(id)), 1);
      return true;
    });
    ui.selected = [];
    const next = list[Math.min(index, list.length - 1)];
    ui.activeRow = next ? next.id : null;
    render();
    ctx.announce(`${r.name} supprimée`);
  }

  /** auto_detect_regions: replaces the zones of the active audio */
  function autoDetect() {
    const a = active();
    if (!a) return;
    stop(false);
    let found = [];
    change(() => {
      a.regions = [];
      for (const [s, e] of detectRegions(a.peaks, a.peakMs, durationOf(a))) {
        const b = validBounds(s, e, durationOf(a));
        if (b) a.regions.push({ id: allocId(), name: allocName(), start: b[0], end: b[1], manual: false });
      }
      a.regions.sort(byStart);
      found = a.regions;
      return true;
    });
    ui.selected = [];
    ui.activeRow = found[0]?.id ?? null;
    const message = `${found.length} zone(s) détectée(s)`;
    sweep(found, () => toast(message, 3));
  }

  /* The one authored moment: a scan line crosses the visible waveform and
     each zone is drawn as the line reaches it. */
  function sweep(regions, done) {
    const { w } = waveBox();
    ui.born.clear();
    if (reduce() || !w) {
      render();
      done();
      return;
    }
    const total = 900;
    const vEnd = ui.view.start + ui.view.dur;
    regions.forEach((r, i) => {
      if (r.end < ui.view.start || r.start > vEnd) return;
      const x1 = msToX(r.start, w);
      const x2 = msToX(r.end, w);
      ui.born.set(r.id, { delay: Math.round((x1 / w) * total), dur: Math.max(60, Math.round(((x2 - x1) / w) * total)), i });
    });
    el.scan.classList.remove('is-running', 'is-fading');
    void el.scan.offsetWidth;
    el.scan.style.setProperty('--scan-ms', `${total}ms`);
    el.scan.classList.add('is-running');
    render();
    setTimeout(() => {
      el.scan.classList.add('is-fading'); // the line rests at the right edge while it fades
      setTimeout(() => el.scan.classList.remove('is-running', 'is-fading'), 360);
      done();
    }, total + 60);
    setTimeout(() => {
      ui.born.clear();
      root.querySelectorAll('.is-born').forEach((n) => n.classList.remove('is-born'));
    }, total + 600);
  }

  /** join_regions + join_audio_regions: « Raccorder les zones sélectionnées » */
  function joinSelected() {
    const a = active();
    const ids = [...ui.selected];
    const regions = ids.map((id) => regionById(id));
    if (!a || ids.length < 2 || regions.some((r) => !r) || new Set(ids).size !== ids.length) {
      toast('Sélectionnez au moins deux zones valides', 4);
      return;
    }
    stop(false);
    const dest = regions[0].start;
    const moved = regions.reduce((s, r) => s + r.end - r.start, 0);
    const ranges = regions.map((r) => [r.start, r.end]);
    const outDur = durationOf(a) + moved;
    let newId = null;
    change(() => {
      const first = regions[0];
      const samples = joinSamples(a.samples, a.rate, ranges, dest, outDur);
      const { peaks, peakMs } = computePeaks(samples, a.rate);
      const kept = a.regions
        .filter((r) => !ids.includes(r.id))
        .map((r) => {
          if (r.start >= dest) return { ...r, start: r.start + moved, end: r.end + moved };
          if (r.end > dest) return { ...r, end: r.end + moved };
          return r;
        });
      newId = allocId();
      kept.push({ id: newId, name: first.name, start: dest, end: dest + moved, manual: first.manual });
      const fresh = { ...a, samples, peaks, peakMs, buffer: null };
      const d = durationOf(fresh);
      fresh.regions = kept.filter((r) => validBounds(r.start, r.end, d)).sort(byStart);
      project.audios[project.audios.indexOf(a)] = fresh;
      return true;
    });
    ui.selected = [newId];
    ui.activeRow = newId;
    syncView();
    ui.born.clear();
    const r = regionById(newId);
    if (!reduce()) ui.born.set(newId, { delay: 0, dur: 320 });
    revealRange(r.start, r.end);
    drawWave();
    render();
    toast('Zones raccordées', 3);
    setTimeout(() => {
      ui.born.clear();
      root.querySelectorAll('.is-born').forEach((n) => n.classList.remove('is-born'));
    }, 700);
  }

  /** set_automatic_naming: renumbers every zone that was not renamed by hand */
  function setNaming(value) {
    let pattern = cleanName(value);
    if (!pattern) {
      toast('Indiquez un nom de base', 4);
      return false;
    }
    if (!pattern.includes('{num}')) pattern += '_{num}';
    change(() => {
      let n = 1;
      for (const a of project.audios)
        for (const r of a.regions) if (!r.manual) r.name = fillNum(pattern, n++);
      project.pattern = pattern;
      project.next = n;
      return true;
    });
    render();
    ctx.announce(`Nom auto : ${editableName(pattern)}`);
    return true;
  }

  function renameRegion(id, value) {
    const name = cleanName(value);
    const r = regionById(id);
    if (!r || !name || (name === r.name && r.manual)) return;
    change(() => {
      const target = regionById(id);
      target.name = name;
      target.manual = true;
      return true;
    });
    ctx.announce(`Zone renommée : ${name}`);
  }

  /* ── what the app would do; the site says so instead of doing it ── */
  function sendTo(audioId, destination) {
    const a = project.audios.find((x) => x.id === audioId);
    if (!a) return;
    if (!a.regions.length) {
      toast('Aucune voiceline à envoyer', 3);
      return;
    }
    const n = a.regions.length;
    toast(
      `Sur le site, rien n’est envoyé. Dans Coquerythmo, ${n > 1 ? `les ${n} voicelines arrivent` : 'la voiceline arrive'} dans ${destination}.`,
      5,
    );
  }

  function loadExample() {
    addAudio({ name: 'exemple_voix_synthese.wav', samples: synthesizeExample(), rate: RATE, origin: 'voix de synthèse' });
    toast('Audio ajouté', 2.5);
    el.detect.focus({ preventScroll: true });
  }

  /* ───────────── selection ───────────── */

  let prevCount = 0;
  function select(ids, { reveal = true } = {}) {
    ui.selected = ids;
    if (ids.length) ui.activeRow = ids.at(-1);
    render();
    const last = regionById(ids.at(-1));
    if (reveal && last) revealRange(last.start, last.end);
    scrollRowIntoView(ui.activeRow);
    if (ids.length === 2 && ids.length !== prevCount) {
      ctx.announce('2 zones sélectionnées. Menu Actions : Raccorder les zones sélectionnées.');
    } else if (ids.length > 2) ctx.announce(`${ids.length} zones sélectionnées`);
    prevCount = ids.length;
  }
  function toggle(id) {
    const i = ui.selected.indexOf(id);
    select(i >= 0 ? ui.selected.filter((x) => x !== id) : [...ui.selected, id]);
    ui.activeRow = id;
    renderRegions();
  }
  const scrollRowIntoView = (id) => {
    const row = id != null && document.getElementById(`vl-row-${id}`);
    if (!row) return;
    const list = el.list;
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop - 4;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight + 4;
  };

  /* ───────────── rename (double-clic, F2) ───────────── */

  function startRename(id) {
    const r = regionById(id);
    if (!r) return;
    ui.rename = { id, text: r.name };
    ui.selected = [id];
    ui.activeRow = id;
    render();
    scrollRowIntoView(id);
    const input = el.list.querySelector('input');
    input?.focus({ preventScroll: true });
    input?.select();
  }
  function finishRename(commit) {
    const rn = ui.rename;
    if (!rn) return;
    ui.rename = null;
    if (commit) renameRegion(rn.id, rn.text);
    render();
    el.list.focus({ preventScroll: true });
  }
  function bindRenameInput(input) {
    input.addEventListener('input', () => {
      if (ui.rename) ui.rename.text = input.value;
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRename(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishRename(false);
      }
    });
    // clicking away commits, like the app
    input.addEventListener('blur', () => setTimeout(() => ui.rename && finishRename(true), 0));
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  /* ───────────── naming pattern (« Nom auto : … ») ───────────── */

  el.naming.addEventListener('click', () => {
    el.naming.hidden = true;
    el.namingEdit.hidden = false;
    el.namingInput.value = editableName(project.pattern);
    el.namingInput.focus();
    el.namingInput.select();
  });
  let namingDone = false;
  const closeNaming = (commit) => {
    if (el.namingEdit.hidden || namingDone) return;
    namingDone = true;
    if (commit && !setNaming(el.namingInput.value)) {
      namingDone = false;
      el.namingInput.focus();
      return;
    }
    el.namingEdit.hidden = true;
    el.naming.hidden = false;
    el.naming.focus({ preventScroll: true });
    namingDone = false;
  };
  el.namingInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      closeNaming(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeNaming(false);
    }
  });
  el.namingInput.addEventListener('blur', () => {
    if (!el.namingEdit.hidden && cleanName(el.namingInput.value)) closeNaming(true);
    else if (!el.namingEdit.hidden) closeNaming(false);
  });

  /* ───────────── header, toolbar ───────────── */

  el.example.addEventListener('click', loadExample);
  el.detect.addEventListener('click', autoDetect);
  el.join.addEventListener('click', () => {
    joinSelected();
    el.list.focus({ preventScroll: true });
  });
  ctx.makeDropdown(el.actionsBtn, el.actionsMenu);

  el.play.addEventListener('click', togglePlay);
  el.seek.addEventListener('input', () => {
    ui.cursor = Number(el.seek.value);
    if (ui.playing) play(ui.cursor);
    else syncTransport();
  });
  el.vol.addEventListener('input', () => {
    if (muted && Number(el.vol.value) > 0) setMuted(false);
    applyVolume();
  });
  const setMuted = (on) => {
    muted = on;
    el.muteIcon.style.setProperty('--src', `url(/icons/${on ? 'mute' : 'sound'}.svg)`);
    const label = on ? 'Rétablir le son' : 'Couper le son';
    el.mute.setAttribute('aria-label', label);
    el.mute.dataset.tip = label;
    el.mute.setAttribute('aria-pressed', String(on));
    applyVolume();
  };
  el.mute.addEventListener('click', () => {
    setMuted(!muted);
    ctx.announce(muted ? 'Son coupé' : 'Son rétabli');
  });
  applyVolume();

  el.multi.addEventListener('click', () => {
    ui.multi = !ui.multi;
    el.multi.setAttribute('aria-pressed', String(ui.multi));
    ctx.announce(ui.multi ? 'Sélection multiple activée' : 'Sélection multiple désactivée');
  });

  /* ───────────── waveform pointer (drag to draw, move, resize) ───────────── */

  function regionHit(clientX) {
    const a = active();
    if (!a) return null;
    const r = el.wave.getBoundingClientRect();
    const x = clientX - r.left;
    const vEnd = ui.view.start + ui.view.dur;
    for (let i = a.regions.length - 1; i >= 0; i--) {
      const reg = a.regions[i];
      if (reg.end < ui.view.start || reg.start > vEnd) continue;
      const s = msToX(reg.start, r.width);
      const e = msToX(reg.end, r.width);
      if (Math.abs(x - s) <= HANDLE_W) return { region: reg, part: 'start' };
      if (Math.abs(x - e) <= HANDLE_W) return { region: reg, part: 'end' };
      if (x > s && x < e) return { region: reg, part: 'body' };
    }
    return null;
  }

  let press = null;
  el.wave.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !active()) return;
    if (ui.rename) finishRename(true);
    el.wave.focus({ preventScroll: true });
    const ms = xToMs(e.clientX);
    const hit = regionHit(e.clientX);
    if (hit && (e.ctrlKey || e.metaKey || ui.multi)) {
      toggle(hit.region.id);
      return;
    }
    if (hit) {
      select([hit.region.id], { reveal: false });
      const r = hit.region;
      ui.drag = { kind: hit.part === 'body' ? 'move' : hit.part, id: r.id, anchor: ms, current: ms, start: r.start, end: r.end, moved: false };
    } else {
      if (ui.selected.length) select([], { reveal: false });
      ui.drag = { kind: 'create', anchor: ms, current: ms, moved: false };
    }
    press = { x: e.clientX, id: hit?.region.id ?? null, timer: 0 };
    if (e.pointerType !== 'mouse' && hit) {
      // appui long = clic droit : écouter la zone
      press.timer = setTimeout(() => {
        if (ui.drag && !ui.drag.moved) {
          ui.drag = null;
          playRegion(press.id);
          renderOverlay();
        }
      }, 550);
    }
    el.wave.setPointerCapture(e.pointerId);
  });
  el.wave.addEventListener('pointermove', (e) => {
    if (!active()) return;
    if (!ui.drag) {
      const hit = regionHit(e.clientX);
      el.wave.style.cursor = !hit ? 'crosshair' : hit.part === 'body' ? 'grab' : 'ew-resize';
      return;
    }
    if (Math.abs(e.clientX - press.x) > 3) {
      ui.drag.moved = true;
      clearTimeout(press.timer);
    }
    ui.drag.current = xToMs(e.clientX);
    renderOverlay();
  });
  const endDrag = (e, cancelled = false) => {
    clearTimeout(press?.timer);
    const d = ui.drag;
    ui.drag = null;
    if (!d || cancelled) {
      renderOverlay();
      return;
    }
    const a = active();
    const dur = durationOf(a);
    if (d.kind === 'create') {
      const s = Math.min(d.anchor, d.current);
      const t = Math.max(d.anchor, d.current);
      if (t - s < MIN_REGION_MS) {
        // a click on empty waveform moves the playhead
        ui.cursor = s;
        if (ui.playing) play(s);
        else syncTransport();
        renderOverlay();
        return;
      }
      const id = addRegion(s, t);
      if (id != null) {
        select([id], { reveal: false });
        ctx.announce(`${regionById(id).name} créée, de ${fmt(s)} à ${fmt(t)}`);
      }
      renderOverlay();
      return;
    }
    let changed = false;
    if (d.kind === 'start') changed = moveRegion(d.id, Math.min(d.current, d.end - MIN_REGION_MS), d.end);
    else if (d.kind === 'end') changed = moveRegion(d.id, d.start, Math.min(Math.max(d.current, d.start + MIN_REGION_MS), dur));
    else if (d.kind === 'move' && d.moved) {
      const len = d.end - d.start;
      let s = Math.max(0, d.start + (d.current - d.anchor));
      if (s + len > dur) s = Math.max(0, dur - len);
      changed = moveRegion(d.id, s, s + len);
    }
    render();
    if (changed) {
      const r = regionById(d.id);
      ctx.announce(`${r.name} : ${fmt(r.start)} à ${fmt(r.end)}`);
    }
  };
  el.wave.addEventListener('pointerup', (e) => endDrag(e));
  el.wave.addEventListener('pointercancel', (e) => endDrag(e, true));
  el.wave.addEventListener('dblclick', (e) => {
    const hit = regionHit(e.clientX);
    if (hit) startRename(hit.region.id);
  });
  el.wave.addEventListener('contextmenu', (e) => {
    const hit = regionHit(e.clientX);
    if (!hit) return;
    e.preventDefault();
    select([hit.region.id], { reveal: false });
    playRegion(hit.region.id);
  });
  el.wave.addEventListener(
    'wheel',
    (e) => {
      if (!active()) return;
      const r = el.wave.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom(e.deltaY < 0, clamp((e.clientX - r.left) / r.width, 0, 1));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        // horizontal wheel pans; the vertical wheel keeps scrolling the page
        e.preventDefault();
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        pan(Math.sign(delta) * Math.max(1, ui.view.dur / 8));
      }
    },
    { passive: false },
  );

  /* ── view scrollbar: pointer and keyboard ── */
  el.view.addEventListener('pointerdown', (e) => {
    const a = active();
    if (!a) return;
    const r = el.view.getBoundingClientRect();
    const d = durationOf(a);
    const thumb = el.viewThumb.getBoundingClientRect();
    const grab = e.target === el.viewThumb ? e.clientX - thumb.left : thumb.width / 2;
    const move = (ev) => {
      const ratio = (ev.clientX - grab - r.left) / Math.max(1, r.width);
      ui.view.start = clamp(ratio * d, 0, Math.max(0, d - ui.view.dur));
      refreshView();
    };
    move(e);
    el.view.setPointerCapture(e.pointerId);
    el.view.addEventListener('pointermove', move);
    el.view.addEventListener('pointerup', () => el.view.removeEventListener('pointermove', move), { once: true });
  });
  const viewKeys = (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') pan((k === 'ArrowLeft' ? -1 : 1) * ui.view.dur / 8);
    else if (k === 'PageUp' || k === 'PageDown') pan((k === 'PageUp' ? -1 : 1) * ui.view.dur);
    else if (k === 'Home') pan(-Infinity);
    else if (k === 'End') pan(Infinity);
    else if (k === '+' || k === '=') zoom(true);
    else if (k === '-' || k === '−' || k === '_') zoom(false);
    else return false;
    e.preventDefault();
    return true;
  };
  el.view.addEventListener('keydown', viewKeys);

  /* ───────────── zone list (listbox) ───────────── */

  el.list.addEventListener('click', (e) => {
    const row = e.target.closest('.vl-row');
    if (!row || e.target.closest('input')) return;
    const id = Number(row.dataset.key);
    if (ui.rename) finishRename(true);
    if (e.ctrlKey || e.metaKey || ui.multi) toggle(id);
    else select([id]);
    el.list.focus({ preventScroll: true });
  });
  el.list.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.vl-row');
    if (row && !e.target.closest('input')) startRename(Number(row.dataset.key));
  });
  el.list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.vl-row');
    if (!row || e.target.closest('input')) return;
    e.preventDefault();
    const id = Number(row.dataset.key);
    ui.activeRow = id;
    playRegion(id);
    renderRegions();
  });
  let rowPress = 0;
  el.list.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.vl-row');
    if (!row || e.pointerType === 'mouse') return;
    rowPress = setTimeout(() => playRegion(Number(row.dataset.key)), 550);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.list.addEventListener(t, () => clearTimeout(rowPress)));
  el.list.addEventListener('focus', () => {
    const a = active();
    if (a && ui.activeRow == null && a.regions.length) {
      ui.activeRow = ui.selected.at(-1) ?? a.regions[0].id;
      renderRegions();
    }
  });

  el.list.addEventListener('keydown', (e) => {
    const a = active();
    if (!a || !a.regions.length || e.target !== el.list) return;
    const ids = a.regions.map((r) => r.id);
    const i = Math.max(0, ids.indexOf(ui.activeRow));
    const go = (j) => {
      const id = ids[clamp(j, 0, ids.length - 1)];
      if (e.ctrlKey || e.metaKey) {
        ui.activeRow = id;
        renderRegions();
        scrollRowIntoView(id);
      } else if (e.shiftKey) {
        const next = ui.selected.includes(id) ? ui.selected : [...ui.selected, id];
        select(next);
        ui.activeRow = id;
        renderRegions();
      } else select([id]);
    };
    const k = e.key;
    if (k === 'ArrowDown') go(i + 1);
    else if (k === 'ArrowUp') go(i - 1);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(ids.length - 1);
    else if (k === ' ' && (e.ctrlKey || e.metaKey)) toggle(ids[i]);
    else if (k === ' ') {
      if (ui.activeRow == null) ui.activeRow = ids[0];
      playRegion(ui.activeRow);
      renderRegions();
    } else if (k === 'Enter' || k === 'F2') startRename(ui.activeRow ?? ids[0]);
    else if (k === 'Delete' || k === 'Backspace') {
      const target = ui.selected.at(-1) ?? ui.activeRow;
      if (target != null) deleteRegion(target);
    } else if (k === 'Escape' && ui.selected.length) select([], { reveal: false });
    else if (k === 'ContextMenu' || (e.shiftKey && k === 'F10')) {
      if (ui.activeRow != null) playRegion(ui.activeRow);
    } else return;
    e.preventDefault();
  });

  /* ───────────── workspace keys ───────────── */

  root.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, .dropdown')) return;
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'z' || k === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) history(redoStack, undoStack, 'Rétablir');
      else history(undoStack, redoStack, 'Annuler');
      return;
    }
    if (mod && (k === 'y' || k === 'Y')) {
      e.preventDefault();
      history(redoStack, undoStack, 'Rétablir');
      return;
    }
    if (e.target === el.list || e.target === el.view) return;
    const onButton = e.target.closest('button, a, [role="menuitem"]');
    if (k === ' ' && !onButton && active()) {
      e.preventDefault();
      togglePlay();
    } else if (e.target === el.wave) {
      if ((k === 'Delete' || k === 'Backspace') && ui.selected.length) {
        e.preventDefault();
        deleteRegion(ui.selected.at(-1));
      } else if (k === 'Escape' && ui.selected.length) select([], { reveal: false });
      else viewKeys(e);
    }
  });

  /* ───────────── « Envoyer les voicelines vers » (audio context menu) ───────────── */

  let menuFor = null;
  let menuReturn = null;
  const menuItems = () => [...el.ctxMenu.querySelectorAll('[role="menuitem"]')];
  function openSendMenu(audioId, from, x, y) {
    menuFor = audioId;
    menuReturn = from;
    const box = root.getBoundingClientRect();
    const fr = from.getBoundingClientRect();
    el.ctxMenu.hidden = false;
    const mw = el.ctxMenu.offsetWidth;
    const mh = el.ctxMenu.offsetHeight;
    const left = x != null ? x - box.left : fr.left - box.left + 24;
    const top = y != null ? y - box.top : fr.bottom - box.top + 4;
    el.ctxMenu.style.left = `${clamp(left, 8, box.width - mw - 8)}px`;
    el.ctxMenu.style.top = `${clamp(top, 8, box.height - mh - 8)}px`;
    menuItems()[0].focus();
  }
  function closeSendMenu(returnFocus = true) {
    if (el.ctxMenu.hidden) return;
    el.ctxMenu.hidden = true;
    if (returnFocus) menuReturn?.focus({ preventScroll: true });
  }
  el.ctxMenu.addEventListener('keydown', (e) => {
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    } else if (e.key === 'Escape' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      closeSendMenu();
    } else if (e.key === 'Tab') closeSendMenu(false);
  });
  el.ctxMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-send]');
    if (!item) return;
    closeSendMenu();
    sendTo(menuFor, item.dataset.send);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!el.ctxMenu.hidden && !el.ctxMenu.contains(e.target)) closeSendMenu(false);
  });

  /* ───────────── life cycle ───────────── */

  new ResizeObserver(() => {
    markClipped(el.list);
    markClipped(el.files);
    if (!active()) return;
    drawWave();
    renderTicks();
    renderOverlay();
    placePlayhead();
  }).observe(el.stage);
  new IntersectionObserver(([entry]) => {
    ui.visible = entry.isIntersecting;
    if (!ui.visible && ui.playing) stop();
  }).observe(root);
  ctx.tabs.onChange((name) => {
    if (name !== 'voicelines') {
      stop();
      closeSendMenu(false);
    } else requestAnimationFrame(refreshView);
  });
  if (ctx.os === 'mobile') {
    el.hint.innerHTML =
      '<span>Touchez pour sélectionner</span><span>double-tap pour renommer</span><span>appui long pour écouter</span><span>glissez pour tracer une zone</span>';
  }

  render();
}
