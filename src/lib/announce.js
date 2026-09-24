// Mirrors the app's speech output: every action names itself, never the keys.
// Announcements go to an aria-live region (read by the visitor's screen
// reader) and to subscribers (the "lecture vocale" log in the accessibility
// section shows them as text).

const log = [];
const subs = new Set();
let politeEl;
let assertiveEl;

function regions() {
  politeEl ||= document.getElementById('announcer');
  assertiveEl ||= document.getElementById('announcer-assertive');
}

export function announce(text, { priority = false } = {}) {
  if (!text) return;
  regions();
  const el = priority ? assertiveEl : politeEl;
  if (el) {
    // re-set so repeated identical messages are still spoken
    el.textContent = '';
    requestAnimationFrame(() => {
      el.textContent = text;
    });
  }
  const entry = { text, priority, at: performance.now() };
  log.push(entry);
  if (log.length > 50) log.shift();
  subs.forEach((fn) => fn(entry));
}

export function onAnnounce(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function announceLog() {
  return [...log];
}
