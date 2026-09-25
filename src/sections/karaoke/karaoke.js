// Karaoké (#karaoke, boucle 3): a short sung scene on a small band. A line
// switched to karaoke (Numpad 9 in the app, per line) stops scrolling during
// playback: it waits centred on the band, the character's colour wipes it
// syllable by syllable and a dot bounces on each. Paused, it is a plain line
// again, as in the app's editor (karaoke_preview = playing). The rendering is
// engine.js drawKaraoke. Paused, the red syllable ticks drag like the app's
// (engine.js moveBoundary), or move from the keyboard.

const CAST = { MAYA: '#ff8033', 'THÉO': '#33cccc', JADE: '#cc4dff' };
const START = 0;
const END = 384;

/** One spoken cue, then a fictional duet. Each sung line's count-in starts
 *  while the previous one ends, on the other track. */
function scene() {
  const L = (o) => ({ kind: 'dialogue', note: '', karaoke: false, color: CAST[o.character], ...o });
  return [
    L({ id: 1, track: 0, start: 12, dur: 30, character: 'MAYA', text: 'Chut, ça commence !' }),
    L({ id: 2, track: 0, start: 126, dur: 80, character: 'THÉO', text: 'Sous les néons je t’attendais', karaoke: true }),
    L({ id: 3, track: 1, start: 214, dur: 80, character: 'JADE', text: 'Tu chantais faux, je t’entendais', karaoke: true }),
    L({ id: 4, track: 0, start: 302, dur: 64, character: 'THÉO', text: 'Et pourtant je reste là', karaoke: true }),
  ];
}

export function init(ctx) {
  const root = document.getElementById('karaoke');
  const host = root?.querySelector('[data-kar="band"]');
  if (!host || !ctx.Band) return;
  const $ = (name) => root.querySelector(`[data-kar="${name}"]`);
  // the engine's own scale, shrunk on narrow bands so the longest sung line
  // and its label fit, since karaoke text keeps its natural width
  const fit = (width) => Math.min(Math.max(width / 1150, 0.8), 1.3, width / 600);

  const band = new ctx.Band(host, {
    project: { lines: scene(), markers: [], strokes: [] },
    tracks: 2,
    scale: fit(host.getBoundingClientRect().width || 1100),
    startFrame: START,
    stopAt: END,
    editable: false,
    karaokeWhilePlaying: true,
    label: 'Bande rythmo de démonstration, scène chantée',
    settings: ctx.settings,
    announce: ctx.announce,
  });

  band.on('resize', ({ width }) => {
    const s = fit(width);
    if (Math.abs(s - band.s) > 0.01) {
      band.opts.scale = s;
      band.layout();
    }
  });

  /* ── toolbar: play, karaoke switch (Numpad 9), timecode ── */
  const playBtn = $('play');
  const playIcon = $('play-icon');
  const tc = $('tc');
  const syncPlay = () => {
    const label = band.playing ? 'Pause' : 'Lecture';
    playBtn.setAttribute('aria-pressed', String(band.playing));
    playBtn.setAttribute('aria-label', label);
    playBtn.dataset.tip = label;
    playIcon.style.setProperty('--src', `url(/icons/${band.playing ? 'pause' : 'resume'}.svg)`);
  };
  band.on('play', syncPlay);
  band.on('pause', syncPlay);
  band.on('frame', (f) => {
    tc.textContent = ctx.timecode(f);
  });
  tc.textContent = ctx.timecode(band.frame);
  playBtn.addEventListener('click', () => band.toggle());
  $('toggle').addEventListener('click', () => band.toggleKaraoke());
  root.querySelector('.kar-bench').addEventListener('keydown', (e) => {
    if (e.code !== 'Numpad9' || e.ctrlKey || e.altKey || e.target.closest('input')) return;
    e.preventDefault();
    band.toggleKaraoke();
  });

  /* ── play the scene once when it first comes into view; pause off screen ── */
  let played = false;
  new IntersectionObserver(
    (entries) => {
      const seen = entries[entries.length - 1].isIntersecting;
      if (!seen) band.pause();
      else if (!played && !ctx.settings.get().reduceMotion) {
        played = true;
        band.play();
      }
    },
    { threshold: 0.6 },
  ).observe(host);
}
