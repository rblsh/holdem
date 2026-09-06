// Contrast, computed from the token file rather than judged by eye. Every pair
// of "text colour on the surface it actually sits on" is listed here; a pair
// added to the stylesheet without a line here is a pair nobody is checking.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

function block(selector) {
  const i = css.indexOf(selector + '{');
  const j = css.indexOf('}', i);
  const out = {};
  for (const line of css.slice(i + selector.length + 1, j).split(';')) {
    const m = line.match(/(--[\w-]+)\s*:\s*(.+)/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const LIGHT = block(':root');
const DARK = Object.assign({}, LIGHT, block(':root[data-theme="dark"]'));

// resolve a token to straight rgb, compositing any alpha over a given backdrop
function expand(tokens, value) {
  // var() references are expanded before the colour is parsed: matching
  // rgba(...) with [^)]+ first would stop at the bracket inside var(--ink-rgb)
  let v = String(value).trim();
  for (let i = 0; i < 8 && v.includes('var('); i++) {
    v = v.replace(/var\((--[\w-]+)\)/g, (_, name) => {
      if (tokens[name] == null) throw new Error('unknown token ' + name);
      return tokens[name];
    });
  }
  return v;
}
function rgb(tokens, value, over) {
  const v = expand(tokens, value);
  if (v.startsWith('#')) {
    const h = v.slice(1);
    const n = h.length === 3 ? h.split('').map(c => c + c) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
    return n.map(x => parseInt(x, 16));
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error('cannot read colour: ' + value + ' -> ' + v);
  const parts = m[1].split(',').map(s => Number(s.trim()));
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  if (a >= 1 || !over) return [r, g, b];
  return [0, 1, 2].map(i => Math.round([r, g, b][i] * a + over[i] * (1 - a)));
}
const lum = c => {
  const f = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [text token, surface token, surface's own backdrop (for tinted pills), minimum]
const PAIRS = [
  ['--ink', '--bg', null, 4.5, 'body text on the page'],
  ['--ink', '--card', null, 4.5, 'body text on a card'],
  ['--ink', '--plate', null, 4.5, 'a stack on its plate'],
  ['--sub', '--bg', null, 4.5, 'the hint line under the controls'],
  ['--sub', '--card', null, 4.5, 'a name on its plate'],
  ['--sub', '--plate', null, 4.5, 'the label on a wager'],
  ['--sub', '--sheet-bg', null, 4.5, 'help text in the sheet'],
  ['--on-accent', '--accent', null, 4.5, 'the label on the deal button'],
  ['--tip-ink', '--tip-bg', '--bg', 4.5, 'a toast'],
  ['--face-ink', '--face', null, 4.5, 'a black rank on a card'],
  ['--face-red', '--face', null, 4.5, 'a red rank on a card'],
  ['--v-low', '--v-low-bg', '--felt-over-bg', 4.5, 'the check and fold tag'],
  ['--v-fix', '--v-fix-bg', '--felt-over-bg', 4.5, 'the raise tag'],
  ['--res-win', '--v-dev-bg', '--felt-over-bg', 4.5, 'the all-in tag and the winning message'],
  ['--res-lose', '--v-stop-bg', '--felt-over-bg', 4.5, 'the losing message'],
  ['--res-push', '--v-low-bg', '--felt-over-bg', 4.5, 'a neutral message'],
  ['--accent', '--bg', null, 3.0, 'the focus ring against the page'],
  ['--accent', '--card', null, 3.0, 'the focus ring against a card'],
  ['--felt-edge', '--bg', null, 1.15, 'the rail must be visible at all'],
];

let fails = 0;
for (const [name, tokens] of [['light', LIGHT], ['dark', DARK]]) {
  console.log(name);
  // the tinted pills on the table sit on the felt, which is itself a tint of
  // the page: the pair to check is the text against THAT, not against the page
  const feltOverBg = rgb(tokens, tokens['--felt'], rgb(tokens, tokens['--bg']));
  for (const [ink, surface, backdropName, min, what] of PAIRS) {
    const backdrop = backdropName === '--felt-over-bg' ? feltOverBg
      : backdropName ? rgb(tokens, tokens[backdropName]) : rgb(tokens, tokens['--bg']);
    const bg = rgb(tokens, tokens[surface], backdrop);
    const fg = rgb(tokens, tokens[ink], bg);
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) fails++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2)} (need ${min})  ${ink} on ${surface} - ${what}`);
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nall green');
process.exit(fails ? 1 : 0);
