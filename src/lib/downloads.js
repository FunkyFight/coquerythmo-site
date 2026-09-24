// Resolves, per platform, the newest release of funkyfight/coquerythmo-releases
// that actually ships a build for it (the same repository the in-app updater
// reads). Windows gets every release; the last macOS/Linux builds are older.

const API = 'https://api.github.com/repos/funkyfight/coquerythmo-releases/releases?per_page=100';
export const RELEASES_PAGE = 'https://github.com/FunkyFight/coquerythmo-releases/releases';
const CACHE_KEY = 'coquerythmo-releases-v1';
const CACHE_MS = 60 * 60 * 1000;

const dl = (tag, name) => `https://github.com/FunkyFight/coquerythmo-releases/releases/download/${tag}/${name}`;

// Snapshot taken from the API on 2026-09-24; used when the API is unreachable
// or rate-limited, then replaced by live data.
export const FALLBACK = {
  windows: {
    version: '5.1.0',
    date: '2026-09-10',
    notes: 'Réécriture protocole réseau V2',
    installer: { name: 'Coquerythmo-Installer.exe', size: 68150299, url: dl('v5.1.0', 'Coquerythmo-Installer.exe') },
    portable: { name: 'coquerythmo-v5.1.0-windows-portable.zip', size: 102143802, url: dl('v5.1.0', 'coquerythmo-v5.1.0-windows-portable.zip') },
  },
  macos: {
    version: '3.5.1',
    date: '2026-07-17',
    app: { name: 'coquerythmo-v3.5.1-macos-aarch64-app.zip', size: 51306216, url: dl('v3.5.1', 'coquerythmo-v3.5.1-macos-aarch64-app.zip') },
  },
  linux: {
    version: '3.5.1',
    date: '2026-07-17',
    portable: { name: 'coquerythmo-v3.5.1-linux-portable.zip', size: 61257792, url: dl('v3.5.1', 'coquerythmo-v3.5.1-linux-portable.zip') },
  },
  releaseCount: 77,
  live: false,
};

const asset = (a) => ({ name: a.name, size: a.size, url: a.browser_download_url });
const ver = (tag) => tag.replace(/^v/, '');

function resolve(releases) {
  const out = { windows: null, macos: null, linux: null, releaseCount: releases.length, live: true };
  const sorted = releases
    .filter((r) => !r.draft && !r.prerelease)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  for (const r of sorted) {
    const date = r.published_at.slice(0, 10);
    if (!out.windows) {
      const inst = r.assets.find((a) => /installer.*\.exe$/i.test(a.name));
      const port = r.assets.find((a) => /windows.*portable.*\.zip$/i.test(a.name));
      if (inst || port) {
        out.windows = { version: ver(r.tag_name), date, notes: r.body || '', installer: inst && asset(inst), portable: port && asset(port) };
      }
    }
    if (!out.macos) {
      const app = r.assets.find((a) => /macos.*app\.zip$/i.test(a.name)) || r.assets.find((a) => /macos.*\.zip$/i.test(a.name));
      if (app) out.macos = { version: ver(r.tag_name), date, app: asset(app) };
    }
    if (!out.linux) {
      const port = r.assets.find((a) => /linux.*\.zip$/i.test(a.name));
      if (port) out.linux = { version: ver(r.tag_name), date, portable: asset(port) };
    }
    if (out.windows && out.macos && out.linux) break;
  }
  out.windows ||= FALLBACK.windows;
  out.macos ||= FALLBACK.macos;
  out.linux ||= FALLBACK.linux;
  return out;
}

let pending;
/** @returns {Promise<typeof FALLBACK>} */
export function getDownloads() {
  if (pending) return pending;
  pending = (async () => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.t < CACHE_MS) return cached.data;
    } catch {
      /* no storage: fetch */
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const data = resolve(await res.json());
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
      } catch {
        /* ignore */
      }
      return data;
    } catch {
      return FALLBACK;
    }
  })();
  return pending;
}

export function detectOS() {
  const ua = navigator.userAgent || '';
  const plat = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (/android|iphone|ipad|ipod/i.test(ua)) return 'mobile';
  if (plat.includes('win') || /windows/i.test(ua)) return 'windows';
  if (plat.includes('mac') || /mac os/i.test(ua)) return 'macos';
  if (plat.includes('linux') || /linux|x11/i.test(ua)) return 'linux';
  return 'windows';
}

export function formatSize(bytes) {
  if (!bytes) return '';
  return `${Math.round(bytes / 1048576)} Mo`;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

export const OS_LABEL = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
