// A card is one integer, 0..51: rank = c >> 2 (0 is the deuce, 12 the ace),
// suit = c & 3. Integers keep the evaluator in one array lookup per card and
// make the deck a plain Int8Array that shuffles in place.
export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';                 // clubs, diamonds, hearts, spades
export const RED = [false, true, true, false];

export const rankOf = c => c >> 2;
export const suitOf = c => c & 3;
export const cardCode = c => RANKS[c >> 2] + SUITS[c & 3];

// "As", "Td" -> integer. Used by the tests and by the debug hook.
export function parseCard(s) {
  const r = RANKS.indexOf(s[0].toUpperCase());
  const u = SUITS.indexOf(s[1].toLowerCase());
  if (r < 0 || u < 0) throw new Error('bad card ' + s);
  return r * 4 + u;
}
export const parseCards = s => s.trim().split(/\s+/).map(parseCard);

// Names for the interface. The plural of "six" is "sixes", which a bare
// rank table gets wrong, so both forms are spelled out.
export const RANK_NAME = ['deuce', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
export const RANK_PLURAL = ['deuces', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights',
  'nines', 'tens', 'jacks', 'queens', 'kings', 'aces'];

// Deterministic PRNG so a hand can be replayed from its seed. Without a seed
// the shuffle draws from crypto, which is what the game runs on.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Unbiased integer in [0, n): rejection sampling on 32 random bits. Taking
// crypto value % n would make low cards very slightly likelier, which is
// invisible per hand and shows up over a hundred thousand of them.
const cryptoRnd = (typeof crypto !== 'undefined' && crypto.getRandomValues)
  ? (() => { const buf = new Uint32Array(1); return () => { crypto.getRandomValues(buf); return buf[0] / 4294967296; }; })()
  : Math.random;

export function randInt(n, rnd) {
  if (rnd) return Math.floor(rnd() * n);
  const buf = randInt._b || (randInt._b = new Uint32Array(1));
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) return Math.floor(cryptoRnd() * n);
  const limit = Math.floor(4294967296 / n) * n;
  let v;
  do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
  return v % n;
}

export class Deck {
  constructor(rnd) { this.rnd = rnd || null; this.cards = new Int8Array(52); this.reset(); }
  reset() {
    for (let i = 0; i < 52; i++) this.cards[i] = i;
    // Fisher-Yates, from the top down
    for (let i = 51; i > 0; i--) {
      const j = randInt(i + 1, this.rnd);
      const t = this.cards[i]; this.cards[i] = this.cards[j]; this.cards[j] = t;
    }
    this.i = 0;
    return this;
  }
  draw() { return this.cards[this.i++]; }
  drawN(n) { const out = []; for (let i = 0; i < n; i++) out.push(this.draw()); return out; }
  get left() { return 52 - this.i; }
  // for scripted runs: put a known set of cards on top, in order
  stack(cards) {
    const want = cards.slice();
    const rest = [];
    for (const c of this.cards) if (!want.includes(c)) rest.push(c);
    this.cards = Int8Array.from(want.concat(rest));
    this.i = 0;
    return this;
  }
}
