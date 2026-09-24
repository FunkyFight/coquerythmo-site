// Import, projets et automatisation (#projets).
// Three working pieces rebuilt from the app:
// - the formats Coquerythmo opens (extension lists of src/app/dispatcher.rs),
//   shown as a list: the site never reads the visitor's files;
// - « Fichiers du projet » (src/ui/file_explorer/*): the tree, its keyboard
//   map, its context menu, inline rename and « Créer un proxy »
//   (src/ui/proxy_modal.rs, src/video_proxy.rs);
// - « Automatisation » (src/automation.rs, src/ui/automation.rs): the node
//   graph evaluated on every change, driving a mini band.

const FT = '/icons/file_tree/';

const SVG_X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2.2" /></svg>';
const SVG_MINUS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8" stroke="currentColor" stroke-width="1.8" /></svg>';
const SVG_PLUS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6 2v8" stroke="currentColor" stroke-width="1.8" /></svg>';
const SVG_EXEC = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M2 1l3.5 3L2 7" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function init(ctx) {
  const root = document.getElementById('projets');
  if (!root) return;
  initTree(root, ctx);
  initAutomation(root, ctx);
}

/* ═══════════════════════ Fichiers du projet ═══════════════════════ */

// file_explorer/mod.rs geometry
const ROW_H = 36;
const INDENT = 24;
const LIST_PAD = 6;
const GROUPS = {
  videos: { label: 'Vidéos', color: '#69a8ff' }, // category_color
  bands: { label: 'Bandes rythmo', color: '#c282ff' },
  audios: { label: 'Audios', color: '#52d4b8' },
};
const SYLLABLES = { fr: 'Français', en: 'English', es: 'Español' };
const BR_PATH = 'D:\\Doublage\\demo_episode_12.coquerythmo';
const ENCODERS = { 'H.264': 'mp4', MJPEG: 'mov', 'ProRes Proxy': 'mov' }; // ProxyEncoder::extension

function demoProject() {
  return {
    root: 'demo_episode_12',
    videos: [
      { id: 1, name: 'episode_12_master', ext: 'mov', w: 1920, h: 1080, proxyOf: null },
      { id: 2, name: 'episode_12_master_proxy_720p', ext: 'mov', w: 1280, h: 720, proxyOf: 1, encoder: 'ProRes Proxy' },
      { id: 3, name: 'episode_12_VO_soustitree', ext: 'mp4', w: 1920, h: 1080, proxyOf: null },
    ],
    defaultVideo: 2,
    activeVideo: 2,
    bands: [
      { id: 1, name: 'Français', syllable: 'fr', instrumental: 10 },
      { id: 2, name: 'English', syllable: 'en', instrumental: 10 },
      { id: 3, name: 'Español', syllable: 'es', instrumental: null },
    ],
    activeBand: 1,
    audios: [
      { id: 10, name: 'episode_12_VI', ext: 'wav' },
      { id: 11, name: 'ambiance_foule', ext: 'flac' },
    ],
    expanded: { videos: true, bands: true, audios: true },
    nextId: 100,
  };
}

// video_proxy.rs: stable_hash_hex is FNV-1a 64, safe_stem keeps [A-Za-z0-9_-]
function stableHashHex(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}
function safeStem(path) {
  const stem = path.split(/[\\/]/).pop().replace(/\.[^.]*$/, '');
  let out = '';
  for (const ch of stem) out += /[A-Za-z0-9_-]/.test(ch) ? ch : '_';
  return out || 'br';
}
// fit_to_max_height: never upscales, even dimensions
function fitToMaxHeight(w, h, max) {
  if (!w || !h) return [1920, 1080];
  const even = (v) => {
    const c = clamp(v, 16, 8192);
    return c % 2 ? Math.min(c + 1, 8192) : c;
  };
  const th = clamp(Math.min(h, max), 16, 8192);
  const tw = clamp(Math.round((w * th) / h), 16, 8192);
  return [even(tw), even(th)];
}

function initTree(root, ctx) {
  const host = root.querySelector('[data-tree-host]');
  const list = root.querySelector('[data-tree]');
  const scroller = root.querySelector('[data-tree-scroll]');
  const pill = root.querySelector('[data-pill]');
  if (!host || !list) return null;
  const menuEl = host.querySelector('[data-menu]');
  const subEl = host.querySelector('[data-submenu]');
  const read = {
    name: root.querySelector('[data-read-name]'),
    icon: root.querySelector('.pj-read__name .icon'),
    meta: root.querySelector('[data-read-meta]'),
    text: root.querySelector('[data-read-text]'),
    voice: root.querySelector('[data-read-voice]'),
  };
  const reduce = () => ctx.settings.get().reduceMotion;

  let p = demoProject();
  let rows = [];
  let focusedId = 'root';
  let selectedId = null;
  let renaming = null; // { id, input }
  let notice = null; // one-shot readout message (drop refused…)
  const els = new Map();

  /* ── model helpers ── */
  const video = (id) => p.videos.find((v) => v.id === id);
  const audio = (id) => p.audios.find((a) => a.id === id);
  const band = (id) => p.bands.find((b) => b.id === id);
  const isProxySource = (v) => p.videos.some((x) => x.proxyOf === v.id);
  const proxyOfSource = (v) => p.videos.find((x) => x.proxyOf === v.id);
  const instrumentalOf = (a) => p.bands.filter((b) => b.instrumental === a.id).map((b) => b.name);
  const hasOriginal = () => p.activeVideo != null && !!video(p.activeVideo);
  const canBeProxyEndpoint = (v) => v.proxyOf == null && !isProxySource(v);

  /* ── rows.rs: flatten ── */
  function flatten() {
    const out = [{ id: 'root', type: 'root', depth: 0 }];
    out.push({ id: 'g:videos', type: 'group', group: 'videos', depth: 1 });
    if (p.expanded.videos) {
      for (const v of p.videos.filter((x) => x.proxyOf == null)) {
        out.push({ id: `v:${v.id}`, type: 'video', ref: v, depth: 2, group: 'videos' });
        for (const px of p.videos.filter((x) => x.proxyOf === v.id)) {
          out.push({ id: `v:${px.id}`, type: 'video', ref: px, depth: 3, group: 'videos' });
        }
      }
    }
    out.push({ id: 'g:bands', type: 'group', group: 'bands', depth: 1 });
    if (p.expanded.bands) for (const b of p.bands) out.push({ id: `b:${b.id}`, type: 'band', ref: b, depth: 2, group: 'bands' });
    out.push({ id: 'g:audios', type: 'group', group: 'audios', depth: 1 });
    if (p.expanded.audios) {
      if (hasOriginal()) out.push({ id: 'a:orig', type: 'original', depth: 2, group: 'audios' });
      for (const a of p.audios) out.push({ id: `a:${a.id}`, type: 'audio', ref: a, depth: 2, group: 'audios' });
    }
    return out;
  }

  /* ── rows.rs: set_metrics ── */
  function metrics(row) {
    const i = rows.indexOf(row);
    let sib;
    if (row.type === 'root') sib = [row];
    else if (row.type === 'group') sib = rows.filter((r) => r.type === 'group');
    else if (row.type === 'video' && row.depth === 3) {
      let a = i;
      while (a > 0 && rows[a - 1].depth === 3) a--;
      let b = i;
      while (b + 1 < rows.length && rows[b + 1].depth === 3) b++;
      sib = rows.slice(a, b + 1);
    } else if (row.type === 'video') sib = rows.filter((r) => r.type === 'video' && r.depth === 2);
    else if (row.type === 'band') sib = rows.filter((r) => r.type === 'band');
    else sib = rows.filter((r) => r.type === 'audio' || r.type === 'original');
    return [sib.indexOf(row) + 1, sib.length];
  }

  const groupCount = (g) => (g === 'videos' ? p.videos.length : g === 'bands' ? p.bands.length : p.audios.length + (hasOriginal() ? 1 : 0));

  /* ── mod.rs: accessibility_label (i18n/fr.toml file_tree.a11y.*) ── */
  function appLabel(row, { position = true, selection = true } = {}) {
    const parts = [];
    if (row.type === 'root') parts.push(`Projet ${p.root}`);
    else if (row.type === 'group') {
      const n = groupCount(row.group);
      parts.push(`${GROUPS[row.group].label}, grande catégorie`, n === 1 ? '1 élément' : `${n} éléments`);
    } else if (row.type === 'video') {
      const v = row.ref;
      parts.push(v.proxyOf != null ? `Vidéos, vidéo source ${video(v.proxyOf)?.name ?? ''}, ${v.name}` : `Vidéos, vidéo source, ${v.name}`);
      if (v.proxyOf != null) parts.push('est un proxy');
      if (p.defaultVideo === v.id) parts.push('Par défaut');
      if (isProxySource(v)) parts.push('A un proxy');
      if (p.activeVideo === v.id) parts.push('en cours d’utilisation');
    } else if (row.type === 'band') {
      parts.push(`Bandes rythmo, bande rythmo ${row.ref.name}`);
      if (p.activeBand === row.ref.id) parts.push('Sélection');
    } else if (row.type === 'original') parts.push('Audios, audio de la vidéo originale');
    else {
      parts.push(`Audios, audio ${row.ref.name}`);
      const of = instrumentalOf(row.ref);
      if (of.length) parts.push(`version instrumentale de la bande rythmo ${of.join(', ')}`);
    }
    if (selection && selectedId === row.id && row.type !== 'band') parts.push('Sélection');
    if (position) {
      const [pos, total] = metrics(row);
      parts.push(`élément ${pos} sur ${total}`);
    }
    return parts.join(', ');
  }

  /* ── mod.rs: render_row (icons, tints, status icons) ── */
  function view(row) {
    const v = { icon: 'folder', color: '#ffcd60', name: '', badges: [] };
    if (row.type === 'root') v.name = p.root;
    else if (row.type === 'group') {
      v.color = GROUPS[row.group].color;
      v.name = GROUPS[row.group].label;
    } else if (row.type === 'video') {
      const x = row.ref;
      v.icon = x.proxyOf != null ? 'video-proxy' : 'video-source';
      v.color = '#69a9ff';
      v.name = x.name;
      v.active = p.activeVideo === x.id;
      // status_icons_for_row pushes from the right: proxy, default, has-proxy
      if (isProxySource(x)) v.badges.push(['has-proxy', '#5cd2eb', 'A un proxy']);
      if (p.defaultVideo === x.id) v.badges.push(['default', '#ffcf5c', 'Par défaut']);
      if (x.proxyOf != null) v.badges.push(['proxy', '#7eb0ff', 'Proxy']);
    } else if (row.type === 'band') {
      v.icon = 'rythmo-band';
      v.color = '#c181ff';
      v.name = row.ref.name;
      v.active = p.activeBand === row.ref.id;
    } else if (row.type === 'original') {
      v.icon = 'audio-original';
      v.color = '#8ee1cd';
      v.name = 'Audio de la vidéo originale';
    } else {
      v.icon = 'audio-file';
      v.color = '#52d3b8';
      v.name = row.ref.name;
      const of = instrumentalOf(row.ref);
      if (of.length) v.badges.push(['rythmo-band', '#ca8fff', `Instrumental de: ${of.join(', ')}`]);
    }
    return v;
  }

  function createRow(row) {
    const el = document.createElement('li');
    el.setAttribute('role', 'treeitem');
    el.className = 'pj-row';
    el.dataset.id = row.id;
    el.tabIndex = -1;
    el.innerHTML = '<span class="icon pj-row__icon" aria-hidden="true"></span><span class="pj-row__name"></span><span class="pj-row__badges"></span>';
    return el;
  }

  function updateRow(el, row, i) {
    const v = view(row);
    el.dataset.type = row.type;
    el.style.setProperty('--y', `${i * ROW_H}px`);
    el.style.setProperty('--indent', `${row.type === 'root' || row.type === 'group' ? 0 : (row.depth - 1) * INDENT}px`);
    if (row.group) el.dataset.cat = row.group;
    else delete el.dataset.cat;
    el.toggleAttribute('data-head', row.type === 'group');
    el.toggleAttribute('data-active', !!v.active);
    const icon = el.querySelector('.pj-row__icon');
    icon.style.setProperty('--src', `url(${FT}${v.icon}.svg)`);
    icon.style.setProperty('--ic', v.color);
    const name = el.querySelector('.pj-row__name');
    if (!(renaming && renaming.id === row.id) && name.textContent !== v.name) name.textContent = v.name;
    const key = JSON.stringify(v.badges);
    const badges = el.querySelector('.pj-row__badges');
    if (badges.dataset.key !== key) {
      badges.dataset.key = key;
      badges.innerHTML = v.badges
        .map(([ic, color, tip]) => `<span class="icon pj-badge" style="--src: url(${FT}${ic}.svg); color: ${color}" data-tip="${esc(tip)}" aria-hidden="true"></span>`)
        .join('');
    }
    const [pos, total] = metrics(row);
    el.setAttribute('aria-level', String(row.depth + 1));
    el.setAttribute('aria-posinset', String(pos));
    el.setAttribute('aria-setsize', String(total));
    el.setAttribute('aria-label', appLabel(row, { position: false, selection: false }));
    el.setAttribute('aria-selected', String(selectedId === row.id));
    if (row.type === 'group') el.setAttribute('aria-expanded', String(!!p.expanded[row.group]));
    else el.removeAttribute('aria-expanded');
    el.tabIndex = row.id === focusedId ? 0 : -1;
    if (row.id === focusedId) el.setAttribute('aria-describedby', 'pj-read-text');
    else el.removeAttribute('aria-describedby');
  }

  function render({ animate = true } = {}) {
    const hadFocus = list.contains(document.activeElement);
    rows = flatten();
    if (!rows.some((r) => r.id === focusedId)) focusedId = fallbackFocus(focusedId);
    if (selectedId && !rows.some((r) => r.id === selectedId)) selectedId = null;
    const entering = [];
    let prev = null;
    rows.forEach((row, i) => {
      let el = els.get(row.id);
      if (!el) {
        el = createRow(row);
        els.set(row.id, el);
        if (animate && !reduce()) {
          el.classList.add('is-entering');
          entering.push(el);
        }
      }
      updateRow(el, row, i);
      // keep DOM order = visual order (reading order for screen readers)
      const want = prev ? prev.nextElementSibling : list.firstElementChild;
      if (want !== el) list.insertBefore(el, want);
      prev = el;
    });
    const live = new Set(rows.map((r) => r.id));
    for (const [id, el] of els) {
      if (!live.has(id)) {
        el.remove();
        els.delete(id);
      }
    }
    list.style.height = `${rows.length * ROW_H}px`;
    // an action removed the focused row: hand focus to its fallback
    if (hadFocus && !list.contains(document.activeElement)) rowEl(focusedId)?.focus({ preventScroll: true });
    if (entering.length) {
      void list.offsetHeight;
      // row enter: 0.22 s, stagger min(position × 0.025, 0.1) s (animation.rs)
      entering.forEach((el, k) => {
        el.style.transitionDelay = `${Math.min(k * 25, 100)}ms`;
        el.classList.remove('is-entering');
        setTimeout(() => (el.style.transitionDelay = ''), 360);
      });
    }
    readout();
  }

  function fallbackFocus(id) {
    const [kind] = id.split(':');
    if (kind === 'v') return 'g:videos';
    if (kind === 'b') return 'g:bands';
    if (kind === 'a') return 'g:audios';
    return 'root';
  }

  /* ── readout: the focused row in words ── */
  function readout() {
    const row = rows.find((r) => r.id === focusedId) || rows[0];
    const v = view(row);
    let name = v.name;
    let meta = '';
    let text = '';
    if (row.type === 'root') {
      name = `${p.root}.coquerythmo`;
      meta = 'Projet autonome';
      text =
        'Ce fichier embarque la vidéo source et son proxy, l’instrumental de chaque langue, la police de la bande rythmo, les icônes des comédiens et les prises enregistrées. Chaque élément porte une somme de contrôle, vérifiée à l’ouverture. Sous Windows, il s’ouvre depuis le menu « Ouvrir avec ».';
    } else if (row.type === 'group' && row.group === 'videos') {
      meta = `${p.videos.length} vidéo${p.videos.length > 1 ? 's' : ''} · mp4, mov, avi, mkv, webm`;
      text = 'Un projet peut réunir plusieurs vidéos, la copie de travail propre comme une VO de référence. L’étoile marque la vidéo par défaut du projet, le texte bleu celle en cours de lecture. Entrée ou ← → pour déplier ou replier le groupe.';
    } else if (row.type === 'group' && row.group === 'bands') {
      meta = `${p.bands.length} langue${p.bands.length > 1 ? 's' : ''}`;
      text = 'Chaque langue possède sa propre bande rythmo et son propre instrumental. Entrée sur une bande pour l’éditer.';
    } else if (row.type === 'group') {
      meta = 'flac, wav, mp3, ogg, m4a, aac, opus';
      text = 'Un audio peut servir d’instrumental à une ou plusieurs bandes. Ctrl Tab bascule entre l’audio original et l’instrumental.';
    } else if (row.type === 'video') {
      const x = row.ref;
      const bits = [x.proxyOf != null ? `Proxy de ${video(x.proxyOf)?.name ?? '?'}` : 'Vidéo source', `.${x.ext}`];
      if (x.w && x.h) bits.push(`${x.w} x ${x.h}`);
      if (x.encoder) bits.splice(1, 0, x.encoder);
      if (p.activeVideo === x.id) bits.push('en cours d’utilisation');
      meta = bits.join(' · ');
      if (x.proxyOf != null) text = 'Une copie allégée pour une lecture fluide pendant que vous travaillez. L’export utilisera toujours la vidéo originale.';
      else if (isProxySource(x)) text = 'Elle a un proxy, rangé juste en dessous. Menu contextuel › « Recréer le proxy » pour changer de résolution ou d’encodeur.';
      else text = 'Menu contextuel › « Créer un proxy » : une copie allégée en H.264, MJPEG ou ProRes Proxy, de 360p à 1440p, pour une lecture fluide. L’export garde la vidéo originale.';
    } else if (row.type === 'band') {
      const b = row.ref;
      const inst = b.instrumental != null ? audio(b.instrumental)?.name : null;
      meta = `Découpe des syllabes : ${SYLLABLES[b.syllable]} · ${inst ? `instrumental : ${inst}` : 'Aucun audio instrumental'}`;
      text =
        p.activeBand === b.id
          ? 'La bande en cours d’édition. Son menu contextuel règle la langue de découpe des syllabes et l’instrumental de cette langue.'
          : 'Entrée pour l’éditer à la place de la bande active. Son menu contextuel règle la langue de découpe et l’instrumental.';
    } else if (row.type === 'original') {
      meta = 'Ligne fixe du groupe Audios';
      text = 'Le son de la vidéo chargée, sans fichier à part. Ctrl Tab bascule entre lui et l’instrumental de la bande active.';
    } else {
      const a = row.ref;
      const of = instrumentalOf(a);
      meta = [`.${a.ext}`, of.length ? `Instrumental de: ${of.join(', ')}` : null].filter(Boolean).join(' · ');
      text = of.length
        ? `L’instrumental de ${of.join(' et ')}. Ctrl Tab passe de l’audio original à lui sur ${of.length > 1 ? 'ces bandes' : 'cette bande'}.`
        : 'Un audio du projet. Menu contextuel d’une bande › « Définir l’instrumental » pour l’y associer.';
    }
    if (notice) {
      text = notice;
      notice = null;
    }
    read.name.textContent = name;
    read.icon.style.setProperty('--src', `url(${FT}${v.icon}.svg)`);
    read.icon.style.color = v.color;
    read.meta.textContent = meta;
    read.text.textContent = text;
    read.voice.textContent = appLabel(row);
  }

  /* ── focus, selection, scrolling ── */
  const rowEl = (id) => els.get(id);
  function ensureVisible(id) {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return;
    const top = LIST_PAD + i * ROW_H;
    const bottom = top + ROW_H;
    if (top < scroller.scrollTop) scroller.scrollTop = top - LIST_PAD;
    else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight + LIST_PAD;
  }
  function focusRow(id, { move = true, select = false } = {}) {
    focusedId = id;
    if (select) selectedId = id;
    render({ animate: false });
    ensureVisible(id);
    if (move) rowEl(id)?.focus({ preventScroll: true });
  }

  /* ── actions (UiAction equivalents) ── */
  const say = (text) => ctx.announce(text);

  function toggleGroup(g) {
    p.expanded[g] = !p.expanded[g];
    render();
    say(`${GROUPS[g].label}, grande catégorie : ${p.expanded[g] ? 'développée' : 'réduite'}`);
  }
  function activate(row) {
    if (row.type === 'group') return toggleGroup(row.group);
    if (row.type === 'video') return useVideo(row.ref.id);
    if (row.type === 'band') return activateBand(row.ref.id);
  }
  function useVideo(id) {
    p.activeVideo = id;
    render();
    say(`${video(id).name}, en cours d’utilisation`);
  }
  function activateBand(id) {
    if (p.activeBand === id) return;
    p.activeBand = id;
    render();
    say(`Langue sélectionnée : ${band(id).name}`);
  }
  function setDefault(id) {
    p.defaultVideo = id;
    render();
    say('Vidéo par défaut enregistrée pour ce projet.');
  }
  function removeVideo(id) {
    // remove_media_video cascades to proxies
    const gone = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const v of p.videos) {
        if (v.proxyOf != null && gone.has(v.proxyOf) && !gone.has(v.id)) {
          gone.add(v.id);
          grew = true;
        }
      }
    }
    p.videos = p.videos.filter((v) => !gone.has(v.id));
    if (gone.has(p.defaultVideo)) p.defaultVideo = null;
    if (gone.has(p.activeVideo)) p.activeVideo = p.videos[0]?.id ?? null;
    render();
    say('Vidéo retirée du projet. Le fichier original est conservé.');
  }
  function removeAudio(id) {
    const name = audio(id)?.name;
    p.audios = p.audios.filter((a) => a.id !== id);
    for (const b of p.bands) if (b.instrumental === id) b.instrumental = null; // remove_media_audio
    render();
    say(`${name} retiré du projet`);
  }
  function deleteBand(id) {
    if (p.bands.length < 2) return;
    const name = band(id).name;
    p.bands = p.bands.filter((b) => b.id !== id);
    if (p.activeBand === id) p.activeBand = p.bands[0].id;
    render();
    say(`Langue supprimée : ${name}`);
  }
  function dissociate(id) {
    video(id).proxyOf = null;
    render();
    say(`${video(id).name} n’est plus un proxy`);
  }
  function associate(proxyId, sourceId) {
    video(proxyId).proxyOf = sourceId;
    p.expanded.videos = true;
    render();
    say(`${video(proxyId).name} associé comme proxy de ${video(sourceId).name}`);
  }
  function setSyllable(id, lang) {
    band(id).syllable = lang;
    render();
    say(`Langue de découpe : ${SYLLABLES[lang]}`);
  }
  function setInstrumental(id, audioId) {
    band(id).instrumental = audioId;
    render();
    say(audioId == null ? `${band(id).name} : aucun audio instrumental` : `Instrumental de ${band(id).name} : ${audio(audioId).name}`);
  }

  /* ── F2: inline rename ── */
  function startRename(id) {
    const row = rows.find((r) => r.id === id);
    if (!row || !['video', 'audio', 'band'].includes(row.type)) {
      say('Cet élément ne se renomme pas');
      return;
    }
    const el = rowEl(id);
    const name = el.querySelector('.pj-row__name');
    const input = document.createElement('input');
    input.className = 'pj-row__input';
    input.value = row.ref.name;
    input.setAttribute('aria-label', `Renommer ${row.ref.name}`);
    input.spellcheck = false;
    name.hidden = true;
    name.after(input);
    renaming = { id, input, row };
    input.focus();
    input.select();
    const finish = (commit) => {
      if (!renaming || renaming.input !== input) return;
      renaming = null;
      const value = input.value.trim();
      input.remove();
      name.hidden = false;
      if (commit && value && value !== row.ref.name) {
        row.ref.name = value;
        say(`Renommé : ${value}`);
      }
      focusRow(id);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  /* ── « Ajouter une vidéo… » / « Ajouter un audio… »: the app opens a file
     dialog; the site takes no files, so it only says what would happen ── */
  function pickMedia(kind) {
    notice = `Dans Coquerythmo, « ${kind === 'video' ? 'Ajouter une vidéo…' : 'Ajouter un audio…'} » ouvre le sélecteur de fichiers. Le site, lui, n’importe rien.`;
    render();
    say(notice);
  }

  /* ── context menu (context_menu_items / submenu_items) ── */
  function menuItems(row) {
    if (row.type === 'group' && row.group === 'videos') return [{ label: 'Ajouter une vidéo…', run: () => pickMedia('video') }];
    if (row.type === 'group' && row.group === 'audios') return [{ label: 'Ajouter un audio…', run: () => pickMedia('audio') }];
    if (row.type === 'video') {
      const v = row.ref;
      const items = [
        { label: 'Utiliser', run: () => useVideo(v.id) },
        { label: 'Définir par défaut', run: () => setDefault(v.id) },
      ];
      if (v.proxyOf != null) items.push({ label: 'Dissocier le proxy', run: () => dissociate(v.id) });
      else {
        items.push({ label: 'Rétablir le lien', enabled: false });
        const recreate = isProxySource(v);
        items.push({ label: recreate ? 'Recréer le proxy' : 'Créer un proxy', run: () => proxy.open(v, { recreate }) });
        if (canBeProxyEndpoint(v)) {
          items.push({
            label: 'Associer comme proxy de',
            sub: () => {
              const sources = p.videos.filter((s) => s.id !== v.id && s.proxyOf == null && !isProxySource(s));
              return sources.length
                ? sources.map((s) => ({ label: s.name, run: () => associate(v.id, s.id) }))
                : [{ label: 'Aucune vidéo disponible', enabled: false }];
            },
          });
        }
      }
      items.push({ label: 'Renommer', run: () => startRename(row.id) });
      items.push({ label: 'Retirer du projet', run: () => removeVideo(v.id) });
      return items;
    }
    if (row.type === 'audio') {
      return [
        { label: 'Retirer du projet', run: () => removeAudio(row.ref.id) },
        { label: 'Renommer', run: () => startRename(row.id) },
      ];
    }
    if (row.type === 'band') {
      const b = row.ref;
      return [
        { label: 'Renommer', run: () => startRename(row.id) },
        {
          label: 'Définir la langue de découpe',
          sub: () => Object.entries(SYLLABLES).map(([k, label]) => ({ label, checked: b.syllable === k, run: () => setSyllable(b.id, k) })),
        },
        {
          label: 'Définir l’instrumental',
          sub: () => [
            { label: 'Aucun', checked: b.instrumental == null, run: () => setInstrumental(b.id, null) },
            ...p.audios.map((a) => ({ label: a.name, checked: b.instrumental === a.id, run: () => setInstrumental(b.id, a.id) })),
          ],
        },
        { label: 'Supprimer', enabled: p.bands.length > 1, run: () => deleteBand(b.id) },
      ];
    }
    return [];
  }

  const menu = makeMenu(host, menuEl, subEl, () => rowEl(focusedId));
  function openMenuFor(id, at) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const items = menuItems(row);
    if (!items.length) {
      say('Pas de menu pour cet élément');
      return;
    }
    let x;
    let y;
    if (at) [x, y] = at;
    else {
      const i = rows.indexOf(row);
      const hr = host.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      x = sr.left - hr.left + 10 + (row.depth > 1 ? (row.depth - 1) * INDENT : 0) + 24;
      y = sr.top - hr.top + LIST_PAD + (i + 1) * ROW_H - scroller.scrollTop;
    }
    menu.open(items, x, y);
  }

  /* ── keyboard (handle_tree_keyboard) ── */
  list.addEventListener('keydown', (e) => {
    if (renaming) return;
    const i = rows.findIndex((r) => r.id === focusedId);
    const row = rows[i];
    if (!row) return;
    const go = (j) => focusRow(rows[clamp(j, 0, rows.length - 1)].id);
    const page = Math.max(1, Math.floor(scroller.clientHeight / ROW_H));
    const k = e.key;
    if (k === 'ArrowDown') go(i + 1);
    else if (k === 'ArrowUp') go(i - 1);
    else if (k === 'PageDown') go(i + page);
    else if (k === 'PageUp') go(i - page);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(rows.length - 1);
    else if (k === 'ArrowRight') {
      if (row.type === 'group' && !p.expanded[row.group]) {
        toggleGroup(row.group);
        rowEl(row.id)?.focus({ preventScroll: true });
      } else go(i + 1);
    } else if (k === 'ArrowLeft') {
      if (row.type === 'group' && p.expanded[row.group]) {
        toggleGroup(row.group);
        rowEl(row.id)?.focus({ preventScroll: true });
      } else if (row.type === 'video' && row.depth === 3) focusRow(`v:${row.ref.proxyOf}`);
      else if (row.group && row.type !== 'group') focusRow(`g:${row.group}`);
    } else if (k === 'Enter' || k === ' ') {
      activate(row);
      rowEl(row.id)?.focus({ preventScroll: true });
    } else if (k === 'F2') startRename(row.id);
    else if ((k === 'F10' && e.shiftKey) || k === 'ContextMenu') openMenuFor(row.id);
    else if (k === 'Delete') {
      if (row.type === 'video') removeVideo(row.ref.id);
      else if (row.type === 'audio') removeAudio(row.ref.id);
      else if (row.type === 'band') deleteBand(row.ref.id);
      else return;
      rowEl(focusedId)?.focus({ preventScroll: true });
    } else return;
    e.preventDefault();
  });

  /* ── pointer: click selects (groups toggle, bands load), double-click uses ── */
  list.addEventListener('click', (e) => {
    const el = e.target.closest('.pj-row');
    if (!el || renaming) return;
    const row = rows.find((r) => r.id === el.dataset.id);
    if (!row) return;
    focusRow(row.id, { select: true });
    if (row.type === 'group') toggleGroup(row.group);
    else if (row.type === 'band') activateBand(row.ref.id);
  });
  list.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.pj-row');
    const row = el && rows.find((r) => r.id === el.dataset.id);
    if (row?.type === 'video') useVideo(row.ref.id);
  });
  list.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.pj-row');
    if (!el) return;
    e.preventDefault();
    focusRow(el.dataset.id, { select: true });
    const hr = host.getBoundingClientRect();
    openMenuFor(el.dataset.id, [e.clientX - hr.left, e.clientY - hr.top]);
  });

  /* ── sliding hover pill ── */
  list.addEventListener('pointermove', (e) => {
    const el = e.target.closest('.pj-row');
    if (!el) return;
    const i = rows.findIndex((r) => r.id === el.dataset.id);
    pill.style.setProperty('--y', `${i * ROW_H}px`);
    pill.setAttribute('data-show', '');
  });
  list.addEventListener('pointerleave', () => pill.removeAttribute('data-show'));

  /* ── bar under the panel (touch has no right click, no F2) ── */
  host.querySelectorAll('[data-tree-cmd]').forEach((b) =>
    b.addEventListener('click', () => {
      const cmd = b.dataset.treeCmd;
      if (cmd === 'menu') {
        const hr = host.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        if (!rows.some((r) => r.id === focusedId)) return;
        ensureVisible(focusedId);
        const items = menuItems(rows.find((r) => r.id === focusedId));
        if (!items.length) {
          say('Pas de menu pour cet élément');
          rowEl(focusedId)?.focus({ preventScroll: true });
          return;
        }
        menu.open(items, br.left - hr.left, br.top - hr.top, { above: true });
      } else if (cmd === 'rename') startRename(focusedId);
      else if (cmd === 'reset') {
        p = demoProject();
        focusedId = 'root';
        selectedId = null;
        render();
        say('Projet de démonstration réinitialisé');
      }
    }),
  );

  /* ── « Créer un proxy » ── */
  const proxy = initProxyDialog(root, ctx, (source, { w, h, encoder }) => {
    // register_generated_proxy: replaces the old proxy, keeps « Par défaut »
    const old = proxyOfSource(source);
    const wasDefault = old && p.defaultVideo === old.id;
    if (old) p.videos = p.videos.filter((v) => v.id !== old.id);
    const id = p.nextId++;
    const sourcePath = `D:\\Doublage\\${source.name}.${source.ext}`;
    const name = `${safeStem(BR_PATH)}_${stableHashHex(BR_PATH)}_${stableHashHex(sourcePath)}_${w}x${h}`;
    const at = p.videos.indexOf(source) + 1;
    p.videos.splice(at, 0, { id, name, ext: ENCODERS[encoder], w, h, proxyOf: source.id, encoder });
    if (wasDefault) p.defaultVideo = id;
    p.activeVideo = id;
    p.expanded.videos = true;
    focusedId = `v:${id}`;
    selectedId = focusedId;
    render();
    ensureVisible(focusedId);
    rowEl(focusedId)?.focus({ preventScroll: true });
    ctx.announce('Proxy créé et chargé pour la lecture.', { priority: true });
  });

  render({ animate: false });
}

/* ── Context menu with one level of submenu. Items: {label, run?, sub?, enabled?, checked?} ── */
function makeMenu(host, panel, subPanel, restoreTarget) {
  let items = [];
  let subItems = [];
  let subOwner = -1;

  const build = (el, list) => {
    el.innerHTML = '';
    list.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dropdown__item';
      b.tabIndex = -1;
      b.dataset.index = String(i);
      b.setAttribute('role', it.checked != null ? 'menuitemradio' : 'menuitem');
      if (it.checked != null) b.setAttribute('aria-checked', String(it.checked));
      if (it.sub) {
        b.setAttribute('aria-haspopup', 'menu');
        b.setAttribute('aria-expanded', 'false');
      }
      if (it.enabled === false) b.setAttribute('aria-disabled', 'true');
      b.textContent = it.label;
      el.append(b);
    });
  };
  const buttons = (el) => [...el.querySelectorAll('.dropdown__item')];
  const place = (el, x, y, { above = false } = {}) => {
    el.hidden = false;
    el.style.left = '0px';
    el.style.top = '0px';
    const hr = host.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x;
    let top = above ? y - h - 4 : y;
    // keep inside the viewport
    left = clamp(left, 8 - hr.left, window.innerWidth - 8 - hr.left - w);
    if (!above && hr.top + top + h > window.innerHeight - 8) top = Math.max(y - h - 40, 8 - hr.top);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  };

  function closeSub(focusOwner = false) {
    if (subPanel.hidden) return;
    subPanel.hidden = true;
    const owner = buttons(panel)[subOwner];
    owner?.setAttribute('aria-expanded', 'false');
    if (focusOwner) owner?.focus();
    subOwner = -1;
  }
  function close(restore = true) {
    if (panel.hidden) return;
    closeSub();
    panel.hidden = true;
    document.removeEventListener('pointerdown', outside, true);
    if (restore) restoreTarget()?.focus({ preventScroll: true });
  }
  function outside(e) {
    if (!panel.contains(e.target) && !subPanel.contains(e.target)) close(false);
  }
  function openSub(i, focusFirst) {
    const it = items[i];
    if (!it?.sub) return;
    closeSub();
    subItems = it.sub();
    subOwner = i;
    build(subPanel, subItems);
    const owner = buttons(panel)[i];
    owner.setAttribute('aria-expanded', 'true');
    const hr = host.getBoundingClientRect();
    const or = owner.getBoundingClientRect();
    subPanel.hidden = false;
    const w = subPanel.offsetWidth;
    let x = or.right - hr.left + 2;
    let y = or.top - hr.top - 4;
    if (or.right + w + 8 > window.innerWidth) x = or.left - hr.left - w - 2;
    if (hr.left + x < 8) {
      // phone: no room on either side, drop below the owner item
      x = or.left - hr.left + 16;
      y = or.bottom - hr.top + 2;
    }
    place(subPanel, x, y);
    if (focusFirst) buttons(subPanel)[0]?.focus();
  }
  function run(list, i) {
    const it = list[i];
    if (!it || it.enabled === false) return;
    close(!it.keepFocus);
    it.run?.();
  }

  const onKey = (el, isSub) => (e) => {
    const list = buttons(el);
    const i = list.indexOf(document.activeElement);
    const data = isSub ? subItems : items;
    const k = e.key;
    if (k === 'ArrowDown') list[(i + 1) % list.length]?.focus();
    else if (k === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus();
    else if (k === 'Home') list[0]?.focus();
    else if (k === 'End') list.at(-1)?.focus();
    else if (k === 'ArrowRight' && !isSub && data[i]?.sub) openSub(i, true);
    else if (k === 'ArrowLeft' && isSub) closeSub(true);
    else if (k === 'Escape') (isSub ? closeSub(true) : close());
    else if (k === 'Tab') close();
    else if (k === 'Enter' || k === ' ') {
      if (!isSub && data[i]?.sub) openSub(i, true);
      else run(data, i);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };
  panel.addEventListener('keydown', onKey(panel, false));
  subPanel.addEventListener('keydown', onKey(subPanel, true));
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('.dropdown__item');
    if (!b) return;
    const i = Number(b.dataset.index);
    if (items[i]?.sub) openSub(i, e.detail === 0);
    else run(items, i);
  });
  subPanel.addEventListener('click', (e) => {
    const b = e.target.closest('.dropdown__item');
    if (b) run(subItems, Number(b.dataset.index));
  });
  panel.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.dropdown__item');
    if (!b || e.pointerType !== 'mouse') return;
    b.focus({ preventScroll: true });
    const i = Number(b.dataset.index);
    if (items[i]?.sub) {
      if (subOwner !== i) openSub(i, false);
    } else closeSub();
  });
  subPanel.addEventListener('pointerover', (e) => e.target.closest('.dropdown__item')?.focus({ preventScroll: true }));

  return {
    open(list, x, y, opts = {}) {
      close(false);
      items = list;
      build(panel, items);
      place(panel, x, y, opts);
      buttons(panel)[0]?.focus({ preventScroll: true });
      document.addEventListener('pointerdown', outside, true);
    },
    close,
  };
}

/* ── « Créer un proxy » (proxy_modal.rs): presets, encoder, CRF 18–32 ── */
function initProxyDialog(root, ctx, onCreate) {
  const dlg = root.querySelector('[data-proxy]');
  if (!dlg) return { open() {} };
  const source = dlg.querySelector('[data-proxy-source]');
  const target = dlg.querySelector('[data-proxy-target]');
  const encBtn = dlg.querySelector('[data-enc-btn]');
  const encList = dlg.querySelector('#pj-enc-list');
  const crfBox = dlg.querySelector('.pj-proxy__crf');
  const crfOut = dlg.querySelector('[data-crf-out]');
  const crfHint = dlg.querySelector('[data-crf-hint]');
  const create = dlg.querySelector('[data-proxy-create]');
  const progress = dlg.querySelector('[data-proxy-progress]');
  const bar = dlg.querySelector('[data-proxy-bar]');
  const pct = dlg.querySelector('[data-proxy-pct]');
  const title = dlg.querySelector('#pj-proxy-title');

  let src = null;
  let encoder = 'ProRes Proxy'; // ProxyEncoder::default()
  let crf = 24;
  let timer = 0;
  let returnFocus = null;

  const maxH = () => Number(dlg.querySelector('input[name="pj-res"]:checked')?.value || 1080);
  const size = () => fitToMaxHeight(src.w, src.h, maxH());
  const sync = () => {
    const [w, h] = size();
    target.textContent = `${w} x ${h}`;
    encBtn.textContent = encoder;
    encList.querySelectorAll('[data-enc]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.enc === encoder)));
    const fixed = encoder !== 'H.264';
    crfBox.toggleAttribute('data-fixed', fixed);
    crfBox.querySelectorAll('button').forEach((b) => {
      b.disabled = fixed || (b.dataset.crf === '-1' ? crf <= 18 : crf >= 32);
    });
    crfOut.textContent = `CRF ${crf}`;
    crfHint.textContent = fixed ? 'La qualité est fixée par l’encodeur sélectionné.' : 'CRF plus bas = meilleure qualité, fichier plus lourd.';
  };

  const drop = ctx.makeDropdown(encBtn, encList);
  encList.querySelectorAll('[data-enc]').forEach((b) =>
    b.addEventListener('click', () => {
      encoder = b.dataset.enc;
      sync();
      encBtn.focus();
      ctx.announce(`Encodeur : ${encoder}`);
    }),
  );
  dlg.querySelectorAll('input[name="pj-res"]').forEach((r) =>
    r.addEventListener('change', () => {
      sync();
      ctx.announce(`Résolution max : ${maxH()}p, cible : ${target.textContent}`);
    }),
  );
  crfBox.querySelectorAll('[data-crf]').forEach((b) =>
    b.addEventListener('click', () => {
      crf = clamp(crf + Number(b.dataset.crf), 18, 32);
      sync();
      ctx.announce(`Qualité : CRF ${crf}`);
    }),
  );

  const stop = () => {
    clearInterval(timer);
    timer = 0;
    progress.hidden = true;
    create.hidden = false;
  };
  create.addEventListener('click', () => {
    const [w, h] = size();
    const done = () => {
      stop();
      returnFocus = null; // focus goes to the new proxy row instead
      dlg.close();
      onCreate(src, { w, h, encoder });
    };
    if (ctx.settings.get().reduceMotion) return done();
    // A stand-in for the ffmpeg job: the app reports this as a progress bar.
    create.hidden = true;
    progress.hidden = false;
    let v = 0;
    ctx.announce('Création du proxy');
    timer = setInterval(() => {
      v = Math.min(100, v + 7 + Math.random() * 9);
      bar.style.transform = `scaleX(${v / 100})`;
      pct.textContent = `${Math.round(v)} %`;
      if (v >= 100) done();
    }, 90);
  });
  dlg.addEventListener('close', () => {
    stop();
    drop.close(false);
    returnFocus?.focus({ preventScroll: true });
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });

  return {
    open(video, { recreate = false } = {}) {
      src = video;
      returnFocus = document.activeElement;
      source.textContent = video.w && video.h ? `${video.name} · ${video.w} x ${video.h}` : video.name;
      title.textContent = recreate ? 'Recréer le proxy' : 'Créer un proxy';
      const def = dlg.querySelector('input[name="pj-res"][value="1080"]');
      if (def) def.checked = true; // selected_max_height: 1080
      encoder = 'ProRes Proxy';
      crf = 24;
      stop();
      bar.style.transform = 'scaleX(0)';
      pct.textContent = '0 %';
      sync();
      dlg.showModal();
      dlg.querySelector('input[name="pj-res"]:checked')?.focus();
    },
  };
}

/* ═══════════════════════ Automatisation ═══════════════════════ */

// ui/automation.rs geometry
const NODE_HEADER_H = 34;
const NODE_W = 250;
const SET_TRACK_NODE_W = 270;
const SET_TRACK_NODE_H = 56;
const ROLE_ROW_H = 27;
const ROLE_START_Y = 98;
const PIN = 20;
const TRACKS = 4; // rythmo_layout::track_count()

const CAST = { MAYA: '#ff8033', 'THÉO': '#33cccc', 'INÈS': '#cc4dff' };
const SCENE = [-28, 244]; // frames the demo scene spans, labels included
const CENTER = (SCENE[0] + SCENE[1]) / 2;

function demoLines() {
  let id = 1;
  const L = (character, text, start, dur, track) => ({ id: id++, character, color: CAST[character], text, start, dur, track, kind: 'dialogue', note: '', karaoke: false });
  return [
    L('MAYA', 'T’as récupéré la vidéo ?', 0, 36, 2),
    L('THÉO', 'Oui, et le SRT de la VO.', 44, 36, 0),
    L('INÈS', 'Glisse tout dans le projet.', 88, 38, 3),
    L('MAYA', '(ah)', 134, 12, 1),
    L('THÉO', 'Un seul fichier à envoyer ?', 154, 34, 3),
    L('INÈS', 'Un seul. On double ce soir.', 196, 36, 1),
  ];
}

function demoGraph() {
  return {
    nodes: [
      { id: 'entry', kind: 'entry', x: 0, y: 0, enabled: false },
      { id: 'if', kind: 'if', x: 0, y: 0, roles: ['MAYA', 'THÉO', 'INÈS'] },
      { id: 'set-a', kind: 'set', x: 0, y: 0, track: 0 },
      { id: 'set-b', kind: 'set', x: 0, y: 0, track: 1 },
      { id: 'set-c', kind: 'set', x: 0, y: 0, track: 2 },
    ],
    edges: [
      { from: 'entry', kind: 'exec', branch: 'next', to: 'if' },
      { from: 'entry', kind: 'line', branch: 'next', to: 'if' },
      { from: 'if', kind: 'exec', branch: 'role:MAYA', to: 'set-a' },
      { from: 'if', kind: 'exec', branch: 'role:THÉO', to: 'set-b' },
      { from: 'if', kind: 'exec', branch: 'role:INÈS', to: 'set-c' },
      { from: 'entry', kind: 'line', branch: 'next', to: 'set-a' },
      { from: 'entry', kind: 'line', branch: 'next', to: 'set-b' },
      { from: 'entry', kind: 'line', branch: 'next', to: 'set-c' },
    ],
  };
}

const nodeW = (n) => (n.kind === 'set' ? SET_TRACK_NODE_W : NODE_W);
const nodeH = (n) =>
  n.kind === 'entry' ? 112 : n.kind === 'if' ? ROLE_START_Y + Math.max(1, n.roles.length) * ROLE_ROW_H + 42 : SET_TRACK_NODE_H;
// pin rects relative to the node (exec_input_rect, line_input_rect, …)
const execIn = (n) => (n.kind === 'entry' ? null : { x: -PIN / 2, y: n.kind === 'set' ? 3 : NODE_HEADER_H + 7 });
const lineIn = (n) => (n.kind === 'entry' ? null : { x: -PIN / 2, y: n.kind === 'set' ? 32 : NODE_HEADER_H + 32 });
const lineOut = (n) => (n.kind === 'entry' ? { x: nodeW(n) - PIN / 2, y: NODE_HEADER_H + 34 } : null);
const execOuts = (n) =>
  n.kind === 'entry'
    ? [{ branch: 'next', x: nodeW(n) - PIN / 2, y: NODE_HEADER_H + 7 }]
    : n.kind === 'if'
      ? n.roles.map((r, i) => ({ branch: `role:${r}`, role: r, x: nodeW(n) - PIN / 2, y: ROLE_START_Y + i * ROLE_ROW_H }))
      : [];
const pinCenter = (n, pin) => ({ x: n.x + pin.x + PIN / 2, y: n.y + pin.y + PIN / 2 });
const edgeKey = (e) => `${e.from}|${e.kind}|${e.branch}|${e.to}`;

function nodeTitle(n) {
  if (n.kind === 'entry') return 'Pour chaque ligne';
  if (n.kind === 'if') return 'Si rôle';
  return `Définir piste ${n.track}`;
}

/* automation.rs: AutomationGraph::connect validation, without mutating */
function canConnect(g, edge) {
  const src = g.nodes.find((n) => n.id === edge.from);
  const dst = g.nodes.find((n) => n.id === edge.to);
  if (!src || !dst || src === dst || dst.kind === 'entry') return false;
  const out =
    (edge.kind === 'exec' && edge.branch === 'next' && src.kind === 'entry') ||
    (edge.kind === 'exec' && edge.branch.startsWith('role:') && src.kind === 'if' && src.roles.includes(edge.branch.slice(5))) ||
    (edge.kind === 'line' && edge.branch === 'next' && src.kind === 'entry');
  const inp = (edge.kind === 'exec' && (dst.kind === 'if' || dst.kind === 'set')) || (edge.kind === 'line' && (dst.kind === 'if' || dst.kind === 'set'));
  if (!out || !inp) return false;
  // would_create_cycle on the remaining edges of that kind
  const edges = g.edges.filter(
    (x) => !(x.kind === edge.kind && x.to === edge.to) && !(edge.kind === 'exec' && x.kind === 'exec' && x.from === edge.from && x.branch === edge.branch),
  );
  const stack = [edge.to];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === edge.from) return false;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const x of edges) if (x.kind === edge.kind && x.from === id) stack.push(x.to);
  }
  return true;
}
function connect(g, edge) {
  if (!canConnect(g, edge)) return false;
  // inputs are single-link; execution outputs too, LIGNE may fan out
  g.edges = g.edges.filter(
    (x) => !(x.kind === edge.kind && x.to === edge.to) && !(edge.kind === 'exec' && x.kind === 'exec' && x.from === edge.from && x.branch === edge.branch),
  );
  g.edges.push(edge);
  return true;
}

/* automation.rs: desired_track_moves, plus the walked path for the display */
function evaluate(g, lines) {
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const out = new Map();
  const lineSrc = new Map();
  for (const e of g.edges) {
    if (e.kind === 'exec') out.set(`${e.from}|${e.branch}`, e.to);
    else lineSrc.set(e.to, e.from);
  }
  const reaches = (target, entry) => lineSrc.get(target) === entry; // no reroute nodes in this demo
  const entries = g.nodes.filter((n) => n.kind === 'entry' && n.enabled).map((n) => n.id);
  return lines.map((line) => {
    let track = null;
    const path = [];
    for (const entry of entries) {
      let next = out.get(`${entry}|next`);
      const visited = new Set();
      let from = { id: entry, branch: 'next' };
      while (next != null && !visited.has(next)) {
        visited.add(next);
        const node = nodes.get(next);
        if (!node || !reaches(node.id, entry)) break;
        path.push(`${from.id}|exec|${from.branch}|${node.id}`, `${entry}|line|next|${node.id}`);
        if (node.kind === 'if') {
          const branch = `role:${line.character}`;
          const to = out.get(`${node.id}|${branch}`);
          path.push(`role:${node.id}:${line.character}`);
          if (to == null) break;
          from = { id: node.id, branch };
          next = to;
        } else if (node.kind === 'set') {
          track = Math.min(node.track, TRACKS - 1);
          path.push(`node:${node.id}`);
          break;
        } else break;
      }
    }
    return { line, track, path };
  });
}

function initAutomation(root, ctx) {
  const scroll = root.querySelector('[data-auto-scroll]');
  const canvas = root.querySelector('[data-auto-canvas]');
  const wires = root.querySelector('[data-auto-wires]');
  const host = root.querySelector('[data-auto-band]');
  const statusEl = root.querySelector('[data-auto-status]');
  const stateEl = root.querySelector('[data-auto-state]');
  if (!canvas || !host || !ctx.Band) return;
  const reduce = () => ctx.settings.get().reduceMotion;

  let g = demoGraph();
  let lines = demoLines();
  let moved = false; // the visitor dragged a node: keep their layout
  let selected = null;
  let pending = null; // { from, kind, branch, key }
  let picker = null;
  const timers = new Set();

  /* ── layout: three columns centred in the canvas ── */
  const CH = 336;
  function layoutNodes() {
    const W = scroll.clientWidth || 1000;
    const gap = clamp((W - 770 - 56) / 2, 44, 130);
    const m = Math.max(28, (W - 770 - 2 * gap) / 2);
    const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    Object.assign(by.entry, { x: m, y: 42 });
    Object.assign(by.if, { x: m + NODE_W + gap, y: 42 });
    const sx = m + 2 * NODE_W + 2 * gap;
    ['set-a', 'set-b', 'set-c'].forEach((id, i) => by[id] && Object.assign(by[id], { x: sx, y: 70 + i * 84 }));
  }
  function sizeCanvas() {
    const right = Math.max(...g.nodes.map((n) => n.x + nodeW(n))) + 28;
    const bottom = Math.max(CH, ...g.nodes.map((n) => n.y + nodeH(n) + 28));
    canvas.style.setProperty('--cw', `${Math.max(scroll.clientWidth, right)}px`);
    canvas.style.setProperty('--ch', `${bottom}px`);
  }

  /* ── the band ── */
  const fitScale = (w) => clamp(w / ((SCENE[1] - SCENE[0]) * 6), 0.6, 1);
  const band = new ctx.Band(host, {
    project: { lines, markers: [], strokes: [] },
    tracks: TRACKS,
    startFrame: CENTER,
    scale: fitScale(host.clientWidth || 1000),
    label: 'Bande rythmo de démonstration de l’automatisation',
    settings: ctx.settings,
    announce: ctx.announce,
  });
  band.on('resize', ({ width }) => {
    const s = fitScale(width);
    if (Math.abs(s - band.s) > 0.01) {
      band.opts.scale = s;
      band.layout();
    }
  });

  /* ── track tweens: lines glide to their track ── */
  const tweens = new Map();
  let raf = 0;
  function tweenTrack(line, to, delay = 0) {
    if (reduce()) {
      tweens.delete(line.id);
      line.track = to;
      band.invalidate();
      return;
    }
    tweens.set(line.id, { line, from: line.track, to, t0: performance.now() + delay, dur: 340 });
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step(now) {
    raf = 0;
    for (const [id, t] of tweens) {
      const k = clamp((now - t.t0) / t.dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 4);
      t.line.track = t.from + (t.to - t.from) * e;
      if (k >= 1) {
        t.line.track = t.to;
        tweens.delete(id);
      }
    }
    band.invalidate();
    if (tweens.size) raf = requestAnimationFrame(step);
  }
  function stopMotion() {
    timers.forEach(clearTimeout);
    timers.clear();
    for (const t of tweens.values()) t.line.track = Math.round(t.to);
    tweens.clear();
    cancelAnimationFrame(raf);
    raf = 0;
  }
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  /* ── evaluation: « À chaque mise à jour » ── */
  const entry = () => g.nodes.find((n) => n.kind === 'entry');
  function apply({ walk = false, announceMoves = false } = {}) {
    const results = evaluate(g, lines);
    if (walk && !reduce()) {
      const order = [...results].sort((a, b) => a.line.start - b.line.start);
      order.forEach((r, i) =>
        later(() => {
          flash(r.path);
          if (r.track != null && Math.round(r.line.track) !== r.track) tweenTrack(r.line, r.track);
        }, i * 170),
      );
    } else {
      const back = [];
      for (const r of results) {
        const target = tweens.get(r.line.id)?.to ?? r.line.track;
        if (r.track != null && target !== r.track) {
          tweenTrack(r.line, r.track);
          back.push(r);
        }
      }
      if (announceMoves && back.length) {
        // spoken like the app's line labels: tracks 1 to 4 (state.rs line_accessibility_label)
        ctx.announce(back.map((r) => `${r.line.character} revient sur la piste ${r.track + 1}`).join('. '));
      }
    }
    status();
    return results;
  }

  function mapping() {
    const ifNode = g.nodes.find((n) => n.kind === 'if');
    return projectRoles().map((role) => {
      const e = ifNode && g.edges.find((x) => x.kind === 'exec' && x.from === ifNode.id && x.branch === `role:${role}`);
      const set = e && g.nodes.find((n) => n.id === e.to);
      const fed = set && g.edges.some((x) => x.kind === 'line' && x.to === set.id && x.from === 'entry');
      return { role, track: set && fed ? set.track : null };
    });
  }
  function status() {
    const on = !!entry()?.enabled;
    stateEl.textContent = on ? 'Activée' : 'Désactivée';
    stateEl.toggleAttribute('data-on', on);
    if (!on) {
      statusEl.innerHTML = 'Désactivée&nbsp;: les répliques restent où elles sont. Cochez <b>«&nbsp;Activer&nbsp;»</b> dans «&nbsp;Pour chaque ligne&nbsp;».';
      return;
    }
    // node values, as the « Définir piste » nodes show them (0 = top track)
    const parts = mapping().map(({ role, track }) =>
      track == null ? `${esc(role)}&nbsp;: ne bouge pas` : `<b>${esc(role)}</b>&nbsp;→ Définir piste ${track}`,
    );
    statusEl.innerHTML = `${parts.join(' · ')}. Glissez une réplique sur une autre piste&nbsp;: elle revient.`;
  }

  /* ── walked path highlight (display only; the app applies it at once) ── */
  function flash(path) {
    const hot = [];
    for (const key of path) {
      if (key.startsWith('role:')) {
        const [, node, role] = key.split(':');
        const el = canvas.querySelector(`[data-role-label="${CSS.escape(node)}|${CSS.escape(role)}"]`);
        if (el) hot.push(el);
      } else if (key.startsWith('node:')) {
        const el = canvas.querySelector(`.pj-node[data-node="${CSS.escape(key.slice(5))}"]`);
        if (el) hot.push(el);
      } else {
        const el = wires.querySelector(`[data-edge="${CSS.escape(key)}"]`);
        if (el) hot.push(el);
      }
    }
    hot.forEach((el) => el.classList.add('is-hot'));
    later(() => hot.forEach((el) => el.classList.remove('is-hot')), 300);
  }

  /* ── rendering ── */
  const NS = 'http://www.w3.org/2000/svg';
  function renderWires() {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    wires.innerHTML = '';
    for (const e of g.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const out = e.kind === 'exec' ? execOuts(a).find((o) => o.branch === e.branch) : lineOut(a);
      const inp = e.kind === 'exec' ? execIn(b) : lineIn(b);
      if (!out || !inp) continue;
      const p1 = pinCenter(a, out);
      const p2 = pinCenter(b, inp);
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', p1.x);
      l.setAttribute('y1', p1.y);
      l.setAttribute('x2', p2.x);
      l.setAttribute('y2', p2.y);
      l.setAttribute('class', e.kind === 'exec' ? 'is-exec' : 'is-line');
      l.dataset.edge = edgeKey(e);
      wires.append(l);
    }
    if (pending) {
      const a = byId.get(pending.from);
      const out = pending.kind === 'exec' ? execOuts(a).find((o) => o.branch === pending.branch) : lineOut(a);
      if (out) {
        const p1 = pinCenter(a, out);
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', p1.x);
        l.setAttribute('y1', p1.y);
        l.setAttribute('x2', pending.x ?? p1.x);
        l.setAttribute('y2', pending.y ?? p1.y);
        l.setAttribute('class', `${pending.kind === 'exec' ? 'is-exec' : 'is-line'} is-pending`);
        l.dataset.pending = '';
        wires.append(l);
      }
    }
  }

  const connectedTo = (n, kind, branch) => {
    const e = g.edges.find((x) => x.from === n.id && x.kind === kind && x.branch === branch);
    return e ? g.nodes.find((m) => m.id === e.to) : null;
  };
  const describeTargets = (n, kind, branch) => {
    if (kind === 'line') {
      const n2 = g.edges.filter((x) => x.from === n.id && x.kind === 'line').length;
      return n2 ? `reliée à ${n2} nœud${n2 > 1 ? 's' : ''}` : 'non reliée';
    }
    const to = connectedTo(n, kind, branch);
    return to ? `reliée à ${nodeTitle(to)}` : 'non reliée';
  };

  function pinButton(n, pin, { kind, dir, branch, label }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pj-pin pj-pin--${kind} pj-pin--${dir}`;
    b.style.left = `${pin.x}px`;
    b.style.top = `${pin.y}px`;
    b.dataset.key = `${n.id}:${dir}:${kind}:${branch || ''}`;
    b.dataset.node = n.id;
    b.dataset.kind = kind;
    b.dataset.dir = dir;
    if (branch) b.dataset.branch = branch;
    if (kind === 'exec') b.innerHTML = SVG_EXEC;
    b.setAttribute('aria-label', label);
    if (dir === 'in') {
      const ok = pending && pending.kind === kind && canConnect(g, { from: pending.from, kind, branch: pending.branch, to: n.id });
      b.tabIndex = ok ? 0 : -1;
      if (ok) b.setAttribute('data-target', '');
      else b.setAttribute('aria-disabled', 'true');
    }
    if (pending && dir === 'out' && pending.key === b.dataset.key) b.setAttribute('data-source', '');
    return b;
  }

  function renderNodes() {
    const keep = document.activeElement?.closest?.('[data-auto-canvas]') ? document.activeElement.dataset.key : null;
    canvas.querySelectorAll('.pj-node, .pj-picker').forEach((el) => el.remove());
    for (const n of g.nodes) {
      const el = document.createElement('div');
      el.className = `pj-node pj-node--${n.kind}${selected === n.id ? ' is-selected' : ''}`;
      el.dataset.node = n.id;
      el.style.setProperty('--x', `${n.x}px`);
      el.style.setProperty('--y', `${n.y}px`);
      el.style.height = `${nodeH(n)}px`;
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', `Nœud ${nodeTitle(n)}`);
      const head = document.createElement('div');
      head.className = 'pj-node__head';
      head.textContent = n.kind === 'set' ? 'Définir piste' : nodeTitle(n);
      head.setAttribute('aria-hidden', 'true');
      el.append(head);

      if (n.kind === 'entry') {
        const lab = document.createElement('label');
        lab.className = 'pj-node__check';
        lab.innerHTML = `<input type="checkbox" data-key="entry:check" ${n.enabled ? 'checked' : ''} /><span class="pj-node__box" aria-hidden="true"></span><span class="pj-node__checklabel">Activer</span>`;
        el.append(lab);
        const lo = lineOut(n);
        el.insertAdjacentHTML('beforeend', `<span class="pj-node__pinlabel" style="left: ${nodeW(n) - 76}px; width: 56px; top: ${lo.y - 1}px; text-align: right" aria-hidden="true">LIGNE</span>`);
        el.append(
          pinButton(n, execOuts(n)[0], { kind: 'exec', dir: 'out', branch: 'next', label: `Pour chaque ligne : sortie d’exécution, ${describeTargets(n, 'exec', 'next')}` }),
          pinButton(n, lo, { kind: 'line', dir: 'out', branch: 'next', label: `Pour chaque ligne : sortie LIGNE, ${describeTargets(n, 'line', 'next')}` }),
        );
      }
      if (n.kind !== 'entry') {
        const li = lineIn(n);
        el.insertAdjacentHTML('beforeend', `<span class="pj-node__pinlabel" style="left: 13px; top: ${li.y - 1}px" aria-hidden="true">LIGNE</span>`);
        el.append(
          pinButton(n, execIn(n), { kind: 'exec', dir: 'in', label: `${nodeTitle(n)} : entrée d’exécution` }),
          pinButton(n, li, { kind: 'line', dir: 'in', label: `${nodeTitle(n)} : entrée LIGNE` }),
        );
      }
      if (n.kind === 'if') {
        if (!n.roles.length) {
          el.insertAdjacentHTML('beforeend', `<span class="pj-node__empty" style="top: ${ROLE_START_Y - 4}px">Aucun rôle sélectionné</span>`);
        }
        n.roles.forEach((role, i) => {
          const y = ROLE_START_Y + i * ROLE_ROW_H;
          const x = document.createElement('button');
          x.type = 'button';
          x.className = 'pj-node__x';
          x.style.top = `${y + 1}px`;
          x.innerHTML = SVG_X;
          x.dataset.key = `if:x:${role}`;
          x.setAttribute('aria-label', `Retirer le rôle ${role}`);
          x.addEventListener('click', () => removeRole(n, role));
          const lab = document.createElement('span');
          lab.className = 'pj-node__role';
          lab.style.top = `${y - 2}px`;
          lab.textContent = role;
          lab.dataset.roleLabel = `${n.id}|${role}`;
          const o = execOuts(n)[i];
          const pin = pinButton(n, o, { kind: 'exec', dir: 'out', branch: o.branch, label: `Si rôle ${role} : sortie d’exécution, ${describeTargets(n, 'exec', o.branch)}` });
          el.append(x, lab, pin);
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'pj-node__add';
        add.textContent = '+ Ajouter un rôle';
        add.dataset.key = 'if:add';
        add.setAttribute('aria-haspopup', 'true');
        add.setAttribute('aria-expanded', String(!!picker));
        add.addEventListener('click', () => (picker ? closePicker(true) : openPicker(n)));
        el.append(add);
      }
      if (n.kind === 'set') {
        const w = nodeW(n);
        const minus = document.createElement('button');
        minus.type = 'button';
        minus.className = 'pj-node__step';
        minus.style.left = `${w - 86}px`;
        minus.innerHTML = SVG_MINUS;
        minus.dataset.key = `${n.id}:-`;
        minus.disabled = n.track <= 0;
        minus.setAttribute('aria-label', `Définir piste ${n.track} : piste précédente`);
        minus.addEventListener('click', () => setTrack(n, n.track - 1));
        const val = document.createElement('span');
        val.className = 'pj-node__val tnum';
        val.textContent = String(n.track);
        val.setAttribute('aria-hidden', 'true');
        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'pj-node__step';
        plus.style.left = `${w - 30}px`;
        plus.innerHTML = SVG_PLUS;
        plus.dataset.key = `${n.id}:+`;
        plus.disabled = n.track >= TRACKS - 1;
        plus.setAttribute('aria-label', `Définir piste ${n.track} : piste suivante`);
        plus.addEventListener('click', () => setTrack(n, n.track + 1));
        el.append(minus, val, plus);
      }
      canvas.append(el);
    }
    if (picker) renderPicker();
    renderWires();
    sizeCanvas();
    if (keep) (canvas.querySelector(`[data-key="${CSS.escape(keep)}"]`) || canvas.querySelector('[data-key="if:add"]'))?.focus({ preventScroll: true });
  }
  const render = () => renderNodes();

  /* ── graph edits ── */
  function setEnabled(on) {
    const e = entry();
    e.enabled = on;
    stopMotion();
    if (on) {
      const results = apply({ walk: true });
      const n = results.filter((r) => r.track != null && Math.round(r.line.track) !== r.track).length;
      ctx.announce(`Automatisation activée. ${n ? `${n} réplique${n > 1 ? 's' : ''} rejoignent la piste de leur rôle.` : 'Toutes les répliques sont déjà sur leur piste.'}`);
    } else {
      status();
      ctx.announce('Automatisation désactivée. Les répliques restent où elles sont.');
    }
  }
  function setTrack(n, t) {
    n.track = clamp(t, 0, TRACKS - 1);
    render();
    ctx.announce(`Définir piste : ${n.track}`);
    if (entry().enabled) apply();
    else status();
  }
  function removeRole(n, role) {
    n.roles = n.roles.filter((r) => r !== role);
    g.edges = g.edges.filter((e) => !(e.kind === 'exec' && e.from === n.id && e.branch === `role:${role}`));
    render();
    ctx.announce(`Rôle ${role} retiré. Ses répliques ne bougent plus.`);
    status();
  }
  function projectRoles() {
    return [...new Set(lines.map((l) => l.character))];
  }

  /* ── « Choisir un rôle » ── */
  function openPicker(n) {
    picker = { node: n.id };
    render();
    picker.el?.querySelector('button')?.focus();
  }
  function closePicker(focusAdd = false) {
    if (!picker) return;
    picker.el?.remove();
    picker = null;
    const add = canvas.querySelector('[data-key="if:add"]');
    add?.setAttribute('aria-expanded', 'false');
    if (focusAdd) add?.focus({ preventScroll: true });
  }
  function renderPicker() {
    const n = g.nodes.find((x) => x.id === picker.node);
    const el = document.createElement('div');
    el.className = 'pj-picker';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Choisir un rôle');
    let x = n.x + nodeW(n) + 7;
    const cw = canvas.offsetWidth || scroll.clientWidth;
    if (x + 230 > cw - 4) x = Math.max(4, n.x + nodeW(n) - 236);
    el.style.left = `${x}px`;
    el.style.top = `${n.y + NODE_HEADER_H}px`;
    const available = projectRoles().filter((r) => !n.roles.includes(r));
    el.innerHTML = `<p class="pj-picker__head">Choisir un rôle</p>${
      available.length
        ? available.map((r) => `<button class="pj-picker__item" type="button" data-role="${esc(r)}">${esc(r)}</button>`).join('')
        : '<p class="pj-picker__none">Tous les rôles sont déjà ajoutés</p>'
    }`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-role]');
      if (!b) return;
      n.roles.push(b.dataset.role);
      picker = null;
      render();
      ctx.announce(`Rôle ${b.dataset.role} ajouté. Reliez sa sortie à un nœud Définir piste.`);
      canvas.querySelector(`[data-key="${CSS.escape(`${n.id}:out:exec:role:${b.dataset.role}`)}"]`)?.focus({ preventScroll: true });
    });
    el.addEventListener('keydown', (e) => {
      const items = [...el.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') closePicker(true);
      else if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
      else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
      else if (e.key === 'Tab') closePicker(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    canvas.append(el);
    picker.el = el;
    if (!available.length) ctx.announce('Tous les rôles sont déjà ajoutés');
  }

  /* ── wiring: press an output, release (or click) on an input ── */
  function startPending(btn) {
    const n = g.nodes.find((x) => x.id === btn.dataset.node);
    const kind = btn.dataset.kind;
    const branch = btn.dataset.branch;
    const out = kind === 'exec' ? execOuts(n).find((o) => o.branch === branch) : lineOut(n);
    const c = pinCenter(n, out);
    pending = { from: n.id, kind, branch, key: btn.dataset.key, x: c.x, y: c.y };
    render();
  }
  function cancelPending({ focusSource = false } = {}) {
    if (!pending) return;
    const key = pending.key;
    pending = null;
    render();
    if (focusSource) canvas.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }
  function finishPending(btn) {
    const edge = { from: pending.from, kind: pending.kind, branch: pending.branch, to: btn.dataset.node };
    const from = g.nodes.find((x) => x.id === edge.from);
    const to = g.nodes.find((x) => x.id === edge.to);
    const ok = connect(g, edge);
    const key = pending.key;
    pending = null;
    render();
    if (ok) {
      const what = edge.branch.startsWith('role:') ? `Si rôle ${edge.branch.slice(5)}` : nodeTitle(from);
      ctx.announce(`Relié : ${what} vers ${nodeTitle(to)}`);
      if (entry().enabled) apply({ announceMoves: true });
      else status();
    }
    canvas.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }
  const canvasPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    const pin = e.target.closest('.pj-pin');
    const head = e.target.closest('.pj-node__head');
    if (picker && !e.target.closest('.pj-picker, .pj-node__add')) closePicker(false);
    if (pin && pin.dataset.dir === 'out') {
      e.preventDefault();
      startPending(pin);
      const x0 = e.clientX;
      const y0 = e.clientY;
      const move = (ev) => {
        if (!pending) return;
        Object.assign(pending, canvasPoint(ev));
        const l = wires.querySelector('[data-pending]');
        l?.setAttribute('x2', pending.x);
        l?.setAttribute('y2', pending.y);
      };
      const up = (ev) => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (!pending) return;
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.pj-pin[data-target]');
        if (target) finishPending(target);
        else if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) cancelPending();
        // a plain click keeps the wire armed: the next click picks the input
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      return;
    }
    if (pin && pin.dataset.dir === 'in') {
      if (pending && pin.hasAttribute('data-target')) {
        e.preventDefault();
        finishPending(pin);
      }
      return;
    }
    if (pending && !pin) cancelPending();
    if (head) {
      const nodeEl = head.closest('.pj-node');
      const n = g.nodes.find((x) => x.id === nodeEl.dataset.node);
      selected = n.id;
      canvas.querySelectorAll('.pj-node').forEach((el) => el.classList.toggle('is-selected', el === nodeEl));
      head.setPointerCapture(e.pointerId);
      const start = { x: n.x, y: n.y, px: e.clientX, py: e.clientY };
      const move = (ev) => {
        const cw = canvas.offsetWidth;
        const ch = canvas.offsetHeight;
        n.x = clamp(start.x + ev.clientX - start.px, 0, cw - nodeW(n));
        n.y = clamp(start.y + ev.clientY - start.py, 0, ch - nodeH(n));
        nodeEl.style.setProperty('--x', `${n.x}px`);
        nodeEl.style.setProperty('--y', `${n.y}px`);
        moved = true;
        renderWires();
      };
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        head.removeEventListener('pointercancel', up);
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
      head.addEventListener('pointercancel', up);
      return;
    }
    if (!e.target.closest('.pj-node, .pj-picker') && selected) {
      selected = null;
      canvas.querySelectorAll('.pj-node.is-selected').forEach((el) => el.classList.remove('is-selected'));
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pending || e.buttons) return;
    Object.assign(pending, canvasPoint(e));
    const l = wires.querySelector('[data-pending]');
    l?.setAttribute('x2', pending.x);
    l?.setAttribute('y2', pending.y);
  });
  canvas.addEventListener('click', (e) => {
    const pin = e.target.closest('.pj-pin');
    if (!pin || e.detail !== 0) return; // keyboard activation only; pointer handled above
    if (pin.dataset.dir === 'out') {
      if (pending && pending.key === pin.dataset.key) return cancelPending({ focusSource: true });
      startPending(pin);
      const first = canvas.querySelector('.pj-pin[data-target]');
      first?.focus({ preventScroll: true });
      ctx.announce(first ? `Choisissez une entrée ${pending.kind === 'exec' ? 'd’exécution' : 'LIGNE'}, puis Entrée. Échap pour annuler.` : 'Aucune entrée compatible');
    } else if (pending && pin.hasAttribute('data-target')) finishPending(pin);
  });
  canvas.addEventListener('change', (e) => {
    if (e.target.matches('[data-key="entry:check"]')) setEnabled(e.target.checked);
  });
  canvas.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (pending) {
      e.preventDefault();
      cancelPending({ focusSource: true });
      ctx.announce('Connexion annulée');
    } else if (picker) {
      e.preventDefault();
      closePicker(true);
    }
  });

  /* ── the band edits feed the graph ── */
  band.on('change', () => {
    if (entry()?.enabled) apply({ announceMoves: true });
  });

  root.querySelector('[data-auto-reset]')?.addEventListener('click', () => {
    stopMotion();
    g = demoGraph();
    lines = demoLines();
    moved = false;
    selected = null;
    pending = null;
    picker = null;
    layoutNodes();
    band.setProject({ lines, markers: [], strokes: [] });
    band.seek(CENTER);
    render();
    status();
    ctx.announce('Démonstration de l’automatisation réinitialisée');
  });

  new ResizeObserver(() => {
    if (!moved) layoutNodes();
    render();
  }).observe(scroll);

  layoutNodes();
  render();
  status();
}
