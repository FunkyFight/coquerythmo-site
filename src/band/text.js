// Text helpers shared by the band renderer and the lip-sync frame.

const VOWELS = 'aeiouyàâäéèêëîïôöùûüœæ';
const isVowel = (ch) => VOWELS.includes(ch.toLowerCase());
const isLetter = (ch) => /\p{L}/u.test(ch);
const INSEPARABLE = new Set([
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr', 'vr',
  'ch', 'ph', 'th', 'gn', 'qu',
]);

// Rough French syllabification, enough to pace a karaoke dot. The app uses
// hypher dictionaries for fr/en/es; this is the page's illustrative stand-in.
function splitWord(word) {
  const out = [];
  let cur = '';
  let i = 0;
  while (i < word.length) {
    // onset consonants + vowel nucleus
    while (i < word.length && !isVowel(word[i])) cur += word[i++];
    while (i < word.length && isVowel(word[i])) cur += word[i++];
    // consonant cluster before the next vowel
    let j = i;
    while (j < word.length && !isVowel(word[j])) j++;
    const cluster = word.slice(i, j);
    if (j >= word.length) {
      cur += cluster;
      i = j;
    } else if (cluster.length <= 1) {
      // single consonant opens the next syllable
    } else if (cluster.length === 2 && INSEPARABLE.has(cluster.toLowerCase())) {
      // keep the pair together for the next syllable
    } else {
      const keep = cluster.length === 2 ? 1 : cluster.length - 2;
      cur += cluster.slice(0, keep);
      i += keep;
    }
    out.push(cur);
    cur = '';
  }
  if (cur) out.push(cur);
  return out.filter(Boolean);
}

/** Split a line into syllables, keeping spaces/punctuation attached so the
 *  pieces concatenate back to the exact text. Returns [{text, start}]. */
export function syllabify(text) {
  const tokens = text.match(/[\p{L}'’-]+|[^\p{L}'’-]+/gu) || [];
  const out = [];
  let pos = 0;
  for (const tok of tokens) {
    if (!isLetter(tok[0])) {
      if (out.length) out[out.length - 1].text += tok;
      else out.push({ text: tok, start: pos });
    } else {
      for (const s of splitWord(tok)) out.push({ text: s, start: pos + tok.indexOf(s, 0) });
    }
    pos += tok.length;
  }
  // recompute starts sequentially (indexOf above is naive for repeats)
  let p = 0;
  for (const s of out) {
    s.start = p;
    p += s.text.length;
  }
  return out;
}

/** Word spans [{start, end}] used by the "mot à la ligne de lecture" highlight. */
export function words(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

// Rhubarb-style mouth shapes shipped with the app (src/icons/detection/rhubarb_lips).
export const VISEMES = ['P_B_M', 'K_S_T_EE', 'EH_AE', 'AA', 'AO_ER', 'UW_OW_W', 'F_V', 'L'];

/** Map a character to one of the app's eight mouth drawings. Illustrative:
 *  the app derives detection signs from phonetics, not from letters. */
export function visemeFor(ch) {
  const c = ch.toLowerCase();
  if ('aàâ'.includes(c)) return 'AA';
  if ('eéèêë'.includes(c)) return 'EH_AE';
  if ('iîïy'.includes(c)) return 'K_S_T_EE';
  if ('oôö'.includes(c)) return 'AO_ER';
  if ('uùûüw'.includes(c)) return 'UW_OW_W';
  if ('pbm'.includes(c)) return 'P_B_M';
  if ('fv'.includes(c)) return 'F_V';
  if (c === 'l') return 'L';
  if (/\p{L}/u.test(c)) return 'K_S_T_EE';
  return null;
}
