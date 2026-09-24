// The first viewport: demo band, functional toolbar, lip-synced work copy.

import { Band, FPS } from '../band/engine.js';
import { buildProject, downloadLines, layoutDownloads, PARK, START } from '../band/demo.js';
import { visemeFor, VISEMES } from '../band/text.js';
import { settings } from '../lib/settings.js';
import { announce } from '../lib/announce.js';
import { getDownloads, detectOS, FALLBACK, OS_LABEL } from '../lib/downloads.js';
import { makeDropdown } from './ui.js';

const pad = (n) => String(Math.floor(n)).padStart(2, '0');
export function timecode(frame, hour = '01') {
  const f = Math.max(0, Math.floor(frame));
  const ff = f % FPS;
  const ss = Math.floor(f / FPS) % 60;
  const mm = Math.floor(f / FPS / 60);
  return `${hour}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

const BRUSHES = [
  ['#ffffff', 'blanc'],
  ['#ff4d4d', 'rouge'],
  ['#4dff4d', 'vert'],
  ['#4d80ff', 'bleu'],
  ['#ffff4d', 'jaune'],
  ['#ff8033', 'orange'],
  ['#cc4dff', 'violet'],
  ['#33cccc', 'cyan'],
];
const NOTES = ['plus doux', 'sourire', 'souffle avant', 'off', 'reprendre en boucle', 'appuyer la fin'];

export function initHero({ tabs }) {
  const os = detectOS();
  const panel = document.getElementById('ws-rythmo');
  const host = document.getElementById('hero-band');
  let downloads = FALLBACK;

  const band = new Band(host, {
    project: buildProject(FALLBACK, os),
    tracks: 3,
    startFrame: START,
    stopAt: PARK,
    label: 'Bande rythmo de démonstration',
    settings,
    announce,
  });
  band.on('resize', () => layoutDownloads(band));
  layoutDownloads(band);

  const applyDownloads = (dl) => {
    downloads = dl;
    band.project.lines = band.project.lines.filter((l) => !l.download).concat(downloadLines(dl, os, { compact: true }));
    layoutDownloads(band);
  };
  getDownloads().then((dl) => {
    if (dl.live) applyDownloads(dl);
  });

  /* ── intro: play the scene once, park on the downloads ── */
  const intro = () => {
    if (settings.get().reduceMotion) {
      band.setFrame(PARK);
      return;
    }
    band.setFrame(START);
    setTimeout(() => {
      if (tabs.current() === 'rythmo' && band.frame === START) band.play();
    }, 900);
  };
  intro();
  // only worth saying to someone still in the window: never while they read
  // or work further down the page
  band.on('parked', () => {
    const active = document.activeElement;
    const inWindow = !active || active === document.body || document.getElementById('top').contains(active);
    if (inWindow && heroInView() && tabs.current() === 'rythmo') {
      announce('Lecture terminée. Les lignes de téléchargement sont sous la barre de lecture.');
    }
  });

  /* ── lip-sync + timecode ── */
  const mouth = document.querySelector('[data-mouth]');
  const tcEl = document.querySelector('[data-tc]');
  const tcOut = document.querySelector('[data-tc-out]');
  const scrub = panel.querySelector('[data-scrub]');
  scrub.max = String(PARK + 40);
  const cache = new Map(VISEMES.map((v) => {
    const img = new Image();
    img.src = `/icons/detection/rhubarb_lips/${v}.png`;
    return [v, img.src];
  }));
  let lastViseme = 'P_B_M';
  let scrubbing = false;
  const onFrame = (f) => {
    tcEl.textContent = timecode(f);
    tcOut.textContent = timecode(f).slice(3);
    if (!scrubbing) {
      scrub.value = String(Math.round(f));
      scrub.style.setProperty('--fill', `${(Math.max(0, f) / (PARK + 40)) * 100}%`);
    }
    // mouth: sample every 2 frames, like a 12 fps animation
    const q = Math.floor(f / 2) * 2;
    const speaking = band.project.lines.find(
      (l) => !l.download && l.kind === 'dialogue' && l.text.length > 2 && !l.text.startsWith('(') && q >= l.start && q < l.start + l.dur,
    );
    let v = 'P_B_M';
    if (speaking) {
      const p = (q - speaking.start) / speaking.dur;
      let i = Math.floor(p * speaking.text.length);
      while (i >= 0 && !visemeFor(speaking.text[i])) i--;
      v = (i >= 0 && visemeFor(speaking.text[i])) || 'P_B_M';
    }
    if (v !== lastViseme) {
      lastViseme = v;
      mouth.src = cache.get(v);
    }
  };
  band.on('frame', onFrame);
  onFrame(band.frame);
  scrub.addEventListener('input', () => {
    scrubbing = true;
    band.seek(Number(scrub.value));
    scrub.style.setProperty('--fill', `${(scrub.value / scrub.max) * 100}%`);
  });
  scrub.addEventListener('change', () => {
    scrubbing = false;
  });

  /* ── play button state ── */
  const playBtn = panel.querySelector('[data-cmd="play"]');
  const playIcon = playBtn.querySelector('[data-play-icon]');
  const syncPlay = () => {
    const on = band.playing;
    playIcon.style.setProperty('--src', `url(/icons/${on ? 'pause' : 'resume'}.svg)`);
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
    playBtn.dataset.tip = on ? 'Pause' : 'Lecture';
    playBtn.setAttribute('aria-pressed', String(on));
  };
  band.on('play', syncPlay);
  band.on('pause', syncPlay);
  syncPlay();

  /* ── toolbar commands ── */
  let noteIdx = 0;
  let brushIdx = 0;
  const hint = panel.querySelector('[data-toolbar-hint]');
  const HINTS = {
    select: 'Glissez sur la bande pour la faire défiler, ou déplacez une ligne.',
    draw: 'Dessinez sur la bande : le trait reste accroché au temps.',
    erase: 'Passez sur un trait pour l’effacer.',
  };
  const setTool = (tool) => {
    band.setTool(tool);
    panel.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    if (hint) hint.textContent = HINTS[tool];
    announce({ select: 'Mode sélection', draw: 'Mode dessin', erase: 'Gomme' }[tool]);
  };
  const cycleBrush = () => {
    brushIdx = (brushIdx + 1) % BRUSHES.length;
    const [color, name] = BRUSHES[brushIdx];
    band.setBrush({ color });
    const btn = panel.querySelector('[data-cmd="brush-color"]');
    btn.setAttribute('aria-label', `Couleur du pinceau : ${name}`);
    panel.querySelector('[data-swatch]').style.setProperty('--swatch', color);
    announce(`Couleur du pinceau : ${name}`);
    if (band.tool !== 'draw') setTool('draw');
  };
  const insertCode = (code, kind) => {
    const breath = kind === 'breath';
    band.insertLine({ text: code, kind: breath ? 'breath' : 'dialogue', dur: breath ? 9 : Math.max(10, code.length * 3) });
    announce(breath ? (code === '↑' ? 'Inspiration ajoutée' : 'Expiration ajoutée') : `Réaction ${code} ajoutée`);
  };
  const ambianceEnd = () => {
    const f = Math.round(band.frame);
    const amb = band.project.lines.find((l) => l.kind === 'ambiance' && f > l.start && f < l.start + l.dur);
    if (!amb) return announce('Aucune ambiance en cours à la tête de lecture');
    amb.dur = f - amb.start;
    band.invalidate();
    announce('Fin d’ambiance');
  };
  const ambianceStart = () => {
    band.insertLine({ kind: 'ambiance', character: 'PLUIE', text: 'Pluie sur les vitres', dur: 96, track: 2, color: '#338cff' });
    announce('Début d’ambiance');
  };
  const commands = {
    prev: () => band.step(-1),
    next: () => band.step(1),
    play: () => band.toggle(),
    boucle: () => band.addMarker('boucle'),
    out: () => band.addMarker('out'),
    scene: () => band.addMarker('scene'),
    note: () => band.setNote(NOTES[noteIdx++ % NOTES.length]),
    'amb-end': ambianceEnd,
    'amb-start': ambianceStart,
    karaoke: () => band.toggleKaraoke(),
    'brush-color': cycleBrush,
  };
  panel.querySelectorAll('[data-cmd]').forEach((b) => {
    const fn = commands[b.dataset.cmd];
    if (fn) b.addEventListener('click', fn);
  });
  panel.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  panel.querySelectorAll('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      band.setBrush({ size: b.dataset.size });
      panel.querySelectorAll('[data-size]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      announce(b.dataset.tip);
      if (band.tool !== 'draw') setTool('draw');
    }),
  );
  const respBtn = panel.querySelector('[data-cmd="respirations"]');
  const reactBtn = panel.querySelector('[data-cmd="reactions"]');
  const resp = makeDropdown(respBtn, document.getElementById('dd-resp'));
  const react = makeDropdown(reactBtn, document.getElementById('dd-react'));
  panel.querySelectorAll('[data-insert]').forEach((item) =>
    item.addEventListener('click', () => {
      insertCode(item.dataset.insert, item.dataset.kind);
      band.host.focus({ preventScroll: true });
    }),
  );

  /* ── workspace shortcuts (RACCOURCIS_CLAVIER.md « Outils et lecture ») ── */
  panel.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, .dropdown')) return;
    const code = e.code;
    const map = {
      Numpad1: () => commands.boucle(),
      Numpad2: () => commands.out(),
      Numpad3: () => commands.scene(),
      Numpad4: () => resp.open(true),
      Numpad5: () => react.open(true),
      Numpad6: () => commands.note(),
      Numpad7: () => ambianceEnd(),
      Numpad8: () => ambianceStart(),
      Numpad9: () => commands.karaoke(),
    };
    if (e.ctrlKey && /^Numpad[1-4]$/.test(code)) {
      e.preventDefault();
      const track = Number(code.slice(-1)) - 1;
      band.insertLine({ text: 'Nouvelle réplique', dur: 48, track });
      announce(`Ligne créée sur la piste ${track + 1}`);
      return;
    }
    if (map[code] && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      map[code]();
      return;
    }
    if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      setTool('draw');
    } else if (!e.ctrlKey && !e.metaKey && (e.key === 'c' || e.key === 'C') && e.target === band.host) {
      setTool('select');
    } else if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
      e.preventDefault();
      band.step(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  /* ── pause when leaving the tab ── */
  tabs.onChange((name) => {
    if (name !== 'rythmo') band.pause();
  });

  /* ── "Télécharger" everywhere: park the band on the downloads ── */
  const firstDownloadAnchor = () => {
    const first = band.project.lines.find((l) => l.download && l.track === 0);
    return first && band.anchorFor(first.id);
  };
  const heroInView = () => {
    const r = document.getElementById('top').getBoundingClientRect();
    return r.bottom > window.innerHeight * 0.55;
  };
  document.querySelectorAll('[data-action="goto-downloads"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      if (!heroInView() || tabs.current() !== 'rythmo') return; // follow the link to #telecharger
      e.preventDefault();
      band.seek(PARK, { animate: true, duration: 1100 });
      const done = () => {
        firstDownloadAnchor()?.focus({ preventScroll: true });
        announce('Lignes de téléchargement sous la barre de lecture');
      };
      settings.get().reduceMotion ? done() : setTimeout(done, 1150);
    }),
  );
  document.querySelectorAll('[data-os-hint]').forEach((el) => {
    el.textContent = os === 'mobile' ? 'ordinateur' : OS_LABEL[os] || '';
  });

  /* ── tooltip on hovered download lines ── */
  band.on('hover', ({ line, el }) => {
    const tip = document.getElementById('tooltip');
    if (!line) {
      tip.removeAttribute('data-show');
      return;
    }
    el.dataset.tip = line.action.label;
  });

  /* ── reset demo ── */
  document.querySelectorAll('[data-action="reset-demo"]').forEach((b) =>
    b.addEventListener('click', () => {
      band.setProject(buildProject(downloads, os));
      layoutDownloads(band);
      band.seek(START);
      band.play();
      announce('Bande de démonstration réinitialisée');
    }),
  );

  return { band, os, get downloads() { return downloads; } };
}
