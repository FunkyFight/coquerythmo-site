// Band display settings — the same options the app exposes in
// "Paramètres de la bande rythmo" / project settings, plus the page's
// motion preference.

const KEY = 'coquerythmo-site-settings';
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

const state = {
  scrollSpeed: 1, // ×0.25 – ×4
  highlightWord: true, // « Illuminer en jaune le mot à la ligne de lecture »
  charColorText: false, // « Définir la couleur du texte à la couleur de l'étiquette de personnage »
  reduceMotion: mq.matches,
  ...load(),
};
if (mq.matches) state.reduceMotion = true;

const subs = new Set();

function apply() {
  document.documentElement.classList.toggle('reduce-motion', !!state.reduceMotion);
}
apply();

export const settings = {
  get: () => state,
  set(patch) {
    Object.assign(state, patch);
    try {
      const { scrollSpeed, highlightWord, charColorText, reduceMotion } = state;
      localStorage.setItem(KEY, JSON.stringify({ scrollSpeed, highlightWord, charColorText, reduceMotion }));
    } catch {
      /* private mode: settings live for this visit only */
    }
    apply();
    subs.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

mq.addEventListener?.('change', (e) => settings.set({ reduceMotion: e.matches }));
