// The demo project shown in the window: a short, fictional dub scene
// (labelled as such on the page), then the download lines parked on the
// reading bar. It reads like a real band, not a feature list: two
// characters, one track each, one breath, two boucles. Character colours are
// the app's brush presets.

import { formatSize } from '../lib/downloads.js';

export const PARK = 380;
export const START = 0;

export const CAST = {
  MAYA: '#ff8033',
  'THÉO': '#33cccc',
  WINDOWS: '#4d80ff',
  MACOS: '#e6e6eb',
  LINUX: '#ffff4d',
};

let id = 1;
const L = (o) => ({ id: id++, kind: 'dialogue', note: '', karaoke: false, ...o, color: o.color || CAST[o.character] });

// Durations follow a dubbing reading pace of roughly 14 characters a second.
export function sceneLines() {
  return [
    L({ track: 0, start: 8, dur: 62, character: 'MAYA', text: 'Bon, on le double quand, cet épisode ?' }),
    L({ track: 1, start: 74, dur: 54, character: 'THÉO', text: 'Ce soir. La bande est déjà prête.' }),
    L({ track: 0, start: 130, dur: 7, character: 'MAYA', text: '↑', kind: 'breath' }),
    L({ track: 0, start: 138, dur: 54, character: 'MAYA', text: 'Et le logiciel, il coûte combien ?' }),
    L({ track: 1, start: 196, dur: 62, character: 'THÉO', text: 'Rien. C’est gratuit, pour tout le monde.' }),
    L({ track: 0, start: 262, dur: 36, character: 'MAYA', text: 'Alors je le télécharge.' }),
  ];
}

export function sceneMarkers() {
  return [
    { kind: 'boucle', frame: 4 },
    { kind: 'boucle', frame: 304 },
  ];
}

/**
 * Download lines, visitor's OS first (track 0).
 * `compact` keeps one line per system and no notes: the window's band stays
 * a plain band; sizes and the "non testée" caveat live in the tooltip, the
 * accessible name and the download section.
 */
export function downloadLines(dl, os, { compact = false } = {}) {
  const w = dl.windows;
  const m = dl.macos;
  const lx = dl.linux;
  const byOS = {
    windows: [
      w.installer && {
        character: 'WINDOWS',
        text: `Télécharger l'installeur · ${w.version}`,
        note: `.exe · ${formatSize(w.installer.size)}`,
        action: {
          href: w.installer.url,
          label: `Télécharger Coquerythmo ${w.version} pour Windows, installeur, ${formatSize(w.installer.size)}`,
        },
      },
      !compact && w.portable && {
        character: 'WINDOWS',
        text: `Version portable · ${w.version}`,
        note: `.zip sans installation · ${formatSize(w.portable.size)}`,
        action: {
          href: w.portable.url,
          label: `Télécharger Coquerythmo ${w.version} pour Windows, version portable en zip, ${formatSize(w.portable.size)}`,
        },
      },
    ],
    macos: [
      m.app && {
        character: 'MACOS',
        text: `Télécharger l'app · ${m.version}`,
        note: `Apple Silicon · build non testée · ${formatSize(m.app.size)}`,
        action: {
          href: m.app.url,
          label: `Télécharger Coquerythmo ${m.version} pour macOS Apple Silicon, ${formatSize(m.app.size)}. Build non testée par l'auteur.`,
        },
      },
    ],
    linux: [
      lx.portable && {
        character: 'LINUX',
        text: `Télécharger le zip · ${lx.version}`,
        note: `portable · build non testée · ${formatSize(lx.portable.size)}`,
        action: {
          href: lx.portable.url,
          label: `Télécharger Coquerythmo ${lx.version} pour Linux, zip portable, ${formatSize(lx.portable.size)}. Build non testée par l'auteur.`,
        },
      },
    ],
  };
  const order = os === 'macos' ? ['macos', 'windows', 'linux'] : os === 'linux' ? ['linux', 'windows', 'macos'] : ['windows', 'macos', 'linux'];
  const list = order.flatMap((k) => byOS[k]).filter(Boolean).slice(0, 4);
  return list.map((o, i) =>
    L({ ...o, note: compact ? '' : o.note, track: i, start: PARK - 40, dur: 90, locked: true, color: CAST[o.character], download: true }),
  );
}

/** Fit the parked download lines to the band's width so every label and
 *  most of each line sit on screen around the reading bar. */
export function layoutDownloads(band) {
  const lines = band.project.lines.filter((l) => l.download);
  const cx = band.width / 2;
  const narrow = band.width < 700;
  // box sized from the text so the lettering is stretched over the whole
  // duration, like every line of a bande rythmo (engine caps action lines at 1.9)
  lines.forEach((line, i) => {
    const font = band.fontText(line.note ? Math.round(band.bodyH * 0.48) : band.textSize);
    const natural = band.measure(line.text, font);
    // the note carries the "build non testée" caveat: never clip it
    const note = line.note ? band.measure(line.note, band.fontText(Math.max(11, Math.round(10 * band.s)))) + 12 * band.s : 0;
    const w = Math.max(natural * (narrow ? 1.08 : 1.15) + 10 * band.s, note);
    const label = band.measure(line.character.toUpperCase(), band.fontLabel());
    const gap = Math.max(8 * band.s, 4 * band.ppf);
    const maxBefore = cx - gap - label - (narrow ? 8 : 24) - (narrow ? 0 : i * 5 * band.ppf);
    const beforePx = Math.max(10 * band.ppf, Math.min(w * 0.55, maxBefore));
    const before = Math.round(beforePx / band.ppf);
    line.start = PARK - before;
    line.dur = Math.max(Math.round(w / band.ppf), before + 8);
  });
  band.invalidate();
}

export function buildProject(dl, os) {
  id = 1;
  return {
    lines: [...sceneLines(), ...downloadLines(dl, os, { compact: true })],
    markers: sceneMarkers(),
    strokes: [],
  };
}
