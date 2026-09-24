// Bande rythmo ensemble: a simulated session built from the app's panels.
// The DA's band is a real instrument. Léa's band gets the DA's transport,
// selection and edits through a fake network with adjustable latency, and
// extrapolates the reading position like ReceivedState::frame
// (src/network/replication.rs). The project transfer replays the 5.1 notes:
// sent once, downloaded by each participant at their own pace, resumable.
// Below it, #serveur previews a self-hosted server as the server browser shows it.

import { visemeFor } from '../../band/text.js';

const CODE = 'K7Q2MX'; // server/src/room.js: 6 characters, A–Z 0–9
const SERVER = 'collaboration.exemple.fr'; // the app's own placeholder host
const PORT = 9050;
const PROJECT_FILE = 'demo_episode_12.coquerythmo';
const PROJECT_ID = 'demo-episode-12-7f3a91c4';
const START = -8;
const END = 300;
const NBSP = String.fromCharCode(160); // no-break space before %

/* ───────────── Demo scene (fictional dialogue, brush-preset colours) ───────────── */
const CAST = { 'ZOÉ': '#cc4dff', MARCO: '#4d80ff' };

function sceneProject() {
  let id = 1;
  const L = (o) => ({ id: id++, kind: 'dialogue', note: '', karaoke: false, color: CAST[o.character], ...o });
  return {
    lines: [
      L({ track: 0, start: 10, dur: 44, character: 'ZOÉ', text: 'Tu m’entends bien, là ?' }),
      L({ track: 1, start: 58, dur: 40, character: 'MARCO', text: 'Cinq sur cinq. On la fait ?' }),
      L({ track: 0, start: 102, dur: 8, character: 'ZOÉ', text: '↑', kind: 'breath' }),
      L({ track: 0, start: 114, dur: 52, character: 'ZOÉ', text: 'Attends, je recale mon micro.' }),
      L({ track: 1, start: 150, dur: 14, character: 'MARCO', text: '(pff)' }),
      L({ track: 1, start: 178, dur: 54, character: 'MARCO', text: 'La bande n’attend personne !' }),
      L({ track: 0, start: 238, dur: 46, character: 'ZOÉ', text: 'D’accord, d’accord. On y va.' }),
    ],
    markers: [
      { kind: 'boucle', frame: 4 },
      { kind: 'boucle', frame: 172 },
      { kind: 'out', frame: 292 },
    ],
    strokes: [],
  };
}

// What travels over the wire is a copy, never the DA's live objects.
const cloneProject = (p) => ({
  lines: p.lines.map(({ _syll, ...line }) => ({ ...line })),
  markers: p.markers.map((m) => ({ ...m })),
  strokes: [],
});
const EMPTY = () => ({ lines: [], markers: [], strokes: [] });

/* ───────────── Project transfer script (seconds) ─────────────
   UPLOAD is the DA's single upload to the server; every other time counts
   from the moment the project is available. Each participant has their own
   pace; Samir's connection drops and the download resumes where it stopped;
   Jade saves her local changes first; Tom arrives after the upload. */
const UPLOAD = 2.2;
const LOAD = 0.8; // « Chargement » once the archive is down
const PEOPLE = {
  lea: { name: 'Léa', accept: 0.4, dur: 2.6 },
  samir: { name: 'Samir', accept: 0.8, dur: 5, cutAt: 0.4, cutFor: 2.2 },
  jade: { name: 'Jade', saving: 0.5, accept: 2, dur: 4 },
  tom: { name: 'Tom', join: 3.4, accept: 3.9, dur: 3 },
};
// floor: a download reads 100 % only once it is complete
const pct = (x) => `${Math.floor(x * 100 + 1e-6)}${NBSP}%`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function personAt(p, t) {
  const joinNote = p.join != null ? 'Arrivé après l’envoi : le projet l’attendait sur le serveur.' : '';
  if (p.join != null && t < p.join) return { phase: 'away', label: 'Pas encore arrivé', progress: 0, note: '' };
  if (t < p.accept) {
    if (p.saving != null && t >= p.saving) {
      return { phase: 'saving', label: 'Sauvegarde locale', progress: 0, note: 'Sauvegarde d’abord ses changements locaux.' };
    }
    return { phase: 'waiting', label: 'En attente', progress: 0, note: joinNote };
  }
  let run = t - p.accept;
  let phase = 'receiving';
  let note = p.saving != null ? 'Changements locaux sauvegardés avant le remplacement.' : joinNote;
  if (p.cutAt != null) {
    const at = p.cutAt * p.dur;
    if (run >= at + p.cutFor) {
      run -= p.cutFor;
      note = `Reconnecté : reprise à ${pct(p.cutAt)}, pas depuis zéro.`;
    } else if (run >= at) {
      run = at;
      phase = 'cut';
      note = 'Connexion coupée : le téléchargement attend, rien n’est perdu.';
    }
  }
  const progress = Math.min(1, run / p.dur);
  if (progress < 1) return { phase, label: `Réception - ${pct(progress)}`, progress, note };
  if (run - p.dur < LOAD) return { phase: 'loading', label: 'Chargement', progress: 1, note };
  return { phase: 'loaded', label: 'Chargé', progress: 1, note };
}

/* ───────────── Invitation link (src/protocol.rs, ProtocolPayload::join) ───────────── */
const b64url = (s) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function inviteLink(mode) {
  // serde field order: k, s, c, p, then m / i / f for join_with_project
  const payload = { k: 'j', s: `${SERVER}:${PORT}`, c: CODE, p: '' };
  if (mode !== 'none') Object.assign(payload, { m: mode, i: PROJECT_ID, f: PROJECT_FILE });
  return `coquerythmo://link/${b64url(JSON.stringify(payload))}`;
}

export function init(ctx) {
  const section = document.getElementById('ensemble');
  const sim = section?.querySelector('[data-ens-sim]');
  if (!sim) return;
  const FPS = ctx.FPS;

  /* ── toast (toast.rs: bottom centre, 4 s). The app speaks toasts on its
     priority channel; on the page the simulation runs on its own, so it only
     speaks, politely, to a visitor who is working inside it. ── */
  const toastEl = sim.querySelector('[data-ens-toast]');
  let toastTimer = 0;
  const toast = (text) => {
    toastEl.textContent = text;
    toastEl.removeAttribute('data-show');
    void toastEl.offsetWidth; // restart the fade when toasts follow each other
    toastEl.setAttribute('data-show', '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.removeAttribute('data-show'), 4000);
    if (sim.contains(document.activeElement)) ctx.announce(text);
  };

  /* ── invitation panel ── */
  const linkEl = sim.querySelector('[data-ens-link]');
  const modeBoxes = [...sim.querySelectorAll('[data-ens-mode]')];
  let mode = 'none';
  linkEl.textContent = inviteLink(mode);
  modeBoxes.forEach((cb) =>
    cb.addEventListener('change', () => {
      // the two options are mutually exclusive (invitation_modal.rs)
      if (cb.checked) modeBoxes.forEach((o) => o !== cb && (o.checked = false));
      mode = cb.checked ? cb.dataset.ensMode : 'none';
      linkEl.textContent = inviteLink(mode);
      ctx.announce(`${cb.parentElement.textContent.trim()} : ${cb.checked ? 'activé' : 'désactivé'}`);
    }),
  );
  const copy = async (text, done) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast('Le navigateur a refusé la copie. Sélectionnez le texte à la main.');
    }
  };
  sim.querySelector('[data-ens-copy="link"]').addEventListener('click', () =>
    copy(linkEl.textContent, 'Lien coquerythmo:// copié dans le presse-papiers.'),
  );
  sim.querySelector('[data-ens-copy="code"]').addEventListener('click', () =>
    copy(CODE, 'Code du salon copié dans le presse-papiers.'),
  );

  /* ── the two bands ── */
  const [daScreen, actorScreen] = sim.querySelectorAll('.ens-screen');
  const da = new ctx.Band(sim.querySelector('[data-ens-band="da"]'), {
    project: sceneProject(),
    tracks: 2,
    startFrame: START,
    stopAt: END,
    label: 'Bande rythmo du DA, simulation',
    settings: ctx.settings,
    announce: ctx.announce,
  });
  const actorHost = sim.querySelector('[data-ens-band="actor"]');
  const actor = new ctx.Band(actorHost, {
    project: EMPTY(),
    tracks: 2,
    startFrame: START,
    editable: false,
    settings: ctx.settings,
  });
  // engine.js reads the first IntersectionObserver entry only; when several
  // are queued it can keep a stale "hidden" state and stop drawing. Observers
  // run in creation order, so this one, created after, restores the newest.
  for (const band of [da, actor]) {
    new IntersectionObserver((entries) => {
      const visible = entries[entries.length - 1].isIntersecting;
      if (band.visible === visible) return;
      band.visible = visible;
      if (visible) band.invalidate();
    }).observe(band.host);
  }

  // Léa's band keeps the editor's drawing but is only an echo of the DA's.
  actorHost.tabIndex = -1;
  actorHost.setAttribute('role', 'img');
  actorHost.removeAttribute('aria-roledescription');
  actorHost.setAttribute('aria-label', 'Bande rythmo de Léa : elle reprend la position, la lecture et les modifications du DA');

  /* ── work copy per screen: burned timecode + lips, sampled like the window's ── */
  const face = (screen, band) => {
    const tc = screen.querySelector('[data-tc]');
    const mouth = screen.querySelector('[data-mouth]');
    let last = 'P_B_M';
    return (f) => {
      tc.textContent = ctx.timecode(f);
      const q = Math.floor(f / 2) * 2;
      const speaking = band.project.lines.find(
        (l) => l.kind === 'dialogue' && l.text.length > 2 && !l.text.startsWith('(') && q >= l.start && q < l.start + l.dur,
      );
      let v = 'P_B_M';
      if (speaking) {
        let i = Math.floor(((q - speaking.start) / speaking.dur) * speaking.text.length);
        while (i >= 0 && !visemeFor(speaking.text[i])) i--;
        v = (i >= 0 && visemeFor(speaking.text[i])) || 'P_B_M';
      }
      if (v !== last) {
        last = v;
        mouth.src = `/icons/detection/rhubarb_lips/${v}.png`;
      }
    };
  };
  const daFace = face(daScreen, da);
  const actorFace = face(actorScreen, actor);
  actor.on('frame', actorFace);

  /* ── fake network: DA → server → Léa ──
     Each channel keeps only its newest message, like the room's versioned
     state: a late packet never overwrites a fresher one. */
  let latency = 120;
  let compensate = true;
  let simVisible = false;
  const sentSeq = { transport: 0, state: 0, view: 0 };
  const gotSeq = { transport: 0, state: 0, view: 0 };
  const send = (channel, apply) => {
    const n = ++sentSeq[channel];
    const sentAt = performance.now();
    setTimeout(() => {
      if (n < gotSeq[channel]) return;
      gotSeq[channel] = n;
      apply(performance.now() - sentAt);
    }, latency * (0.85 + Math.random() * 0.3));
  };

  // Transport: sent on play/pause, on a jump, and every 0.5 s while playing
  // (replication.rs: drift > 2 frames when playing, any change when paused).
  let sent = null;
  let remote = { frame: START, playing: false, receivedAt: 0, age: 0 };
  const pushTransport = (force = false) => {
    const now = performance.now();
    const t = { frame: da.frame, playing: da.playing };
    if (sent && !force) {
      const elapsed = (now - sent.at) / 1000;
      const expected = sent.frame + (sent.playing ? elapsed * FPS : 0);
      const drift = Math.abs(t.frame - expected);
      const due = sent.playing !== t.playing || drift > (t.playing ? 2 : 0) || (t.playing && elapsed >= 0.5);
      if (!due) return;
    }
    sent = { ...t, at: now };
    send('transport', (age) => {
      remote = { ...t, receivedAt: performance.now(), age };
      wake();
    });
  };
  // ReceivedState::frame: transport frame + (transport age + time since receipt) × fps.
  // Without compensation the age is ignored and Léa trails by the latency.
  const remoteFrame = (now) => {
    if (!remote.playing) return remote.frame;
    const ms = (compensate ? remote.age : 0) + (now - remote.receivedAt);
    return Math.min(END, remote.frame + (ms / 1000) * FPS);
  };

  // State and view: edits, then the selection.
  let actorLoaded = false;
  let remoteSel = null;
  const applySelection = () => {
    actor.selection = new Set(actorLoaded && remoteSel != null ? [remoteSel] : []);
    actor.invalidate();
  };
  const pushView = () => {
    const id = da.selectedLine()?.id ?? null;
    send('view', () => {
      remoteSel = id;
      applySelection();
    });
  };
  da.on('select', pushView);
  da.on('change', () => {
    const snap = cloneProject(da.project);
    send('state', () => {
      if (!actorLoaded) return; // applied from the DA's latest state once loaded
      actor.setProject(snap);
      applySelection();
    });
    pushView();
  });

  /* ── Léa's screen follows ── */
  const gapWrap = actorScreen.querySelector('.ens-screen__gap');
  const gapEl = actorScreen.querySelector('[data-ens-gap]');
  let gapShown = '';
  const paintGap = (d) => {
    const n = Math.round(Math.abs(d));
    const text = `${n} image${n > 1 ? 's' : ''}`;
    if (text === gapShown) return;
    gapShown = text;
    gapEl.textContent = text;
    gapWrap.toggleAttribute('data-lag', n > 0);
  };
  let raf = 0;
  const tick = (now) => {
    raf = 0;
    const f = remoteFrame(now);
    if (f !== actor.frame) actor.setFrame(f);
    paintGap(da.frame - f);
    if (remote.playing || da.playing) wake();
  };
  function wake() {
    if (!raf && simVisible) raf = requestAnimationFrame(tick);
  }

  const actorCopy = actorScreen.querySelector('[data-actor-copy]');
  const actorEmpty = actorScreen.querySelector('[data-actor-empty]');
  const loadActor = () => {
    actorLoaded = true;
    actor.setProject(cloneProject(da.project));
    applySelection();
    actorCopy.hidden = false;
    actorEmpty.hidden = true;
    actorFace(actor.frame);
  };
  const unloadActor = () => {
    actorLoaded = false;
    actor.setProject(EMPTY());
    actorCopy.hidden = true;
    actorEmpty.hidden = false;
  };

  /* ── DA toolbar: play, frame steps, scrub, timecode ── */
  const tools = daScreen.querySelector('.ens-screen__tools');
  const playBtn = tools.querySelector('[data-ens-cmd="play"]');
  const playIcon = playBtn.querySelector('[data-play-icon]');
  const scrub = tools.querySelector('[data-ens-scrub]');
  const tcOut = tools.querySelector('[data-tc-out]');
  scrub.min = String(START);
  scrub.max = String(END);
  let scrubbing = false;
  const fill = (f) => scrub.style.setProperty('--fill', `${((f - START) / (END - START)) * 100}%`);
  const syncPlay = () => {
    const on = da.playing;
    playIcon.style.setProperty('--src', `url(/icons/${on ? 'pause' : 'resume'}.svg)`);
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
    playBtn.dataset.tip = on ? 'Pause' : 'Lecture';
    playBtn.setAttribute('aria-pressed', String(on));
  };
  const onDaFrame = (f) => {
    daFace(f);
    const tc = ctx.timecode(f);
    tcOut.textContent = tc.slice(3);
    if (!scrubbing) {
      scrub.value = String(Math.round(f));
      fill(f);
    }
    scrub.setAttribute('aria-valuetext', tc);
    pushTransport();
    wake();
  };
  da.on('frame', onDaFrame);
  da.on('play', () => {
    syncPlay();
    pushTransport(true);
    wake();
  });
  da.on('pause', () => {
    syncPlay();
    pushTransport(true);
  });
  tools.querySelectorAll('[data-ens-cmd]').forEach((b) =>
    b.addEventListener('click', () => {
      const cmd = b.dataset.ensCmd;
      if (cmd === 'play') da.toggle();
      else da.step(cmd === 'prev' ? -1 : 1);
    }),
  );
  scrub.addEventListener('input', () => {
    scrubbing = true;
    da.seek(Number(scrub.value));
    fill(Number(scrub.value));
  });
  scrub.addEventListener('change', () => {
    scrubbing = false;
  });
  syncPlay();
  onDaFrame(da.frame);
  actorFace(actor.frame);

  /* ── simulated network controls ── */
  const latIn = sim.querySelector('[data-ens-latency]');
  const latOut = sim.querySelector('[data-ens-latency-out]');
  const syncLatency = () => {
    latency = Number(latIn.value);
    latOut.textContent = `${latency} ms`;
    latIn.setAttribute('aria-valuetext', `${latency} millisecondes`);
    latIn.style.setProperty('--fill', `${((latency - latIn.min) / (latIn.max - latIn.min)) * 100}%`);
  };
  latIn.setAttribute('aria-label', 'Latence simulée');
  latIn.addEventListener('input', syncLatency);
  syncLatency();
  const comp = sim.querySelector('[data-ens-comp]');
  comp.addEventListener('change', () => {
    compensate = comp.checked;
    ctx.announce(`Compensation de la latence : ${compensate ? 'activée' : 'désactivée'}`);
    wake();
  });

  /* ── project transfer ── */
  const uploadBar = sim.querySelector('[data-ens-upload]');
  const summary = sim.querySelector('[data-ens-summary]');
  const sendBtn = sim.querySelector('[data-ens-send]');
  const countEl = sim.querySelector('[data-ens-count]');
  const rows = Object.entries(PEOPLE).map(([key, p]) => {
    const li = sim.querySelector(`[data-person="${key}"]`);
    return {
      key,
      p,
      li,
      state: li.querySelector('[data-state]'),
      bar: li.querySelector('.ens-bar'),
      note: li.querySelector('[data-note]'),
      last: {},
    };
  });
  let simT = -1; // not started
  let running = false;
  let lastSummary = '';
  let clock = 0;
  let lastNow = 0;

  const setBar = (bar, p) => {
    bar.style.setProperty('--p', p.toFixed(4));
    bar.setAttribute('aria-valuenow', String(Math.floor(p * 100 + 1e-6)));
  };

  const paintRow = (row, st) => {
    const { li, last } = row;
    if (st.phase !== last.phase) li.dataset.phase = st.phase;
    if (st.label !== last.label) row.state.textContent = st.label;
    if (st.progress !== last.progress) setBar(row.bar, st.progress);
    if (row.note && st.note !== last.note) row.note.textContent = st.note;

    // what the room would say out loud
    const { name } = row.p;
    if (row.key === 'lea' && st.phase === 'loaded' && last.phase && last.phase !== 'loaded') {
      loadActor();
      ctx.announce('Simulation : Léa a chargé le projet. Sa bande suit maintenant celle du DA.');
    }
    if (st.phase === 'cut' && last.phase === 'receiving') {
      ctx.announce(`Simulation : ${name} a perdu la connexion, son téléchargement attend.`);
    }
    if (st.phase === 'receiving' && last.phase === 'cut') {
      ctx.announce(`Simulation : ${name} est reconnecté, le téléchargement reprend où il s’était arrêté.`);
    }
    if (last.phase === 'away' && st.phase !== 'away') {
      ctx.announce(`Simulation : ${name} rejoint le salon, le projet l’attend sur le serveur.`);
    }
    row.last = st;
  };

  const renderTransfer = () => {
    const t = simT - UPLOAD;
    const states = rows.map((row) => personAt(row.p, simT < 0 ? -1 : t));
    rows.forEach((row, i) => paintRow(row, states[i]));
    setBar(uploadBar, simT < 0 ? 0 : clamp(simT / UPLOAD, 0, 1));
    const done = simT >= 0 && states.every((s) => s.phase === 'loaded');
    let text;
    if (simT < 0) text = 'Le DA n’a pas encore envoyé le projet.';
    else if (simT < UPLOAD) text = `Envoi au serveur - ${pct(clamp(simT / UPLOAD, 0, 1))}`;
    else if (done) text = 'Transfert terminé';
    else text = 'Projet disponible — chacun télécharge à son rythme.';
    if (text !== lastSummary) {
      const phaseChanged = !lastSummary.startsWith('Envoi') || !text.startsWith('Envoi');
      lastSummary = text;
      summary.textContent = text;
      if (phaseChanged && simT >= UPLOAD) ctx.announce(`Simulation : ${text}`);
    }
    const n = 1 + states.filter((s) => s.phase !== 'away').length;
    countEl.textContent = `${n} participants`;
    if (done && running) {
      running = false;
      sendBtn.disabled = false;
    }
  };

  const stepTransfer = (now) => {
    clock = 0;
    // a rAF timestamp can predate the performance.now() that scheduled it
    simT += clamp((now - lastNow) / 1000, 0, 0.1);
    lastNow = now;
    renderTransfer();
    if (running && simVisible && !document.hidden) clock = requestAnimationFrame(stepTransfer);
  };
  const resumeTransfer = () => {
    if (!running || clock || !simVisible || document.hidden) return;
    lastNow = performance.now();
    clock = requestAnimationFrame(stepTransfer);
  };
  const startTransfer = () => {
    if (actorLoaded) unloadActor();
    rows.forEach((row) => (row.last = {}));
    lastSummary = '';
    simT = 0;
    running = true;
    sendBtn.disabled = true;
    renderTransfer();
    resumeTransfer();
  };
  sendBtn.addEventListener('click', () => {
    startTransfer();
    ctx.announce('Simulation : envoi du projet au serveur');
  });
  renderTransfer();

  /* ── run only while visible ──
     Several entries can queue up for one target (hash jump, fast scroll):
     the last one is the current state. */
  new IntersectionObserver((entries) => {
    simVisible = entries[entries.length - 1].isIntersecting;
    if (simVisible) {
      resumeTransfer();
      wake();
    } else if (da.playing) {
      da.pause();
    }
  }).observe(sim);
  // the DA sends the project on their own once the transfer panel or Léa's
  // screen is in view, whichever the visitor reaches first
  const autoStart = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      autoStart.disconnect();
      if (simT < 0) startTransfer();
    },
    { threshold: 0.5 },
  );
  autoStart.observe(sim.querySelector('.ens-transfer'));
  autoStart.observe(actorScreen);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeTransfer();
  });

  initServerPreview(section);
}

/* ───────────── #serveur: .env → server browser row ───────────── */
function initServerPreview(section) {
  const form = section.querySelector('[data-ens-env]');
  if (!form) return;
  const field = (name) => form.elements.namedItem(name);
  const out = Object.fromEntries(
    ['name', 'slots', 'motd', 'endpoint'].map((k) => [k, section.querySelector(`[data-srv="${k}"]`)]),
  );
  const dotenv = section.querySelector('[data-ens-dotenv]');
  const clean = (s) => s.replace(/["\r\n]/g, '').trim();
  const quote = (s) => (/[\s#'=]/.test(s) ? `"${s}"` : s);
  const isInt = (v, min, max) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;
  const flag = (name, ok, message) => {
    const input = field(name);
    const row = input.closest('.ens-env__row');
    const hint = row.querySelector('.ens-env__hint');
    row.toggleAttribute('data-invalid', !ok);
    input.setAttribute('aria-invalid', String(!ok));
    hint.textContent = ok ? hint.dataset.defaultHint : message;
  };
  const span = (cls, text) => {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    return el;
  };

  const render = () => {
    const name = clean(field('SERVER_NAME').value);
    const motd = clean(field('MOTD').value);
    const password = clean(field('PASSWORD').value);
    const slotsRaw = field('MAX_SLOTS').value.trim();
    const portRaw = field('PORT').value.trim();
    const slotsOk = slotsRaw === '' || isInt(slotsRaw, 1, 9999);
    const portOk = portRaw === '' || isInt(portRaw, 1, 65535);
    flag('MAX_SLOTS', slotsOk, 'Entrez un nombre entier, au moins 1.');
    flag('PORT', portOk, 'Le port doit être un nombre compris entre 1 et 65535.');
    const slots = slotsOk && slotsRaw ? Number(slotsRaw) : 20;
    const port = portOk && portRaw ? Number(portRaw) : PORT;

    // server/src/index.js defaults: « Coquerythmo Server », 20 slots, port 9050;
    // server_browser.rs shows « Prêt à accueillir un salon » when the MOTD is empty
    out.name.textContent = name || 'Coquerythmo Server';
    out.motd.textContent = motd || 'Prêt à accueillir un salon';
    out.slots.textContent = `0/${slots}`;
    out.endpoint.textContent = `${SERVER}:${port}`;

    const lines = [
      ['PORT', portOk ? portRaw : ''],
      ['SERVER_NAME', name],
      ['MOTD', motd],
      ['MAX_SLOTS', slotsOk ? slotsRaw : ''],
      ['PASSWORD', password],
    ].filter(([, v]) => v);
    if (!lines.length) {
      dotenv.replaceChildren(span('e', '# Fichier vide : le serveur garde ses valeurs par défaut.'));
      return;
    }
    dotenv.replaceChildren(
      ...lines.flatMap(([k, v], i) => [...(i ? ['\n'] : []), span('k', k), span('e', '='), span('v', quote(v))]),
    );
  };
  form.addEventListener('input', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  render();
}
