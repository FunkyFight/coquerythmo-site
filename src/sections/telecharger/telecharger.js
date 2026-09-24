import { Band } from '../../band/engine.js';
import { downloadLines, layoutDownloads, PARK } from '../../band/demo.js';
import { FALLBACK, formatDate, formatSize } from '../../lib/downloads.js';

function project(dl, os) {
  return { lines: downloadLines(dl, os), markers: [], strokes: [] };
}

function fillList(dl) {
  const list = document.querySelector('[data-dl-list]');
  if (!list) return;
  const set = (item, f, value, attr) => {
    item.querySelectorAll(`[data-f="${f}"]`).forEach((el) => {
      if (attr) el.setAttribute(attr, value);
      else el.textContent = value;
    });
  };
  const win = list.querySelector('[data-os="windows"]');
  set(win, 'version', dl.windows.version);
  set(win, 'date', formatDate(dl.windows.date));
  if (dl.windows.installer) {
    set(win, 'installer', dl.windows.installer.url, 'href');
    set(win, 'installer-size', formatSize(dl.windows.installer.size));
  }
  if (dl.windows.portable) {
    set(win, 'portable', dl.windows.portable.url, 'href');
    set(win, 'portable-size', formatSize(dl.windows.portable.size));
  }
  const mac = list.querySelector('[data-os="macos"]');
  set(mac, 'version', dl.macos.version);
  set(mac, 'date', formatDate(dl.macos.date));
  set(mac, 'app', dl.macos.app.url, 'href');
  set(mac, 'app-size', formatSize(dl.macos.app.size));
  const lin = list.querySelector('[data-os="linux"]');
  set(lin, 'version', dl.linux.version);
  set(lin, 'date', formatDate(dl.linux.date));
  set(lin, 'portable', dl.linux.portable.url, 'href');
  set(lin, 'portable-size', formatSize(dl.linux.portable.size));
  document.querySelectorAll('[data-release-count]').forEach((el) => {
    el.textContent = String(dl.releaseCount);
  });
}

export function init(ctx) {
  const host = document.getElementById('final-band');
  if (!host) return;
  const os = ctx.os;
  // visitor's platform first in the list as well
  const list = document.querySelector('[data-dl-list]');
  const mine = list?.querySelector(`[data-os="${os}"]`);
  if (mine && mine !== list.firstElementChild) list.prepend(mine);
  mine?.setAttribute('data-mine', '');

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
    hitsFocusable: false,
  });
  band.on('resize', () => layoutDownloads(band));
  layoutDownloads(band);
  ctx.downloads.then((dl) => {
    band.setProject(project(dl, os));
    layoutDownloads(band);
    band.setFrame(PARK);
    fillList(dl);
  });
}
