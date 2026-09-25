// Tutoriels et nouveautés (boucle 7).
// The player shows the readme's tutorials. Privacy first: only the thumbnail
// loads with the page; the youtube-nocookie embed is created on click. The
// Nouveautés window mirrors src/ui/whats_new_modal.rs: its version and date
// are read live from the releases the in-app updater checks (src/update.rs),
// and a newer release's notes go through the same markdown-ish cleanup.

const NOTES_VERSION = '5.1.0'; // the notes written in tutoriels.html (VERSION_NOTES.md)
const LOAD_TIMEOUT = 12000; // no 'load' at all: the request hangs
const READY_TIMEOUT = 6000; // 'load' but no player answer: a blocked or error page

const YT = 'https://www.youtube-nocookie.com';
const thumbUrl = (id, q) => `https://img.youtube.com/vi/${id}/${q}.jpg`;
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
const embedUrl = (id) =>
  `${YT}/embed/${id}?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;

/** Release dates are UTC days (published_at sliced); keep them that day in
 *  every timezone. (downloads.js formatDate shifts them west of UTC.) */
const formatDay = (iso) => {
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
};

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

/* ───────────── Release notes (port of whats_new_modal.rs) ───────────── */

/** cleanup_markdown_line: headings (#), bullets (- * 1.), no ** __ ` */
function cleanLine(raw) {
  let line = raw.trim();
  if (!line || /^[-*_]+$/.test(line)) return null;
  let kind = 'text';
  if (line.startsWith('#')) {
    kind = 'heading';
    line = line.replace(/^#+/, '').trimStart();
  } else if (line.startsWith('- ') || line.startsWith('* ')) {
    kind = 'bullet';
    line = line.slice(2);
  } else {
    const m = line.match(/^\d{1,3}\. (.*)$/);
    if (m) {
      kind = 'bullet';
      line = m[1];
    }
  }
  const text = line.replaceAll('**', '').replaceAll('__', '').replaceAll('`', '').trim();
  return text ? { kind, text } : null;
}

/** format_release_notes, minus the fixed-width wrapping (CSS wraps). */
export function formatReleaseNotes(body) {
  const lines = [];
  let blank = false;
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = cleanLine(raw);
    if (!line) {
      if (!blank && lines.length) lines.push({ kind: 'blank', text: '' });
      blank = true;
      continue;
    }
    lines.push(line);
    blank = false;
  }
  while (lines.at(-1)?.kind === 'blank') lines.pop();
  return lines;
}

/** youtube_video_id: youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID */
function youtubeId(url) {
  const m = url.trim().match(/^https?:\/\/([^/]+)\/(.*)$/);
  if (!m) return null;
  const host = m[1].replace(/^www\./, '');
  const rest = m[2];
  let id;
  if (host === 'youtu.be') id = rest.split(/[?#]/)[0];
  else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const q = rest.indexOf('?');
    if (q >= 0) {
      id = rest
        .slice(q + 1)
        .split('&')
        .find((p) => p.startsWith('v='))
        ?.slice(2);
    } else {
      const path = rest.startsWith('embed/') ? rest.slice(6) : rest.startsWith('shorts/') ? rest.slice(7) : null;
      id = path?.split(/[?#]/)[0];
    }
  } else return null;
  id = (id || '').trim();
  return /^[\w-]{6,32}$/.test(id) ? id : null;
}

/** extract_youtube_attachment: a release body may carry <<<[url]>>>, which
 *  becomes the "Vidéo de présentation" thumbnail and leaves the text. */
export function extractAttachment(body) {
  const start = body.indexOf('<<<[');
  const end = start < 0 ? -1 : body.indexOf(']>>>', start + 4);
  const id = end < 0 ? null : youtubeId(body.slice(start + 4, end));
  if (!id) return { body, videoId: null };
  return { body: body.slice(0, start) + body.slice(end + 4), videoId: id };
}

function presentationVideo(id, ctx) {
  const box = document.createElement('div');
  box.className = 'wn__video';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'wn__video-btn';
  const img = document.createElement('img');
  img.alt = '';
  img.width = 1280;
  img.height = 720;
  img.decoding = 'async';
  img.crossOrigin = 'anonymous'; // no cookies sent to YouTube for a thumbnail
  img.referrerPolicy = 'no-referrer';
  setThumb(img, id);
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.style.setProperty('--src', 'url(/icons/resume.svg)');
  const cue = document.createElement('span'); // visible in loading/failed only
  cue.className = 'wn__video-cue';
  cue.setAttribute('aria-hidden', 'true');
  btn.append(img, icon, cue);
  box.append(btn);

  // same states as the tutorial player: idle → loading → (player) | failed
  const setState = (state) => {
    box.dataset.state = state;
    const label = {
      idle: ['Lire la vidéo de présentation', ''],
      loading: ['Chargement de la vidéo de présentation', 'Chargement…'],
      failed: ['Ouvrir sur YouTube : vidéo de présentation', 'Ouvrir sur YouTube'],
    }[state];
    btn.setAttribute('aria-label', label[0]);
    btn.setAttribute('aria-disabled', String(state === 'loading'));
    btn.dataset.tip = label[0];
    cue.textContent = label[1];
  };
  setState('idle');

  let embed = null;
  btn.addEventListener('click', () => {
    // the app opens this video in the browser; here it plays in place, and
    // falls back to YouTube when the player does not answer
    if (box.dataset.state === 'failed') {
      window.open(watchUrl(id), '_blank', 'noopener');
      return;
    }
    if (embed) return;
    setState('loading');
    embed = mountEmbed(box, id, 'Vidéo de présentation', {
      onReady: (frame) => {
        btn.hidden = true;
        frame.focus();
        ctx.announce('Lecture de la vidéo de présentation depuis YouTube.');
      },
      onFail: () => {
        embed = null;
        setState('failed');
        ctx.announce('La vidéo ne se charge pas ici. Activez le bouton pour l’ouvrir sur YouTube.');
      },
    });
  });
  return box;
}

export function renderNotes(el, raw, ctx) {
  const { body, videoId } = extractAttachment(raw || '');
  const lines = formatReleaseNotes(body);
  const frag = document.createDocumentFragment();
  if (videoId) frag.append(presentationVideo(videoId, ctx));
  if (!lines.length) lines.push({ kind: 'text', text: 'Aucune description de release n’est disponible.' });
  let list = null;
  for (const line of lines) {
    if (line.kind === 'bullet') {
      if (!list) {
        list = document.createElement('ul');
        list.className = 'wn__list';
        list.setAttribute('role', 'list');
        frag.append(list);
      }
      const li = document.createElement('li');
      li.textContent = line.text;
      list.append(li);
      continue;
    }
    list = null;
    if (line.kind === 'blank') continue;
    const node = document.createElement(line.kind === 'heading' ? 'h4' : 'p');
    node.className = line.kind === 'heading' ? 'wn__h' : 'wn__p';
    node.textContent = line.text;
    frag.append(node);
  }
  el.replaceChildren(frag);
}

/* ───────────── Nouveautés window ───────────── */
function initWhatsNew(root, ctx) {
  const versionEl = root.querySelector('[data-wn-version]');
  const dateEl = root.querySelector('[data-wn-date]');
  const well = root.querySelector('[data-wn-well]');
  const notes = root.querySelector('[data-wn-notes]');
  const hint = root.querySelector('[data-wn-hint]');
  const sourceEl = document.querySelector('#tutoriels [data-wn-source]');
  const otherEl = document.querySelector('#tutoriels [data-wn-other]');

  // "Molette pour lire la suite", as in the app: while there is more below
  const syncHint = () => {
    const more = well.scrollHeight - well.clientHeight - well.scrollTop > 4;
    hint.hidden = !more;
    well.toggleAttribute('data-more', more);
  };
  well.addEventListener('scroll', syncHint, { passive: true });
  const ro = new ResizeObserver(syncHint);
  ro.observe(well); // the window resizes
  ro.observe(notes); // the text reflows (font load, live notes)
  syncHint();

  ctx.downloads.then((dl) => {
    const win = dl?.windows;
    if (!win?.version) return;
    versionEl.textContent = win.version;
    if (win.date) {
      dateEl.dateTime = win.date;
      dateEl.textContent = formatDay(win.date);
    }
    well.setAttribute('aria-label', `Notes de la version ${win.version} pour Windows`);
    // a release newer than the notes on the page: show its own description
    if (win.version !== NOTES_VERSION) {
      renderNotes(notes, win.notes, ctx);
      well.scrollTop = 0;
      syncHint();
      sourceEl.textContent = `Ci-dessus, la description de la ${win.version} telle que l’application l’affiche.`;
    }
    otherOs(dl, win.version);
  });

  // The window and the updater's offer are Windows facts for now: macOS and
  // Linux stopped at an older build (PRODUCT.md). Say so to those visitors.
  function otherOs(dl, winVersion) {
    if (ctx.os === 'windows') return;
    const behind = [
      ['macOS', dl.macos?.version],
      ['Linux', dl.linux?.version],
    ].filter(([, v]) => v && v !== winVersion);
    if (!behind.length) return;
    const [[os1, v1], [os2, v2] = []] = behind;
    let text;
    if (!os2) text = `Sur ${os1}, la dernière version publiée est la ${v1}, non testée : la ${winVersion} n’y est pas publiée.`;
    else if (v1 === v2)
      text = `Sur macOS et Linux, la dernière version publiée est la ${v1}, non testée. La ${winVersion} n’existe que pour Windows.`;
    else
      text = `Sur macOS, la dernière version publiée est la ${v1}, et sur Linux la ${v2}, toutes deux non testées. La ${winVersion} n’existe que pour Windows.`;
    otherEl.textContent = text;
    otherEl.hidden = false;
  }
}

export function init(ctx) {
  const player = document.querySelector('#tutoriels [data-player]');
  const whatsNew = document.getElementById('nouveautes');
  if (player) initPlayer(player, ctx);
  if (whatsNew) initWhatsNew(whatsNew, ctx);
}
