// Bande rythmo ensemble: a session in five steps, with every screen at once.
// The DA invites, the comédiens join, the DA transfers the project once and
// each one downloads it at their own pace (the 5.1 notes: resumable after a
// cut), then the DA's band drives everyone's. Built from the app's panels:
// invitation_modal.rs, project_transfer_modal.rs, the window's toolbar.

import { visemeFor } from '../../band/text.js';

const CODE = 'K7Q2MX'; // server/src/room.js: 6 characters, A–Z 0–9
const SERVER = 'collaboration.exemple.fr'; // the app's own placeholder host
const PORT = 9050;
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

// What travels to the comédiens is a copy, never the DA's live objects.
const cloneProject = (p) => ({
  lines: p.lines.map(({ _syll, ...line }) => ({ ...line })),
  markers: p.markers.map((m) => ({ ...m })),
  strokes: [],
});

/* ───────────── The session script (seconds) ─────────────
   JOIN counts from the copied invitation. UPLOAD is the DA's single upload
   to the server; the downloads count from the moment the project is there.
   Each comédien has their own pace, and Samir's connection drops: his
   download waits, then resumes where it stopped. */
const STEPS = ['invite', 'join', 'send', 'download', 'play'];
const JOIN = { lea: 0.8, samir: 1.8, jade: 2.8 };
const UPLOAD = 2.2;
const LOAD = 0.8; // « Chargement » once the archive is down
const HOLD = 1.2; // « Transfert terminé » stays in view before the band
const PEOPLE = {
  lea: { name: 'Léa', accept: 0.3, dur: 2.4 },
  samir: { name: 'Samir', accept: 0.6, dur: 4.4, cutAt: 0.45, cutFor: 2 },
  jade: { name: 'Jade', accept: 1, dur: 3.2 },
};
// floor: a download reads 100 % only once it is complete
const pct = (x) => `${Math.floor(x * 100 + 1e-6)}${NBSP}%`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function downloadAt(p, t) {
  if (t < p.accept) return { phase: 'waiting', label: 'En attente', progress: 0, note: '' };
  let run = t - p.accept;
  let phase = 'receiving';
  let note = '';
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
  if (progress < 1) return { phase, label: phase === 'cut' ? 'Connexion coupée' : `Réception - ${pct(progress)}`, progress, note };
  if (run - p.dur < LOAD) return { phase: 'loading', label: 'Chargement', progress: 1, note };
  return { phase: 'loaded', label: 'Chargé', progress: 1, note };
}

export function init(ctx) {
  const section = document.getElementById('ensemble');
  const sim = section?.querySelector('[data-ens-sim]');
  if (!sim) return;
  const $ = (sel, el = sim) => el.querySelector(sel);
  const $$ = (sel, el = sim) => [...el.querySelectorAll(sel)];

  const nowEl = $('[data-ens-now]');
  const stepEls = $$('.ens-step');
  const panels = Object.fromEntries($$('[data-da]').map((el) => [el.dataset.da, el]));
  const roomTitle = $('[data-ens-room-title]');
  const sendBtn = $('[data-ens-send]');
  const uploadWrap = $('[data-ens-upload-wrap]');
  const uploadBar = $('[data-ens-upload]');
  const summary = $('[data-ens-summary]');
  const playBtn = $('[data-ens-cmd="play"]');
  const playIcon = $('[data-play-icon]', playBtn);
  const tcOut = $('[data-tc-out]');
  $('[data-ens-link]').textContent = inviteLink();

  const setBar = (bar, p) => {
    bar.style.setProperty('--p', p.toFixed(4));
    if (bar.hasAttribute('role')) bar.setAttribute('aria-valuenow', String(Math.floor(p * 100 + 1e-6)));
  };

  /* ── the bands: the DA's is the instrument, the others echo it ── */
  const da = new ctx.Band($('[data-ens-band="da"]'), {
    project: sceneProject(),
    tracks: 2,
    startFrame: START,
    stopAt: END,
    label: 'Bande rythmo du DA, simulation',
    settings: ctx.settings,
    announce: ctx.announce,
  });

  // one comédien: their row on the DA's screen, their own screen and band
  const people = Object.entries(PEOPLE).map(([key, p]) => {
    const pov = $(`[data-pov="${key}"]`);
    return {
      key,
      p,
      row: $(`[data-person="${key}"]`),
      rowState: $(`[data-person="${key}"] [data-state]`),
      rowBar: $(`[data-person="${key}"] .ens-bar`),
      pov,
      state: $('[data-pov-state]', pov),
      bar: $('[data-pov-bar]', pov),
      note: $('[data-pov-note]', pov),
      screen: $('[data-pov-screen]', pov),
      band: new ctx.Band($(`[data-ens-band="${key}"]`, pov), {
        project: cloneProject(da.project),
        tracks: 2,
        startFrame: START,
        scale: 0.6,
        interactive: false,
        settings: ctx.settings,
      }),
      face: face(pov),
      last: {},
    };
  });

  /* ── work copy: burned timecode + lips, sampled like the window's ── */
  function face(el) {
    const tc = $('[data-tc]', el);
    const mouth = $('[data-mouth]', el);
    let last = 'P_B_M';
    return (f) => {
      tc.textContent = ctx.timecode(f);
      const q = Math.floor(f / 2) * 2;
      const speaking = da.project.lines.find(
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
  }
  const daFace = face(panels.play);

  // what the DA does, everyone sees: position, edits, selection
  da.on('frame', (f) => {
    daFace(f);
    tcOut.textContent = ctx.timecode(f).slice(3);
    for (const who of people) {
      who.band.setFrame(f);
      who.face(f);
    }
  });
  da.on('change', () => {
    for (const who of people) who.band.setProject(cloneProject(da.project));
  });
  da.on('select', (line) => {
    for (const who of people) {
      who.band.selection = new Set(line ? [line.id] : []);
      who.band.invalidate();
    }
  });
  const syncPlay = () => {
    const on = da.playing;
    playIcon.style.setProperty('--src', `url(/icons/${on ? 'pause' : 'resume'}.svg)`);
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
    playBtn.dataset.tip = on ? 'Pause' : 'Lecture';
    playBtn.setAttribute('aria-pressed', String(on));
  };
  da.on('play', syncPlay);
  da.on('pause', syncPlay);
  $$('[data-ens-cmd]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.ensCmd === 'play') da.toggle();
      else da.step(b.dataset.ensCmd === 'prev' ? -1 : 1);
    }),
  );

  /* ── the steps ── */
  let step = 'invite';
  let t = 0; // seconds into the current step
  let everyone = false; // all comédiens joined
  const say = (html) => {
    nowEl.innerHTML = html;
  };
  // where focus goes when the control it was on disappears with its step
  const FOCUS = { invite: '[data-ens-invite="link"]', join: '[data-ens-send]', send: '[data-ens-send]', download: '[data-ens-send]', play: '[data-ens-cmd="play"]' };
  const setStep = (name) => {
    const focused = sim.contains(document.activeElement) ? document.activeElement : null;
    step = name;
    t = 0;
    const at = STEPS.indexOf(name);
    stepEls.forEach((el, i) => {
      if (i === at) el.setAttribute('aria-current', 'step');
      else el.removeAttribute('aria-current');
      el.dataset.state = i < at ? 'done' : i === at ? 'now' : 'next';
    });
    panels.invite.hidden = name !== 'invite';
    panels.room.hidden = !['join', 'send', 'download'].includes(name);
    panels.play.hidden = name !== 'play';
    uploadWrap.hidden = !['send', 'download'].includes(name);
    roomTitle.textContent = name === 'join' ? 'Participants' : 'Transfert du projet';
    if (focused?.closest('[hidden]')) $(FOCUS[name])?.focus({ preventScroll: true });
    if (name === 'invite') {
      say('Le DA vient de créer le salon. <strong>Copiez le lien d’invitation</strong>&nbsp;: c’est lui que les comédiens ouvrent.');
    } else if (name === 'join') {
      say('Les comédiens ouvrent le lien&nbsp;: Coquerythmo demande leur pseudo et les fait entrer dans le salon.');
    } else if (name === 'send') {
      say('Le projet part <strong>une seule fois</strong>, du DA vers le serveur.');
    } else if (name === 'download') {
      say('Le projet attend sur le serveur&nbsp;: <strong>chacun le télécharge à son rythme</strong>. Une coupure ne fait pas repartir de zéro.');
    } else {
      say('Chacun a le projet. <strong>Lancez la lecture</strong>&nbsp;: la même bande défile chez tout le monde, au même moment.');
    }
    render();
    wake();
  };

  /* ── painting ── */
  const paintPerson = (who, st) => {
    const { last } = who;
    if (st.row !== last.row) {
      who.row.hidden = !st.row;
      who.row.dataset.phase = st.phase;
    } else if (st.phase !== last.phase) who.row.dataset.phase = st.phase;
    if (st.rowLabel !== last.rowLabel) who.rowState.textContent = st.rowLabel;
    if (st.progress !== last.progress) {
      setBar(who.rowBar, st.progress);
      setBar(who.bar, st.progress);
    }
    if (st.phase !== last.phase) who.pov.dataset.phase = st.phase;
    if (st.label !== last.label) who.state.textContent = st.label;
    if (st.note !== last.note) who.note.textContent = st.note;
    const barOn = ['receiving', 'cut', 'loading'].includes(st.phase);
    if (barOn !== last.barOn) who.bar.hidden = !barOn;
    const screenOn = step === 'play';
    if (screenOn !== last.screenOn) {
      who.screen.hidden = !screenOn;
      if (screenOn) {
        who.band.setFrame(da.frame);
        who.face(da.frame);
      }
    }
    who.last = { ...st, barOn, screenOn };
  };

  function stateOf(who) {
    const { key, p } = who;
    if (step === 'invite') {
      return { row: false, phase: 'away', rowLabel: '', label: 'Pas encore dans le salon', progress: 0, note: '' };
    }
    if (step === 'join') {
      const inRoom = t >= JOIN[key];
      return inRoom
        ? { row: true, phase: 'joined', rowLabel: 'Dans le salon', label: `Dans le salon ${CODE}`, progress: 0, note: 'Attendez le transfert du projet par le DA.' }
        : { row: false, phase: 'away', rowLabel: '', label: 'Ouvre le lien d’invitation…', progress: 0, note: '' };
    }
    if (step === 'send') {
      return { row: true, phase: 'waiting', rowLabel: 'En attente', label: 'En attente', progress: 0, note: 'Le DA envoie le projet au serveur.' };
    }
    if (step === 'download') {
      const d = downloadAt(p, t);
      return { row: true, phase: d.phase, rowLabel: d.label, label: d.label, progress: d.progress, note: d.note };
    }
    return { row: true, phase: 'loaded', rowLabel: 'Chargé', label: 'Lecture seule : la bande suit le DA', progress: 1, note: '' };
  }

  function render() {
    const states = people.map(stateOf);
    people.forEach((who, i) => paintPerson(who, states[i]));
    if (step === 'join') {
      const all = states.every((s) => s.row);
      if (all && !everyone) {
        everyone = true;
        sendBtn.removeAttribute('aria-disabled');
        say('Tout le monde est là. <strong>Transférez le projet</strong>&nbsp;: il ne part qu’une fois.');
      }
    }
    if (step === 'send') {
      const up = clamp(t / UPLOAD, 0, 1);
      setBar(uploadBar, up);
      summary.textContent = `Envoi au serveur - ${pct(up)}`;
      if (t >= UPLOAD) setStep('download');
    } else if (step === 'download') {
      setBar(uploadBar, 1);
      const done = states.every((s) => s.phase === 'loaded');
      summary.textContent = done ? 'Transfert terminé' : 'Projet disponible — chacun télécharge à son rythme.';
      if (done && t >= Math.max(...people.map((who) => doneAt(who.p))) + HOLD) setStep('play');
    }
  }
  // when a download reads « Chargé », in seconds after the upload
  const doneAt = (p) => p.accept + p.dur + (p.cutFor || 0) + LOAD;

  /* ── the clock runs while a step animates and the simulation is on screen ── */
  let visible = false;
  let raf = 0;
  let lastNow = 0;
  const animating = () => ['join', 'send', 'download'].includes(step);
  const tick = (now) => {
    raf = 0;
    t += clamp((now - lastNow) / 1000, 0, 0.1);
    lastNow = now;
    render();
    wake();
  };
  function wake() {
    if (raf || !visible || document.hidden || !animating()) return;
    if (!lastNow || performance.now() - lastNow > 200) lastNow = performance.now();
    raf = requestAnimationFrame(tick);
  }
  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) wake();
    else if (da.playing) da.pause();
  }).observe(sim);
  document.addEventListener('visibilitychange', () => wake());

  /* ── the visitor's actions ── */
  $$('[data-ens-invite]').forEach((b) =>
    b.addEventListener('click', async () => {
      const text = b.dataset.ensInvite === 'link' ? inviteLink() : CODE;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* a refused copy does not stop the simulation */
      }
      setStep('join');
    }),
  );
  sendBtn.addEventListener('click', () => {
    if (step !== 'join' || !everyone) return;
    sendBtn.setAttribute('aria-disabled', 'true');
    setStep('send');
  });
  $('[data-ens-reset]').addEventListener('click', () => {
    da.pause();
    da.setProject(sceneProject());
    da.seek(START);
    for (const who of people) {
      who.band.setProject(cloneProject(da.project));
      who.last = {};
    }
    everyone = false;
    sendBtn.setAttribute('aria-disabled', 'true');
    setBar(uploadBar, 0);
    setStep('invite');
    ctx.announce('Simulation recommencée');
  });
  syncPlay();
  daFace(da.frame);
  setStep('invite');

}

/* ───────────── Invitation link (src/protocol.rs, ProtocolPayload::join) ───────────── */
const b64url = (s) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function inviteLink() {
  // serde field order: k, s, c, p
  const payload = { k: 'j', s: `${SERVER}:${PORT}`, c: CODE, p: '' };
  return `coquerythmo://link/${b64url(JSON.stringify(payload))}`;
}
