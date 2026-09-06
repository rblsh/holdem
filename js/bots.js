// The five opponents. Preflop they use a hand-strength score, postflop they
// roll the hand out a few hundred times to see how often it actually wins.
// That is slower than a lookup table and much harder to get wrong: nobody has
// to remember whether a gutshot on a two-tone board is worth a call.
import { evalHand } from './eval.js';

// ---- equity -----------------------------------------------------------------
// How often this hand wins or ties against opponents holding anything. Real
// opponents are not random, so callers discount the number when the money has
// been going in hard; this is a floor, not a read.
const _deck = new Int8Array(52);
export function equity(hole, board, opponents, iters = 400, rnd = Math.random) {
  const known = hole.concat(board);
  let n = 0;
  for (let c = 0; c < 52; c++) if (!known.includes(c)) _deck[n++] = c;
  const need = 5 - board.length;
  const mine = new Array(7), theirs = new Array(7);
  let score = 0;
  for (let it = 0; it < iters; it++) {
    // partial shuffle: only the cards this rollout actually needs
    const take = need + opponents * 2;
    for (let i = 0; i < take; i++) {
      const j = i + ((rnd() * (n - i)) | 0);
      const t = _deck[i]; _deck[i] = _deck[j]; _deck[j] = t;
    }
    let k = 0;
    const full = board.slice();
    for (let i = 0; i < need; i++) full.push(_deck[k++]);
    mine.length = 0; mine.push(hole[0], hole[1], ...full);
    const my = evalHand(mine);
    let better = 0, same = 0;
    for (let o = 0; o < opponents; o++) {
      theirs.length = 0; theirs.push(_deck[k++], _deck[k++], ...full);
      const v = evalHand(theirs);
      if (v > my) { better = 1; break; }
      if (v === my) same++;
    }
    if (!better) score += same ? 1 / (same + 1) : 1;
  }
  return score / iters;
}

// ---- preflop ----------------------------------------------------------------
// Bill Chen's score: the shortest description of a starting hand that is not
// wrong. Roughly 2 for seven-deuce, 20 for aces.
const CHEN_HIGH = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10];
export function chen(hole) {
  const a = Math.max(hole[0] >> 2, hole[1] >> 2), b = Math.min(hole[0] >> 2, hole[1] >> 2);
  const suited = (hole[0] & 3) === (hole[1] & 3);
  let p = CHEN_HIGH[a];
  if (a === b) { p = Math.max(p * 2, 5); return Math.ceil(p); }
  if (suited) p += 2;
  const gap = a - b - 1;
  p -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && a < 10) p += 1;             // both below a queen: it can make a straight
  return Math.ceil(p);
}

// ---- personalities ----------------------------------------------------------
// Five ways to be wrong about a hand. The differences are deliberately large:
// a table of five identical solid players is duller than one with a maniac in it.
export const STYLES = {
  rock:    { label: 'tight and passive',    open: 8.0, call: 8.0, threeBet: 12.0, cont: 0.34, raiseAt: 0.74, bluff: 0.03, size: 0.55, tilt: 0.02 },
  shark:   { label: 'tight and aggressive', open: 6.0, call: 6.5, threeBet: 9.5,  cont: 0.29, raiseAt: 0.63, bluff: 0.16, size: 0.68, tilt: 0.05 },
  solid:   { label: 'balanced',             open: 6.2, call: 6.5, threeBet: 10.0, cont: 0.30, raiseAt: 0.66, bluff: 0.09, size: 0.62, tilt: 0.04 },
  station: { label: 'loose and passive',    open: 7.0, call: 3.5, threeBet: 13.0, cont: 0.20, raiseAt: 0.80, bluff: 0.02, size: 0.50, tilt: 0.03 },
  maniac:  { label: 'loose and aggressive', open: 4.0, call: 3.5, threeBet: 7.0,  cont: 0.24, raiseAt: 0.56, bluff: 0.32, size: 0.85, tilt: 0.10 },
};

// Late position plays more hands: the score needed drops as the button gets closer.
const POS_SHIFT = { UTG: 1.2, 'UTG+1': 1.0, LJ: 0.8, HJ: 0.5, CO: 0, BTN: -1.2, SB: 0.3, BB: -0.8 };

export function decide(view, styleName = 'solid', rnd = Math.random) {
  const st = STYLES[styleName] || STYLES.solid;
  const L = view.legal;
  const toCall = L.toCall;
  const pot = view.pot;
  const bb = view.bigBlind;
  const check = () => ({ type: 'check' });
  const fold = () => toCall === 0 ? check() : { type: 'fold' };
  const call = () => toCall === 0 ? check() : { type: 'call' };

  // raise to a size, snapped into what the rules allow
  const raiseTo = amount => {
    if (!L.raise) return call();
    const to = Math.max(L.raise.min, Math.min(L.raise.max, Math.round(amount)));
    return { type: L.raise.isBet ? 'bet' : 'raise', to };
  };

  const jitter = 1 + (rnd() - 0.5) * st.tilt * 4;

  if (view.street === 'preflop') {
    const score = chen(view.hole) * jitter;
    const shift = POS_SHIFT[view.position] != null ? POS_SHIFT[view.position] : 0;
    const raised = view.currentBet > bb;
    const potInBB = pot / bb;

    if (!raised) {
      // nobody has come in for a raise: open, or take a cheap look from the blinds
      if (score >= st.open + shift && L.raise) {
        const opens = (2.2 + rnd() * 1.1) * bb + (pot - bb - view.myBet) * 0.4;
        return raiseTo(Math.max(L.raise.min, opens));
      }
      if (toCall === 0) return check();
      if (score >= st.call + shift - 1) return call();
      return fold();
    }

    // facing a raise
    if (score >= st.threeBet + shift * 0.5 && L.raise && rnd() < 0.8) {
      return raiseTo(Math.max(L.raise.min, view.currentBet * (2.6 + rnd() * 0.8)));
    }
    // a big raise needs a better hand than a small one
    const priceInBB = toCall / bb;
    const need = st.call + shift + Math.min(6, priceInBB * 0.32);
    if (score >= need) return call();
    // a hopeless price with a hand that flops well is still a fold
    return fold();
  }

  // ---- postflop -------------------------------------------------------------
  const opp = Math.max(1, view.opponents);
  const raw = equity(view.hole, view.board, opp, opp <= 2 ? 420 : 320, rnd);

  // A bet is information. The rollout above assumed opponents holding anything;
  // the bigger the bet relative to the pot, the less true that is. Without this
  // discount a bot calls off a stack with a hand that only beats random cards.
  const pressure = toCall > 0 ? Math.min(1.2, toCall / Math.max(bb, pot)) : 0;
  const streetN = view.street === 'flop' ? 0 : view.street === 'turn' ? 1 : 2;
  const eq = raw * (1 - 0.16 * pressure - 0.04 * view.aggressors - 0.03 * streetN) * jitter;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  // Bluffing into four players is not a bluff, it is a donation, and the river
  // is where a called bluff costs the most.
  const bluffNow = (st.bluff / opp) * (streetN === 2 ? 0.5 : 1);

  if (toCall === 0) {
    const need = (st.raiseAt - 0.16) + 0.06 * (opp - 1);
    const value = eq > need;
    const bluff = !value && rnd() < bluffNow && eq > 0.14 && eq < 0.46;
    if (L.raise && (value || bluff)) return raiseTo(pot * st.size * (0.75 + rnd() * 0.5));
    return check();
  }

  // A raise has to beat the range that is already putting money in, not the
  // price - so it needs more than a call does, and more again in a crowd.
  const raiseNeed = st.raiseAt + 0.05 * (opp - 1) + 0.06 * pressure;
  if (L.raise && eq > raiseNeed && rnd() < 0.8) {
    return raiseTo(Math.max(L.raise.min, (pot + toCall * 2) * (0.55 + rnd() * 0.45)));
  }
  // a draw that can also win by making him fold
  if (L.raise && streetN < 2 && eq > 0.26 && eq < 0.46 && rnd() < bluffNow * 0.4) {
    return raiseTo(Math.max(L.raise.min, pot * 0.65));
  }
  if (eq >= potOdds + (st.cont - 0.22)) return call();
  if (toCall <= bb && eq > 0.16) return call();     // a token price into a big pot
  return fold();
}

// How long a bot appears to think. Short for an easy fold, longer for a decision
// that costs something - a table where everyone answers in 300ms feels canned.
export function thinkTime(action, view) {
  const base = 380 + Math.random() * 420;
  if (action.type === 'fold' && view.toCall <= view.bigBlind) return base * 0.6;
  if (action.type === 'raise' || action.type === 'bet') return base * 1.35;
  return base;
}
