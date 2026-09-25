import { Band } from '../../band/engine.js';
import { downloadLines, layoutDownloads, PARK } from '../../band/demo.js';
import { FALLBACK } from '../../lib/downloads.js';

function project(dl, os) {
  return { lines: downloadLines(dl, os), markers: [], strokes: [] };
}

function fillCount(dl) {
  document.querySelectorAll('[data-release-count]').forEach((el) => {
    el.textContent = String(dl.releaseCount);
  });
}

export function init(ctx) {
  const host = document.getElementById('final-band');
  if (!host) return;
  const os = ctx.os;

  const band = new Band(host, {
    project: project(FALLBACK, os),
    tracks: 4,
    startFrame: PARK,
    stopAt: PARK,
    label: 'Bande rythmo de téléchargement',
    scale: Math.min(1.3, Math.max(0.8, host.clientWidth / 950)),
    settings: ctx.settings,
    announce: ctx.announce,
    editable: false,
  });
  band.on('resize', () => layoutDownloads(band));
  layoutDownloads(band);
  ctx.downloads.then((dl) => {
    band.setProject(project(dl, os));
    layoutDownloads(band);
    band.setFrame(PARK);
    fillCount(dl);
  });
}
