// Chrome behaviours shared by the whole page: menus, dropdowns, tabs,
// tooltips, settings dialog, welcome toast, chapter strips.

import { settings } from '../lib/settings.js';
import { announce } from '../lib/announce.js';

/* ───────────── Dropdown helper (menus, toolbar lists) ───────────── */
const openDrops = new Set();

export function closeAllDropdowns(except) {
  for (const d of [...openDrops]) if (d !== except) d.close(false);
}

export function makeDropdown(button, panel, { onOpen } = {}) {
  const items = () => [...panel.querySelectorAll('.dropdown__item:not([disabled])')];
  const api = {
    isOpen: () => !panel.hidden,
    open(focusFirst = false) {
      closeAllDropdowns(api);
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      openDrops.add(api);
      onOpen?.();
      if (focusFirst) items()[0]?.focus();
    },
    close(returnFocus = true) {
      if (panel.hidden) return;
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      openDrops.delete(api);
      if (returnFocus) button.focus();
    },
    toggle(focusFirst) {
      api.isOpen() ? api.close(false) : api.open(focusFirst);
    },
  };
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    api.toggle(e.detail === 0);
  });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      api.open(true);
    }
  });
  panel.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list.at(-1)?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      api.close(true);
    }
  });
  // Tab walks the items like any list; the menu closes once focus leaves it
  panel.addEventListener('focusout', (e) => {
    const to = e.relatedTarget;
    if (to && (panel.contains(to) || to === button)) return;
    api.close(false);
  });
  panel.addEventListener('click', (e) => {
    if (e.target.closest('.dropdown__item')) api.close(false);
  });
  return api;
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown, .menubar')) closeAllDropdowns();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openDrops.size) closeAllDropdowns();
});

/* ───────────── Topbar menus ───────────── */
export function initMenus() {
  const menubar = document.querySelector('.menubar');
  const toggle = menubar.querySelector('.menubar__toggle');
  const drops = [];
  menubar.querySelectorAll('.menu').forEach((li) => {
    const btn = li.querySelector('button.menu__btn');
    const panel = li.querySelector('.menu__panel');
    if (!btn || !panel) return;
    const d = makeDropdown(btn, panel);
    drops.push(d);
    // desktop-app feel: once a menu is open, hovering another switches to it
    btn.addEventListener('pointerenter', () => {
      if (drops.some((x) => x !== d && x.isOpen()) && matchMedia('(min-width: 901px)').matches) d.open(false);
    });
  });
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !menubar.hasAttribute('data-open');
    menubar.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) menubar.querySelector('.menubar__list .menu__btn')?.focus();
  });
  menubar.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && menubar.hasAttribute('data-open')) {
      menubar.removeAttribute('data-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menubar') && menubar.hasAttribute('data-open')) {
      menubar.removeAttribute('data-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  menubar.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menubar.hasAttribute('data-open')) {
      menubar.removeAttribute('data-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  });
}

/* ───────────── Tabs (workspaces) ───────────── */
export function initTabs() {
  const list = document.querySelector('.tabbar');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const subs = new Set();
  let current = 'rythmo';
  const labels = { rythmo: 'Bande rythmo', recording: 'Enregistrement', voicelines: 'Voicelines', comicdubs: 'Comic Dubs' };

  function select(name, { focus = false, silent = false } = {}) {
    const tab = tabs.find((t) => t.dataset.ws === name);
    if (!tab) return;
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    const prev = current;
    current = name;
    if (prev !== name) {
      if (!silent) announce(`Espace ${labels[name]}`);
      subs.forEach((fn) => fn(name, prev));
    }
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab.dataset.ws));
    tab.addEventListener('keydown', (e) => {
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) {
        e.preventDefault();
        select(tabs[j].dataset.ws, { focus: true });
      }
    });
  });
  document.querySelectorAll('[data-tab]').forEach((el) =>
    el.addEventListener('click', () => {
      select(el.dataset.tab);
      document.getElementById('top').scrollIntoView({ behavior: settings.get().reduceMotion ? 'auto' : 'smooth' });
      tabs.find((t) => t.dataset.ws === el.dataset.tab)?.focus({ preventScroll: true });
    }),
  );
  return {
    select,
    current: () => current,
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/* ───────────── Toolbars: every control is a Tab stop, arrows as a shortcut ─────────────
   Tab and Shift+Tab reach each button and link; Left/Right, Home and End
   still move inside the bar. Sliders and text fields keep their own arrows.
   Toolbars that manage their own keys opt out with data-roving="own". */
export function initToolbars(root = document) {
  // hidden inside the bar only: the bar itself may sit in a closed tab panel
  const usable = (el, bar) => {
    if (el.disabled) return false;
    for (let n = el; n && n !== bar; n = n.parentElement) if (n.hidden) return false;
    return true;
  };
  const itemsOf = (bar) =>
    [...bar.querySelectorAll('button, a[href]')].filter((el) => !el.closest('.dropdown') && usable(el, bar));

  root.querySelectorAll('[role="toolbar"]:not([data-roving="own"])').forEach((bar) => {
    bar.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const from = e.target.closest('button, a[href]');
      if (!from || from.closest('.dropdown') || !bar.contains(from)) return;
      const items = itemsOf(bar);
      const i = items.indexOf(from);
      if (i === -1) return;
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % items.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + items.length) % items.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = items.length - 1;
      if (j === null) return;
      e.preventDefault();
      items[j].focus();
    });
  });
}

/* ───────────── Tooltips (data-tip, data-kbd) ───────────── */
export function initTooltips() {
  const tip = document.getElementById('tooltip');
  let timer = 0;
  let owner = null;
  const show = (el, text, kbd) => {
    owner = el;
    tip.innerHTML = '';
    tip.append(document.createTextNode(text));
    if (kbd) {
      tip.append(' ');
      for (const part of kbd.split(' ')) {
        const k = document.createElement('kbd');
        k.textContent = part;
        tip.append(k, ' ');
      }
    }
    const r = el.getBoundingClientRect();
    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.setAttribute('data-show', '');
    const tr = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2;
    x = Math.max(8, Math.min(window.innerWidth - tr.width - 8, x));
    let y = r.bottom + 8;
    if (y + tr.height > window.innerHeight - 8) y = r.top - tr.height - 8;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  };
  const hide = () => {
    clearTimeout(timer);
    owner = null;
    tip.removeAttribute('data-show');
  };
  const arm = (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el || el === owner) return;
    clearTimeout(timer);
    timer = setTimeout(() => show(el, el.dataset.tip, el.dataset.kbd), e.type === 'focusin' ? 150 : 400);
  };
  document.addEventListener('pointerover', arm);
  document.addEventListener('focusin', (e) => {
    if (e.target.matches?.(':focus-visible')) arm(e);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('[data-tip]')) hide();
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide);
  window.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  return { show, hide };
}

/* ───────────── Settings dialog ───────────── */
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export function initSettings() {
  const dlg = document.getElementById('settings');
  const speed = dlg.querySelector('[data-speed]');
  const out = dlg.querySelector('[data-speed-out]');
  const sync = () => {
    const st = settings.get();
    const i = Math.max(0, SPEEDS.indexOf(st.scrollSpeed));
    speed.value = String(i === -1 ? 3 : i);
    speed.style.setProperty('--fill', `${(speed.value / 7) * 100}%`);
    out.textContent = `×${String(SPEEDS[speed.value]).replace('.', ',')}`;
    speed.setAttribute('aria-valuetext', `fois ${String(SPEEDS[speed.value]).replace('.', ',')}`);
    dlg.querySelectorAll('[data-setting]').forEach((cb) => {
      cb.checked = !!st[cb.dataset.setting];
    });
  };
  speed.addEventListener('input', () => {
    settings.set({ scrollSpeed: SPEEDS[speed.value] });
    sync();
  });
  dlg.querySelectorAll('[data-setting]').forEach((cb) =>
    cb.addEventListener('change', () => {
      settings.set({ [cb.dataset.setting]: cb.checked });
      announce(`${cb.parentElement.textContent.trim()} : ${cb.checked ? 'activé' : 'désactivé'}`);
    }),
  );
  document.querySelectorAll('[data-action="open-settings"]').forEach((b) =>
    b.addEventListener('click', () => {
      sync();
      dlg.showModal();
    }),
  );
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => announce('Paramètres fermés'));
}

/* ───────────── Welcome toast ───────────── */
export function initWelcome(tabs) {
  const toast = document.querySelector('[data-welcome]');
  if (!toast) return;
  let seen = false;
  try {
    seen = sessionStorage.getItem('coquerythmo-welcome') === '1';
  } catch {
    /* ignore */
  }
  if (seen) return;
  let hideTimer;
  const hide = () => {
    toast.hidden = true;
    try {
      sessionStorage.setItem('coquerythmo-welcome', '1');
    } catch {
      /* ignore */
    }
  };
  // Only over the band's own workspace, like the app's startup toast, and only
  // where it fits in the letterbox beside the work copy: it never covers the
  // frame or the download lines.
  const place = () => {
    const video = document.querySelector('#ws-rythmo .video');
    const frame = document.querySelector('.workcopy');
    const win = document.getElementById('top');
    if (!video || !frame || !win) return false;
    const v = video.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    const room = v.right - f.right - 32;
    if (room < 240) return false;
    toast.style.width = `${Math.min(340, room)}px`;
    toast.style.top = `${f.top - w.top}px`;
    return true;
  };
  const showTimer = setTimeout(() => {
    if (tabs && tabs.current() !== 'rythmo') return;
    if (!place()) return;
    toast.hidden = false;
    // polite: it waits until the screen reader has finished the page intro
    announce(toast.querySelector('p').textContent.trim().replace(/\s+/g, ' '));
    hideTimer = setTimeout(hide, 8000);
  }, 1400);
  tabs?.onChange(() => {
    clearTimeout(showTimer);
    if (!toast.hidden) hide();
  });
  toast.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  toast.addEventListener('focusin', () => clearTimeout(hideTimer));
  toast.querySelector('button').addEventListener('click', hide);
}

/* ───────────── « Lire la suite »: fades once the page has scrolled ───────────── */
export function initMore() {
  const more = document.querySelector('[data-more]');
  if (!more) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    more.toggleAttribute('data-away', window.scrollY > 48);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!raf) raf = requestAnimationFrame(update);
    },
    { passive: true },
  );
  update();
}

/* ───────────── Chapter strips: ruler ticks drift left as you scroll ───────────── */
export function initStrips() {
  const strips = [...document.querySelectorAll('.strip')];
  if (!strips.length) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    if (settings.get().reduceMotion) return;
    const x = -((window.scrollY * 0.6) % 24);
    for (const s of strips) s.style.setProperty('--tick-x', `${x}px`);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!raf) raf = requestAnimationFrame(update);
    },
    { passive: true },
  );
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) e.target.classList.add('is-in');
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  document.documentElement.classList.add('js-strips');
  strips.forEach((s) => io.observe(s));
}
