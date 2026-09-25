import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/archivo/wdth-italic.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/chrome.css';
import './styles/layout.css';
import './styles/window.css';

import './workspaces/enregistrement/enregistrement.css';
import './workspaces/voicelines/voicelines.css';
import './workspaces/comicdubs/comicdubs.css';
import './sections/anatomie/anatomie.css';
import './sections/detection/detection.css';
import './sections/karaoke/karaoke.css';
import './sections/projets/projets.css';
import './sections/export/export.css';
import './sections/ensemble/ensemble.css';
import './sections/accessibilite/accessibilite.css';
import './sections/tutoriels/tutoriels.css';
import './sections/telecharger/telecharger.css';

import { Band, FPS } from './band/engine.js';
import { settings } from './lib/settings.js';
import { announce, onAnnounce, announceLog } from './lib/announce.js';
import { getDownloads, detectOS } from './lib/downloads.js';
import { initMenus, initTabs, initTooltips, initSettings, initWelcome, initStrips, initToolbars, initMore, makeDropdown } from './window/ui.js';
import { initHero, timecode } from './window/hero.js';

import * as enregistrement from './workspaces/enregistrement/enregistrement.js';
import * as voicelines from './workspaces/voicelines/voicelines.js';
import * as comicdubs from './workspaces/comicdubs/comicdubs.js';
import * as anatomie from './sections/anatomie/anatomie.js';
import * as detection from './sections/detection/detection.js';
import * as karaoke from './sections/karaoke/karaoke.js';
import * as projets from './sections/projets/projets.js';
import * as exportSection from './sections/export/export.js';
import * as ensemble from './sections/ensemble/ensemble.js';
import * as accessibilite from './sections/accessibilite/accessibilite.js';
import * as tutoriels from './sections/tutoriels/tutoriels.js';
import * as telecharger from './sections/telecharger/telecharger.js';

initMenus();
const tabs = initTabs();
const tooltips = initTooltips();
initSettings();
const hero = initHero({ tabs });

/** Context handed to every section and workspace module. */
const ctx = {
  Band,
  FPS,
  band: hero.band, // the demo band in the window
  os: detectOS(),
  settings,
  announce,
  onAnnounce,
  announceLog,
  downloads: getDownloads(),
  tabs, // { select(name), current(), onChange(fn) } — names: rythmo, recording, voicelines, comicdubs
  tooltips,
  makeDropdown,
  timecode,
};

for (const [name, mod] of Object.entries({
  enregistrement,
  voicelines,
  comicdubs,
  anatomie,
  detection,
  karaoke,
  projets,
  exportSection,
  ensemble,
  accessibilite,
  tutoriels,
  telecharger,
})) {
  try {
    mod.init?.(ctx);
  } catch (err) {
    console.error(`[coquerythmo] ${name} failed to start`, err);
  }
}

initToolbars();
initStrips();
initMore();
initWelcome(tabs);

// Sections grow after init (bands, panels): land on the requested anchor again.
if (location.hash.length > 1) {
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) document.fonts.ready.then(() => requestAnimationFrame(() => target.scrollIntoView()));
}
