// Hand evaluation. evalHand() takes five to seven cards and returns one integer:
// the higher integer is the better hand, and two hands tie exactly when the
// integers are equal. Layout, from the top: category in bits 20-23, then five
// four-bit kickers. Ranks are 0..12, so every field fits in its nibble and the
// whole value stays inside a 32-bit int.
import { RANK_NAME, RANK_PLURAL, rankOf, suitOf } from './cards.js';

export const HIGH = 0, PAIR = 1, TWO_PAIR = 2, TRIPS = 3, STRAIGHT = 4,
  FLUSH = 5, FULL_HOUSE = 6, QUADS = 7, STRAIGHT_FLUSH = 8;

export const CATEGORY = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight',
  'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

const v = (cat, a = 0, b = 0, c = 0, d = 0, e = 0) =>
  (cat << 20) | (a << 16) | (b << 12) | (c << 8) | (d << 4) | e;

export const categoryOf = value => value >>> 20;
export const kickersOf = value => [15 & (value >> 16), 15 & (value >> 12), 15 & (value >> 8), 15 & (value >> 4), 15 & value];

// A straight is a property of the rank set alone, so it is worth precomputing
// once for all 8192 possible sets: the table answers "highest card of the
// straight, or -1" in a single lookup.
const STRAIGHT_TOP = new Int8Array(8192).fill(-1);
for (let m = 0; m < 8192; m++) {
  for (let hi = 12; hi >= 4; hi--) {
    const need = 0b11111 << (hi - 4);
    if ((m & need) === need) { STRAIGHT_TOP[m] = hi; break; }
  }
  // the wheel: the ace plays low, and only when no higher straight is present
  if (STRAIGHT_TOP[m] < 0 && (m & 0b1000000001111) === 0b1000000001111) STRAIGHT_TOP[m] = 3;
}

// top n ranks of a bitmask, highest first
function topN(mask, n, out) {
  let k = 0;
  for (let r = 12; r >= 0 && k < n; r--) if (mask & (1 << r)) out[k++] = r;
  while (k < 5) out[k++] = 0;
  return out;
}

const _k = new Int8Array(5);
const _cnt = new Int8Array(13);
const _sm = new Int32Array(4);
const _sc = new Int8Array(4);

export function evalHand(cards) {
  _cnt.fill(0); _sm.fill(0); _sc.fill(0);
  let mask = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i], r = c >> 2, s = c & 3;
    _cnt[r]++; _sm[s] |= 1 << r; _sc[s]++; mask |= 1 << r;
  }

  // A flush and a straight can both be present; the straight flush outranks
  // everything below it, so the flush suit is checked first.
  for (let s = 0; s < 4; s++) {
    if (_sc[s] < 5) continue;
    const sf = STRAIGHT_TOP[_sm[s]];
    if (sf >= 0) return v(STRAIGHT_FLUSH, sf);
    topN(_sm[s], 5, _k);
    return v(FLUSH, _k[0], _k[1], _k[2], _k[3], _k[4]);
  }

  let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1, p3 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = _cnt[r];
    if (n === 4) { if (quad < 0) quad = r; }
    else if (n === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else if (p3 < 0) p3 = r; }
  }

  if (quad >= 0) {
    topN(mask & ~(1 << quad), 1, _k);
    return v(QUADS, quad, _k[0]);
  }
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) {
    // with two sets the lower one plays as the pair, if it beats the best pair
    const pair = t2 > p1 ? t2 : p1;
    return v(FULL_HOUSE, t1, pair);
  }

  // Straights rank below a flush and above three of a kind, so the check sits
  // here rather than at the top.
  const st = STRAIGHT_TOP[mask];
  if (st >= 0) return v(STRAIGHT, st);

  if (t1 >= 0) {
    topN(mask & ~(1 << t1), 2, _k);
    return v(TRIPS, t1, _k[0], _k[1]);
  }
  if (p2 >= 0) {
    // three pairs happen on seven cards: the smallest pair only supplies a kicker
    topN(mask & ~(1 << p1) & ~(1 << p2), 1, _k);
    const kick = p3 > _k[0] ? p3 : _k[0];
    return v(TWO_PAIR, p1, p2, kick);
  }
  if (p1 >= 0) {
    topN(mask & ~(1 << p1), 3, _k);
    return v(PAIR, p1, _k[0], _k[1], _k[2]);
  }
  topN(mask, 5, _k);
  return v(HIGH, _k[0], _k[1], _k[2], _k[3], _k[4]);
}

// The five cards that actually make the hand, for highlighting at showdown.
// Twenty-one combinations is nothing at the two or three showdowns a hand has,
// and it cannot drift out of step with evalHand the way a second code path would.
const C5 = [];
for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 7; c++)
  for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) C5.push([a, b, c, d, e]);

export function best5(cards) {
  if (cards.length <= 5) return cards.slice();
  let bestV = -1, bestC = null;
  for (const combo of C5) {
    if (combo[4] >= cards.length) continue;
    const hand = [cards[combo[0]], cards[combo[1]], cards[combo[2]], cards[combo[3]], cards[combo[4]]];
    const val = evalHand(hand);
    if (val > bestV) { bestV = val; bestC = hand; }
  }
  return bestC;
}

// "Full house, kings over threes". Sentence case: the name is read inside a
// sentence on the table, not as a heading.
export function handName(value) {
  const cat = value >>> 20, k = kickersOf(value);
  switch (cat) {
    case STRAIGHT_FLUSH: return k[0] === 12 ? 'Royal flush' : `Straight flush, ${RANK_NAME[k[0]]} high`;
    case QUADS: return `Four ${RANK_PLURAL[k[0]]}`;
    case FULL_HOUSE: return `Full house, ${RANK_PLURAL[k[0]]} over ${RANK_PLURAL[k[1]]}`;
    case FLUSH: return `Flush, ${RANK_NAME[k[0]]} high`;
    case STRAIGHT: return `Straight, ${RANK_NAME[k[0]]} high`;
    case TRIPS: return `Three ${RANK_PLURAL[k[0]]}`;
    case TWO_PAIR: return `Two pair, ${RANK_PLURAL[k[0]]} and ${RANK_PLURAL[k[1]]}`;
    case PAIR: return `Pair of ${RANK_PLURAL[k[0]]}`;
    default: return `${RANK_NAME[k[0]][0].toUpperCase()}${RANK_NAME[k[0]].slice(1)} high`;
  }
}

// Short form for the seat badge, where the full name does not fit.
export function handNameShort(value) {
  const cat = value >>> 20, k = kickersOf(value);
  switch (cat) {
    case STRAIGHT_FLUSH: return k[0] === 12 ? 'Royal flush' : 'Straight flush';
    case QUADS: return `Quad ${RANK_PLURAL[k[0]]}`;
    case FULL_HOUSE: return 'Full house';
    case FLUSH: return 'Flush';
    case STRAIGHT: return 'Straight';
    case TRIPS: return `Trip ${RANK_PLURAL[k[0]]}`;
    case TWO_PAIR: return 'Two pair';
    case PAIR: return `Pair of ${RANK_PLURAL[k[0]]}`;
    default: return `${RANK_NAME[k[0]][0].toUpperCase()}${RANK_NAME[k[0]].slice(1)} high`;
  }
}
