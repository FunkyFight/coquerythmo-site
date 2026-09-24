// Export (boucle 4): the Export centre of the app (menu Export › « Exporter… »,
// Ctrl+M) rebuilt from src/ui/export_modal.rs with its four pages, its
// languages panel and its keyboard model, next to the files one « Exporter »
// would write. File names follow src/configured_export.rs; output dimensions
// and band height follow resolve_video_dimensions() and br_height().
// « Exporter » leads to the download: the site exports nothing, and does not
// pretend to either.

import { CAST } from '../../band/demo.js';
import { visemeFor } from '../../band/text.js';

/* ───────────── demo project ───────────── */
const BASE = 'demo_episode_12'; // « Choisir le nom de base des exports »
const SOURCE = { w: 1920, h: 1080 }; // the demo work copy is 16:9
const TRACKS = 2; // the preview scene uses two tracks, no karaoke
const PARK = 40;

// Project::new_with_language("Français", "fr-fr") for the first language
// (project.rs:535); a language added from the UI gets its name as code
// (project.rs:821).
const LANGS = [
  { id: 1, name: 'Français', code: 'fr-fr', instrumental: true },
  { id: 2, name: 'English', code: 'English', instrumental: true },
  { id: 3, name: 'Français (Canada)', code: 'Français (Canada)', instrumental: false },
];

const PAGES = ['video', 'subs', 'audio', 'refs'];
const PAGE_LABEL = { video: 'Vidéo', subs: 'Sous-titres', audio: 'Audio', refs: 'Références' };

// audio versions per language: mini toggles O / I / O+ / I+ (render_languages())
const TOGGLES = [
  { key: 'o', code: 'O', label: 'Exporter avec audio original', inst: false },
  { key: 'i', code: 'I', label: 'Exporter avec audio instrumental', inst: true },
  { key: 'op', code: 'O+', label: 'Audio original + annonceur', inst: false },
  { key: 'ip', code: 'I+', label: 'Audio instru + annonceur', inst: true },
];

// ExportConfiguration::default() (project.rs:164) plus the choices saved in
// the demo project: two languages, SRT + DETX, WAV and the presence grid.
const cfg = {
  video: true,
  aspect: 'source',
  quality: '1080',
  customW: 1920,
  customH: 1080,
  fps: 60, // DEFAULT_EXPORT_FPS
  brScale: 100, // percent
  karaoke: 100, // percent
  preRoll: 0, // tenths of a second
  countdown: false,
  countdownStart: 3,
  subs: { json: false, srt: true, ass: false, detx: true },
  audio: { mp3: false, wav: true, bwf: false },
  refs: { csv: false, pdf: false, grid: true },
  langs: [1, 2],
  audioBy: {
    1: { o: true, i: true, op: false, ip: false },
    2: { o: true, i: false, op: false, ip: false },
    3: { o: true, i: false, op: false, ip: false },
  },
};

// Steppers: ranges and steps of adjust_focus_value() (export_modal.rs:726-750)
const fr1 = (v) => (v / 10).toFixed(1);
const STEPS = {
  fps: { min: 1, max: 480, step: 1, text: (v) => String(v), spoken: (v) => `${v} images par seconde` },
  brScale: { min: 50, max: 200, step: 10, text: (v) => `${v}%`, spoken: (v) => `${v} %` },
  karaoke: { min: 50, max: 200, step: 10, text: (v) => `${v}%`, spoken: (v) => `${v} %` },
  preRoll: { min: 0, max: 1200, step: 5, text: (v) => `${fr1(v)} s`, spoken: (v) => `${fr1(v).replace('.', ',')} seconde` },
  countdownStart: { min: 1, max: 30, step: 1, text: (v) => String(v), spoken: (v) => `${v} seconde${v > 1 ? 's' : ''}` },
};
const stepKey = { fps: 'fps', brScale: 'brScale', karaoke: 'karaoke', preRoll: 'preRoll', countdownStart: 'countdownStart' };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ───────────── rules lifted from the Rust sources ───────────── */

// configured_export.rs even(): clamp 16–8192, round odd values up
function even(v) {
  const x = clamp(Math.round(v), 16, 8192);
  return x % 2 ? Math.min(8192, x + 1) : x;
}

// configured_export.rs resolve_video_dimensions()
function resolveDims() {
  if (cfg.quality === 'custom') return [even(cfg.customW), even(cfg.customH)];
  const short = { 720: 720, 1080: 1080, 1440: 1440, '8k': 4320 }[cfg.quality];
  if (cfg.aspect === '16:9') return [even(Math.floor((short * 16) / 9)), even(short)];
  if (cfg.aspect === '9:16') return [even(short), even(Math.floor((short * 16) / 9))];
  let w = SOURCE.w >= SOURCE.h ? (short * SOURCE.w) / SOURCE.h : short;
  let h = SOURCE.w >= SOURCE.h ? short : (short * SOURCE.h) / SOURCE.w;
  const largest = Math.max(w, h);
  if (largest > 8192) {
    w *= 8192 / largest;
    h *= 8192 / largest;
  }
  return [even(w), even(h)];
}

// rythmo_cpu_renderer.rs br_height(): (RULER 28 + per track 28 header + 2 gap
// + 40 slot) × width / 800 × zoom; pipeline.rs stacks it under the video.
function stack() {
  const [w, h] = resolveDims();
  const br = Math.ceil((28 + 70 * TRACKS) * (w / 800) * (cfg.brScale / 100));
  const brEven = br + (br % 2);
  const vid = Math.max(2, h - brEven);
  return { w, h, brEven, vid, outH: vid + brEven };
}

// configured_export.rs safe_filename()
function safeFilename(value) {
  let out = '';
  let sep = false;
  for (const ch of value.trim()) {
    if ([...out].length >= 48) break;
    const invalid = /[\u0000-\u001f<>:"/\\|?*]/.test(ch) || /\s/.test(ch);
    if (invalid) {
      if (!sep && out) {
        out += '_';
        sep = true;
      }
    } else {
      out += ch;
      sep = false;
    }
  }
  out = out.replace(/^[._]+|[._]+$/g, '');
  return out || 'export';
}

// configured_export.rs selected_audio_tracks(): O, I, O+, I+ (announcer
// versions are Windows-only in the app)
function tracksFor(lang) {
  const sel = cfg.audioBy[lang.id];
  const tracks = [];
  if (sel.o) tracks.push({ label: 'original', ann: false });
  if (sel.i && lang.instrumental) tracks.push({ label: 'instrumental', ann: false });
  if (sel.op) tracks.push({ label: 'original_announcer', ann: true });
  if (sel.ip && lang.instrumental) tracks.push({ label: 'instrumental_announcer', ann: true });
  return tracks;
}

// configured_export.rs run(): per language, videos, subtitles, audio,
// cross-reference CSV / PDF, presence grid, in that order
function buildFiles() {
  const used = new Set();
  const groups = [];
  for (const lang of LANGS.filter((l) => cfg.langs.includes(l.id))) {
    let prefix = `${safeFilename(BASE)}_${safeFilename(lang.code || lang.name)}`;
    if (used.has(prefix.toLowerCase())) prefix = `${prefix}_${lang.id}`;
    used.add(prefix.toLowerCase());
    const tracks = tracksFor(lang);
    const files = [];
    const add = (name, meta, weight, cat) => files.push({ name, prefix, meta, weight, cat });
    if (cfg.video) {
      for (const t of tracks) {
        // pipeline.rs:248-262: the source audio is copied unless it has to be
        // remuxed (AAC 192k, audio.rs:82); the countdown pass re-encodes too
        const aac = t.label !== 'original' || cfg.preRoll > 0 || cfg.countdown;
        const meta = `H.264 · ${aac ? 'AAC' : 'son d’origine'}${t.ann ? ' · annonceur' : ''}`;
        add(`${prefix}_${t.label}.mp4`, meta, 2600 + (cfg.countdown ? 450 : 0) + (t.ann ? 400 : 0), 'video');
      }
    }
    const subs = [
      ['json', 'Données de la bande'],
      ['srt', 'Sous-titres'],
      ['ass', 'Sous-titres stylés'],
      ['detx', 'Cappella'],
    ];
    for (const [ext, meta] of subs) if (cfg.subs[ext]) add(`${prefix}.${ext}`, meta, 320, 'subs');
    const audio = [
      ['mp3', 'mp3', 'MP3 320 kb/s', 700],
      ['wav', 'wav', 'PCM 24 bits · 48 kHz', 560],
      ['bwf', 'wav', 'BWF · BEXT', 650],
    ];
    for (const t of tracks) {
      for (const [key, ext, meta, weight] of audio) {
        if (cfg.audio[key]) add(`${prefix}_${t.label}_${key}.${ext}`, t.ann ? `${meta} · annonceur` : meta, weight + (t.ann ? 450 : 0), 'audio');
      }
    }
    if (cfg.refs.csv) add(`${prefix}_cross_reference.csv`, 'Croisées · tableur', 300, 'refs');
    if (cfg.refs.pdf) add(`${prefix}_cross_reference.pdf`, 'Croisées · à imprimer', 480, 'refs');
    if (cfg.refs.grid) add(`${prefix}_presence_grid.pdf`, 'Présence par boucle', 480, 'refs');
    if (files.length) groups.push({ lang, files });
  }
  return groups;
}

// export_modal.rs toggle_language(): the last selected language stays
function toggleLanguage(id) {
  const i = cfg.langs.indexOf(id);
  if (i === -1) cfg.langs.push(id);
  else if (cfg.langs.length > 1) cfg.langs.splice(i, 1);
  else return false;
  return true;
}
// export_modal.rs toggle_language_audio(): original and instrumental never
// both end up off
function toggleAudio(lang, instrumental) {
  if (instrumental && !lang.instrumental) return;
  const sel = cfg.audioBy[lang.id];
  if (!cfg.langs.includes(lang.id)) {
    cfg.langs.push(lang.id);
    if (instrumental) sel.i = true;
    else sel.o = true;
    return;
  }
  if (instrumental) {
    if (sel.o || !sel.i) sel.i = !sel.i;
  } else if (sel.i || !sel.o) sel.o = !sel.o;
}
// export_modal.rs toggle_language_announcer()
function toggleAnnouncer(lang, instrumental) {
  if (instrumental && !lang.instrumental) return;
  const sel = cfg.audioBy[lang.id];
  const fresh = !cfg.langs.includes(lang.id);
  if (fresh) cfg.langs.push(lang.id);
  if (instrumental) sel.ip = fresh || !sel.ip;
  else sel.op = fresh || !sel.op;
}

/* ───────────── preview project: the page's fictional scene on two tracks ───────────── */
function previewProject() {
  let id = 1;
  const L = (o) => ({ id: id++, kind: 'dialogue', note: '', karaoke: false, color: CAST[o.character], ...o });
  return {
    lines: [
      L({ track: 0, start: 12, dur: 48, character: 'MAYA', text: 'Bon, on le double quand, cet épisode ?' }),
      L({ track: 0, start: 62, dur: 9, character: 'MAYA', text: '↑', kind: 'breath' }),
      L({ track: 1, start: 66, dur: 46, character: 'THÉO', text: 'Ce soir. La bande est déjà prête.' }),
      L({ track: 0, start: 114, dur: 13, character: 'MAYA', text: '(oh)' }),
      L({ track: 0, start: 130, dur: 46, character: 'MAYA', text: 'Et le logiciel, il coûte combien ?' }),
      L({ track: 1, start: 190, dur: 56, character: 'THÉO', text: 'Rien. Gratuit, pour tout le monde.' }),
    ],
    markers: [
      { kind: 'boucle', frame: 6 },
      { kind: 'boucle', frame: 184 },
      { kind: 'out', frame: 250 },
    ],
    strokes: [],
  };
}

export function init(ctx) {
  const root = document.getElementById('export');
  const hub = root?.querySelector('[data-xp-hub]');
  if (!hub) return;
  const $ = (sel, el = root) => el.querySelector(sel);
  const $$ = (sel, el = root) => [...el.querySelectorAll(sel)];

  const tabs = $$('[role="tab"]', hub);
  const closedBar = $('[data-xp-closed]');
  const langList = $('[data-langs]');
  const resEl = $('[data-res]');
  const dimsEl = $('[data-dims]');
  const countStep = $('[data-step="countdownStart"]');
  const box = $('[data-preview-box]');
  const frame = $('[data-frame]');
  const src = $('[data-frame-src]');
  const mouth = $('[data-frame-mouth]');
  const tcEl = $('[data-frame-tc]');
  const offEl = $('[data-frame-off]');
  const capDims = $('[data-cap-dims]');
  const capLine = $('[data-cap-line]');
  const capExtra = $('[data-cap-extra]');
  const filesEl = $('[data-files]');
  const emptyEl = $('[data-files-empty]');
  const countEl = $('[data-count]');
  const reduce = () => ctx.settings.get().reduceMotion;

  let page = 'video';
  let closed = false;

  /* ── languages panel rows ── */
  langList.innerHTML = LANGS.map(
    (l) => `
    <li class="xp-lang" data-lang="${l.id}">
      <label class="xp-lang__pick">
        <input class="xp-box" type="checkbox" data-lang-pick />
        <span class="xp-lang__name">${esc(l.name)}</span>
        <span class="xp-lang__meta">${l.instrumental ? 'avec instrumental' : 'sans instrumental'}</span>
      </label>
      <div class="xp-lang__audio" role="group" aria-label="Versions audio, ${esc(l.name)}">
        ${TOGGLES.map(
          (t) =>
            `<button class="xp-mini" type="button" data-audio="${t.key}" aria-pressed="false" aria-label="${esc(l.name)}, ${t.label}" data-tip="${t.label}"${t.inst && !l.instrumental ? ' disabled' : ''}>${t.code}</button>`,
        ).join('')}
      </div>
    </li>`,
  ).join('');

  /* ── preview: frame, work copy, a tiny non-interactive band ── */
  const band = new ctx.Band($('[data-frame-band]'), {
    project: previewProject(),
    tracks: TRACKS,
    startFrame: PARK,
    scale: 0.5,
    interactive: false,
    label: 'Bande rythmo de l’aperçu',
    settings: ctx.settings,
  });

  function layoutPreview() {
    const s = stack();
    const avail = Math.max(200, box.clientWidth - 26);
    const maxH = 356;
    const ratio = clamp(s.outH / s.w, 0.2, 2.2);
    let fw = avail;
    let fh = fw * ratio;
    if (fh > maxH) {
      fh = maxH;
      fw = fh / ratio;
    }
    if (fw < 200) {
      fw = 200;
      fh = Math.min(fw * ratio, 440);
    }
    fw = Math.round(fw);
    fh = Math.round(fh);
    frame.style.width = `${fw}px`;
    frame.style.height = `${fh}px`;
    // the engine's own height for 2 tracks is about 134 × scale
    const bandPx = (fh * s.brEven) / s.outH;
    band.opts.scale = Math.max(0.12, bandPx / 134);
    band.layout();
    const vidH = Math.max(0, fh - band.height);
    const sw = Math.min(fw, (vidH * SOURCE.w) / SOURCE.h);
    const sh = (sw * SOURCE.h) / SOURCE.w;
    src.style.width = `${Math.round(sw)}px`;
    src.style.height = `${Math.round(sh)}px`;
    src.style.setProperty('--u', `${(sh / 100).toFixed(3)}px`);
  }

  function syncPreviewText() {
    const s = stack();
    const pct = Math.round((s.brEven / s.outH) * 100);
    capDims.textContent = `${s.w} × ${s.h} px · ${cfg.fps} FPS`;
    capLine.textContent = `La bande rythmo occupe ${pct} % de la hauteur, sous l’image.`;
    const pre = cfg.preRoll > 0 ? `${fr1(cfg.preRoll).replace('.', ',')} s de pré-roll` : '';
    let extra = '';
    if (cfg.countdown && pre) extra = `Démarre par un compte à rebours de ${cfg.countdownStart} s, puis ${pre}.`;
    else if (cfg.countdown) extra = `Démarre par un compte à rebours de ${cfg.countdownStart} s.`;
    else if (pre) extra = `Démarre par ${pre} : la bande défile avant l’image.`;
    capExtra.textContent = extra;
    capExtra.hidden = !extra;
    offEl.hidden = cfg.video;
    frame.toggleAttribute('data-off', !cfg.video);
    frame.setAttribute(
      'aria-label',
      cfg.video
        ? `Aperçu de la vidéo exportée, ${s.w} × ${s.h} pixels : l’image en haut, la bande rythmo en bas sur ${pct} % de la hauteur.`
        : 'Aperçu : aucune vidéo MP4 dans cet export.',
    );
  }

  /* ── mouth + timecode, like the window's work copy ── */
  const lines = band.project.lines;
  let lastViseme = 'P_B_M';
  function setScene(f) {
    tcEl.textContent = ctx.timecode(Math.max(0, f));
    const q = Math.floor(f / 2) * 2;
    const speaking = lines.find((l) => l.kind === 'dialogue' && l.text.length > 2 && !l.text.startsWith('(') && q >= l.start && q < l.start + l.dur);
    let v = 'P_B_M';
    if (speaking) {
      let i = Math.floor(((q - speaking.start) / speaking.dur) * speaking.text.length);
      while (i >= 0 && !visemeFor(speaking.text[i])) i--;
      v = (i >= 0 && visemeFor(speaking.text[i])) || 'P_B_M';
    }
    if (v !== lastViseme) {
      lastViseme = v;
      mouth.src = `/icons/detection/rhubarb_lips/${v}.png`;
    }
  }
  setScene(PARK);

  /* ── pages ── */
  function setPage(name, { focus = false } = {}) {
    if (!PAGES.includes(name)) return;
    page = name;
    for (const t of tabs) {
      const on = t.dataset.page === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).toggleAttribute('data-active', on);
    }
    if (focus) tabs[PAGES.indexOf(name)].focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setPage(t.dataset.page));
    t.addEventListener('keydown', (e) => {
      // CursorUp/Left and CursorDown/Right on the rail move between pages
      // (export_modal.rs:1075-1118)
      let j = null;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i + 3) % 4;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % 4;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = 3;
      if (j === null) return;
      e.preventDefault();
      setPage(PAGES[j], { focus: true });
    });
  });

  /* ── segmented choices (radiogroups) ── */
  $$('[data-seg]').forEach((group) => {
    const key = group.dataset.seg;
    const opts = $$('[role="radio"]', group);
    const choose = (opt, focus) => {
      cfg[key] = opt.dataset.value;
      update();
      if (focus) opt.focus();
      const s = resolveDims();
      ctx.announce(cfg.quality === 'custom' ? 'Dimensions personnalisées' : `${s[0]} × ${s[1]} px`);
    };
    opts.forEach((opt, i) => {
      opt.addEventListener('click', () => choose(opt, false));
      opt.addEventListener('keydown', (e) => {
        const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        // adjust_focus_value(): the choice wraps around
        choose(opts[(i + dir + opts.length) % opts.length], true);
      });
    });
  });

  /* ── checkboxes bound to the configuration ── */
  $$('[data-cfg]', hub).forEach((cb) =>
    cb.addEventListener('change', () => {
      const [a, b] = cb.dataset.cfg.split('.');
      if (b) cfg[a][b] = cb.checked;
      else cfg[a] = cb.checked;
      update();
      if (a === 'countdown' && cb.checked) countStep.querySelector('[role="spinbutton"]').scrollIntoView({ block: 'nearest' });
    }),
  );

  /* ── steppers (role="spinbutton", − and + for the pointer) ── */
  $$('[data-step]', hub).forEach((row) => {
    const key = stepKey[row.dataset.step];
    const def = STEPS[key];
    const spin = row.querySelector('[role="spinbutton"]');
    const nudge = (n) => {
      const next = clamp(cfg[key] + n, def.min, def.max);
      if (next === cfg[key]) return;
      cfg[key] = next;
      update();
    };
    spin.setAttribute('aria-valuemin', String(def.min));
    spin.setAttribute('aria-valuemax', String(def.max));
    spin.addEventListener('keydown', (e) => {
      const map = {
        ArrowUp: def.step,
        ArrowRight: def.step,
        ArrowDown: -def.step,
        ArrowLeft: -def.step,
        PageUp: def.step * 10,
        PageDown: -def.step * 10,
      };
      if (e.key in map) {
        e.preventDefault();
        nudge(map[e.key]);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        nudge((e.key === 'Home' ? def.min : def.max) - cfg[key]);
      }
    });
    row.querySelectorAll('[data-dir]').forEach((b) =>
      b.addEventListener('click', () => {
        nudge(Number(b.dataset.dir) * def.step);
        spin.focus({ preventScroll: true });
      }),
    );
  });

  /* ── Custom width × height (begin_numeric / finish_numeric) ── */
  $$('[data-dim]', hub).forEach((input) => {
    const key = input.dataset.dim === 'w' ? 'customW' : 'customH';
    const finish = () => {
      const n = parseInt(input.value, 10);
      cfg[key] = even(Number.isFinite(n) ? n : cfg[key]);
      update();
    };
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 5);
      if (digits !== input.value) input.value = digits;
    });
    input.addEventListener('change', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        cfg[key] = clamp(cfg[key] + (e.key === 'ArrowUp' ? 2 : -2), 16, 8192);
        update();
      }
    });
  });

  /* ── languages ── */
  langList.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-lang-pick]');
    if (!cb) return;
    const id = Number(cb.closest('[data-lang]').dataset.lang);
    if (!toggleLanguage(id)) ctx.announce('Au moins une langue reste sélectionnée.');
    update();
  });
  langList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-audio]');
    if (!b || b.disabled) return;
    const lang = LANGS.find((l) => l.id === Number(b.closest('[data-lang]').dataset.lang));
    const k = b.dataset.audio;
    if (k === 'o' || k === 'i') toggleAudio(lang, k === 'i');
    else toggleAnnouncer(lang, k === 'ip');
    update();
  });

  /* ── hub keyboard: Enter toggles checkboxes, Échap closes (like the app) ── */
  hub.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[type="checkbox"]')) {
      e.preventDefault();
      e.target.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeHub();
    }
  });

  /* ── open / close ── */
  function closeHub() {
    closed = true;
    hub.hidden = true;
    closedBar.hidden = false;
    closedBar.querySelector('button').focus();
    ctx.announce('Centre d’export fermé');
  }
  function openHub({ focus = true, silent = false } = {}) {
    closed = false;
    hub.hidden = false;
    closedBar.hidden = true;
    layoutPreview();
    if (focus) tabs[PAGES.indexOf(page)].focus();
    if (!silent) ctx.announce('Exporter…');
  }
  $('[data-xp-close]').addEventListener('click', closeHub);
  $('[data-xp-open]').addEventListener('click', () => openHub());

  // Ctrl+M: « Ouvrir l’export du projet » (RACCOURCIS_CLAVIER.md)
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || e.key.toLowerCase() !== 'm') return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    if (closed) openHub({ focus: false, silent: true });
    root.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });
    tabs[PAGES.indexOf(page)].focus({ preventScroll: true });
    ctx.announce('Exporter…');
  });

  // topbar « Export » menu: each item opens its page
  document.querySelectorAll('[data-export-page]').forEach((a) =>
    a.addEventListener('click', () => {
      const name = a.dataset.exportPage;
      if (closed) openHub({ focus: false, silent: true });
      setPage(name);
      requestAnimationFrame(() => {
        tabs[PAGES.indexOf(name)].focus();
      });
      ctx.announce(`Exporter…, page ${PAGE_LABEL[name]}`);
    }),
  );

  /* ── render ── */
  let lastCount = null;
  let countTimer = 0;
  function renderFiles() {
    const groups = buildFiles();
    const n = groups.reduce((a, g) => a + g.files.length, 0);
    const langs = groups.length;
    countEl.textContent = n ? `${plural(n, 'fichier', 'fichiers')}${langs > 1 ? ` · ${langs} langues` : ''}` : 'aucun fichier';
    filesEl.innerHTML = groups
      .map(
        (g) => `
      <section class="xp-group" aria-label="${esc(g.lang.name)}">
        <h4 class="xp-group__title">${esc(g.lang.name)}<span>${plural(g.files.length, 'fichier', 'fichiers')}</span></h4>
        <ol class="xp-group__list" role="list">
          ${g.files
            .map(
              (f) => `<li class="xp-file" data-state="pending" data-cat="${f.cat}">
            <span class="xp-file__dot" aria-hidden="true"></span>
            <span class="xp-file__name"><span>${esc(f.prefix)}</span><wbr />${esc(f.name.slice(f.prefix.length))}</span>
            <span class="xp-file__meta">${esc(f.meta)}</span>
          </li>`,
            )
            .join('')}
        </ol>
      </section>`,
      )
      .join('');
    emptyEl.hidden = n > 0;
    if (lastCount !== null && n !== lastCount) {
      clearTimeout(countTimer);
      countTimer = setTimeout(() => ctx.announce(n ? `${plural(n, 'fichier', 'fichiers')} à produire` : 'Aucun fichier à produire'), 700);
    }
    lastCount = n;
    return groups;
  }

  function update() {
    // Vidéo page
    $$('[data-cfg]', hub).forEach((cb) => {
      const [a, b] = cb.dataset.cfg.split('.');
      cb.checked = b ? !!cfg[a][b] : !!cfg[a];
      cb.closest('.xp-format')?.toggleAttribute('data-on', cb.checked);
    });
    $$('[data-seg]', hub).forEach((group) => {
      for (const opt of $$('[role="radio"]', group)) {
        const on = opt.dataset.value === cfg[group.dataset.seg];
        opt.setAttribute('aria-checked', String(on));
        opt.tabIndex = on ? 0 : -1;
      }
    });
    const custom = cfg.quality === 'custom';
    const [w, h] = resolveDims();
    resEl.hidden = custom;
    resEl.textContent = `${w} × ${h} px`;
    dimsEl.hidden = !custom;
    for (const input of $$('[data-dim]', hub)) {
      const v = String(input.dataset.dim === 'w' ? cfg.customW : cfg.customH);
      if (document.activeElement !== input) input.value = v;
    }
    countStep.hidden = !cfg.countdown;
    $$('[data-step]', hub).forEach((row) => {
      const key = stepKey[row.dataset.step];
      const def = STEPS[key];
      const spin = row.querySelector('[role="spinbutton"]');
      spin.textContent = def.text(cfg[key]);
      spin.setAttribute('aria-valuenow', String(cfg[key]));
      spin.setAttribute('aria-valuetext', def.spoken(cfg[key]));
      const [minus, plus] = row.querySelectorAll('[data-dir]');
      minus.disabled = cfg[key] <= def.min;
      plus.disabled = cfg[key] >= def.max;
    });

    // languages panel
    for (const li of $$('[data-lang]', langList)) {
      const lang = LANGS.find((l) => l.id === Number(li.dataset.lang));
      const on = cfg.langs.includes(lang.id);
      li.toggleAttribute('data-on', on);
      li.querySelector('[data-lang-pick]').checked = on;
      const sel = cfg.audioBy[lang.id];
      for (const b of li.querySelectorAll('[data-audio]')) {
        const k = b.dataset.audio;
        // like mini_toggle(): the stored choice shows even when the language is off
        const avail = !(k === 'i' || k === 'ip') || lang.instrumental;
        b.setAttribute('aria-pressed', String(avail && !!sel[k]));
      }
    }

    renderFiles();
    syncPreviewText();
    layoutPreview();
  }

  /* ── keep the preview sized to its column ── */
  new ResizeObserver(() => layoutPreview()).observe(box);

  update();
}
