// Tutoriels (boucle 8).
// The player shows the readme's tutorials. Privacy first: only the thumbnail
// loads with the page; the youtube-nocookie embed is created on click.

const LOAD_TIMEOUT = 12000; // no 'load' at all: the request hangs
const READY_TIMEOUT = 6000; // 'load' but no player answer: a blocked or error page

const YT = 'https://www.youtube-nocookie.com';
const thumbUrl = (id, q) => `https://img.youtube.com/vi/${id}/${q}.jpg`;
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
const embedUrl = (id) =>
  `${YT}/embed/${id}?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;

/** maxresdefault, then hqdefault when the video has no HD thumbnail (YouTube
 *  answers 404, sometimes with a 120px grey placeholder). */
function setThumb(img, id) {
  const hq = thumbUrl(id, 'hqdefault');
  const fallback = () => {
    if (img.src !== hq) img.src = hq;
  };
  img.onerror = fallback;
  img.onload = () => {
    if (img.naturalWidth <= 120) fallback();
  };
  const max = thumbUrl(id, 'maxresdefault');
  if (img.src !== max) img.src = max;
  else if (img.complete && img.naturalWidth <= 120) fallback();
}

/** Put a youtube-nocookie player (autoplay) in `host`, driven through the
 *  IFrame API's postMessage protocol (no API script is loaded). A frame's
 *  'load' proves nothing: a blocked request loads the browser's error page.
 *  Only the player's own messages count as ready. Returns
 *  { unmount, command(func) }; onState gets YouTube's playerState
 *  (-1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued). */
function mountEmbed(host, id, title, { onReady, onFail, onState }) {
  const frame = document.createElement('iframe');
  frame.src = embedUrl(id);
  frame.title = `${title}, lecteur YouTube`;
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';

  let ready = false;
  let poll = 0;
  let timer = setTimeout(() => fail(), LOAD_TIMEOUT);
  const send = (msg) => frame.contentWindow?.postMessage(JSON.stringify({ ...msg, id: 1, channel: 'widget' }), YT);
  const unmount = () => {
    clearTimeout(timer);
    clearInterval(poll);
    window.removeEventListener('message', onMessage);
    frame.remove();
  };
  function fail() {
    unmount();
    onFail?.();
  }
  function onMessage(e) {
    if (e.source !== frame.contentWindow || e.origin !== YT) return;
    let data;
    try {
      data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }
    if (!data?.event) return;
    clearInterval(poll); // it heard us
    // 2 bad id, 5 HTML5, 100 removed, 101/150 no embedding, 153 no referrer
    if (data.event === 'onError') return fail();
    if (!ready && (data.event === 'onReady' || data.event === 'infoDelivery')) {
      ready = true;
      clearTimeout(timer);
      onReady?.(frame);
    }
    const state = data.event === 'onStateChange' ? data.info : data.info?.playerState;
    if (ready && typeof state === 'number') onState?.(state);
  }

  window.addEventListener('message', onMessage);
  frame.addEventListener(
    'load',
    () => {
      clearTimeout(timer);
      timer = setTimeout(fail, READY_TIMEOUT);
      // the API script says 'listening' until the player answers
      send({ event: 'listening' });
      poll = setInterval(() => send({ event: 'listening' }), 250);
    },
    { once: true },
  );
  host.append(frame);
  return { unmount, command: (func) => send({ event: 'command', func, args: [] }) };
}

/* ───────────── Tutorial player ───────────── */
function initPlayer(root, ctx) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const list = root.querySelector('[data-list]');
  const stage = root.querySelector('[data-stage]');
  const poster = root.querySelector('[data-poster]');
  const img = poster.querySelector('[data-thumb]');
  const cue = poster.querySelector('[data-cue]');
  const playBtn = root.querySelector('[data-play]');
  const playIcon = playBtn.querySelector('[data-play-icon]');
  const openLink = root.querySelector('[data-open]');
  const indexEl = root.querySelector('[data-index]');
  const statusEl = root.querySelector('[data-status]');
  const failEl = root.querySelector('[data-fail]');
  const videos = tabs.map((t) => ({ id: t.dataset.yt, title: t.querySelector('[data-title]').textContent.trim() }));

  let current = 0;
  let embed = null; // { unmount, command } while a player is mounted
  let running = false; // the player's own state: playing or buffering

  // idle → loading → ready (the player answered); failed when it never does
  const setState = (state) => {
    stage.dataset.state = state;
    const title = videos[current].title;
    poster.setAttribute(
      'aria-label',
      state === 'loading'
        ? `Chargement de « ${title} »`
        : state === 'failed'
          ? `Réessayer : « ${title} »`
          : `Lire la vidéo « ${title} »`,
    );
    poster.setAttribute('aria-disabled', String(state === 'loading'));
    cue.textContent = state === 'loading' ? 'Chargement…' : state === 'failed' ? 'Réessayer' : 'Lire la vidéo';
    failEl.hidden = state !== 'failed';
    statusEl.textContent = state === 'failed' ? 'Échec du chargement' : title;
    if (state !== 'ready') running = false;
    syncPlay();
  };

  // the toolbar toggle mirrors the player: pause while it runs, play otherwise
  function syncPlay() {
    const label = running ? 'Mettre en pause' : 'Lire la vidéo';
    playBtn.setAttribute('aria-label', label);
    playBtn.dataset.tip = label;
    playBtn.toggleAttribute('data-on', running);
    playBtn.setAttribute('aria-disabled', String(stage.dataset.state === 'loading'));
    playIcon.style.setProperty('--src', `url(/icons/${running ? 'pause' : 'resume'}.svg)`);
  }

  const stop = () => {
    embed?.unmount();
    embed = null;
    poster.hidden = false;
    setState('idle');
  };

  const play = () => {
    if (embed) return;
    const v = videos[current];
    const fromPoster = document.activeElement === poster;
    setState('loading');
    embed = mountEmbed(stage, v.id, v.title, {
      onReady: (frame) => {
        poster.hidden = true;
        setState('ready');
        // the poster had focus and is gone: hand it to the player
        if (fromPoster) frame.focus();
        ctx.announce(`Lecture de « ${v.title} » depuis YouTube.`);
      },
      onState: (s) => {
        running = s === 1 || s === 3;
        syncPlay();
      },
      onFail: () => {
        embed = null;
        poster.hidden = false;
        setState('failed');
        ctx.announce('La vidéo ne se charge pas ici. Réessayez, ou ouvrez-la sur YouTube.');
      },
    });
  };

  const select = (i, { focus = false, announce = false } = {}) => {
    const n = videos.length;
    const next = (i + n) % n;
    if (focus) tabs[next].focus();
    if (next === current) return;
    current = next;
    const v = videos[current];
    if (embed) stop();
    tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === current)));
    stage.setAttribute('aria-labelledby', tabs[current].id);
    setThumb(img, v.id);
    openLink.href = watchUrl(v.id);
    openLink.setAttribute('aria-label', `Ouvrir sur YouTube : ${v.title}`);
    indexEl.textContent = `${current + 1} / ${n}`;
    setState('idle');
    if (announce) ctx.announce(`${v.title}, vidéo ${current + 1} sur ${n}.`);
  };

  tabs.forEach((t, k) => t.addEventListener('click', () => select(k)));
  list.addEventListener('keydown', (e) => {
    // the list sits under the player: Entrée/Espace on the selected video
    // plays it without walking back up to the toolbar
    if ((e.key === 'Enter' || e.key === ' ') && e.target === tabs[current]) {
      e.preventDefault();
      if (!embed) play();
      return;
    }
    const moves = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let to = null;
    if (e.key in moves) to = current + moves[e.key];
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = videos.length - 1;
    if (to === null) return;
    e.preventDefault();
    select(to, { focus: true });
  });

  poster.addEventListener('click', play);
  playBtn.addEventListener('click', () => {
    const state = stage.dataset.state;
    if (state === 'loading') return;
    if (state !== 'ready') return play();
    // a real pause: the player keeps its position
    running = !running;
    embed.command(running ? 'playVideo' : 'pauseVideo');
    syncPlay();
    ctx.announce(running ? 'Lecture.' : 'Vidéo en pause.');
  });
  root.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => select(current + Number(b.dataset.step), { announce: true })),
  );

  setThumb(img, videos[0].id);
  setState('idle');
}

export function init(ctx) {
  const player = document.querySelector('#tutoriels [data-player]');
  if (player) initPlayer(player, ctx);
}
