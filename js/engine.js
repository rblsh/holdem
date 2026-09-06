// The table: blinds, the four betting rounds, all-ins, side pots and the
// showdown. The engine holds no DOM and never decides for a player - it emits
// what happened and waits to be told the next action, so the view can take as
// long as it likes over an animation and the tests can take none at all.
import { Deck } from './cards.js';
import { evalHand, best5 } from './eval.js';

export const STREETS = ['preflop', 'flop', 'turn', 'river'];

// Position names, read from the small blind round to the button. The seats are
// named from the button backwards, except that the earliest one is always under
// the gun: six-handed that gives SB, BB, UTG, HJ, CO, BTN.
const POS_TAIL = ['BTN', 'CO', 'HJ', 'LJ'];
export function positionNames(n) {
  if (n === 2) return ['SB', 'BB'];
  const k = n - 2;
  let tail;
  if (k <= 4) {
    tail = POS_TAIL.slice(0, k).reverse();
    if (k >= 2) tail[0] = 'UTG';
  } else {
    const early = ['UTG'];
    for (let j = 1; j < k - 4 + 1; j++) early.push('UTG+' + j);
    tail = early.concat(POS_TAIL.slice(0, 4).reverse().slice(1));
  }
  return ['SB', 'BB'].concat(tail);
}

export class Table {
  constructor(opts = {}) {
    this.smallBlind = opts.smallBlind || 5;
    this.bigBlind = opts.bigBlind || 10;
    this.startStack = opts.startStack || 1000;
    this.rnd = opts.rnd || null;
    this.deck = new Deck(this.rnd);
    this.handNo = 0;
    this.button = opts.button != null ? opts.button : 0;
    this.listeners = {};
    this.seats = (opts.seats || []).map((s, i) => ({
      i, id: s.id != null ? s.id : i,
      name: s.name || `Seat ${i + 1}`,
      bot: s.bot || null,
      hero: !!s.hero,
      chips: s.chips != null ? s.chips : this.startStack,
      buyIn: s.chips != null ? s.chips : this.startStack,
      cards: [], folded: true, allIn: false, inHand: false,
      bet: 0, committed: 0, acted: false, canRaise: true,
      lastAction: null, won: 0,
    }));
    this.reset();
  }

  reset() {
    this.board = [];
    this.pot = 0;
    this.street = 'preflop';
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.toAct = -1;
    this.pots = [];
    this.done = true;
    this.showdown = false;
  }

  on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); return this; }
  emit(ev, data) { const l = this.listeners[ev]; if (l) for (const f of l) f(data || {}); if (this.listeners['*']) for (const f of this.listeners['*']) f({ ev, ...data }); }

  // ---- helpers ------------------------------------------------------------
  get live() { return this.seats.filter(s => s.inHand && !s.folded); }
  get actors() { return this.live.filter(s => s.chips > 0); }
  seatAfter(i, pred) {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) { const s = this.seats[(i + k) % n]; if (pred(s)) return s; }
    return null;
  }

  positionOf(seat) {
    const inHand = this.seats.filter(s => s.inHand);
    if (!seat.inHand) return '';
    const n = inHand.length;
    const names = positionNames(n);
    // walk from the small blind so the names line up with the seating order
    const first = n === 2 ? this.button : (this.seatAfter(this.button, s => s.inHand) || {}).i;
    const order = [];
    let k = first;
    for (let c = 0; c < n; c++) { order.push(k); k = this.seatAfter(k, s => s.inHand).i; }
    return names[order.indexOf(seat.i)] || '';
  }

  // ---- the hand -----------------------------------------------------------
  startHand(opts = {}) {
    const playing = this.seats.filter(s => s.chips > 0);
    if (playing.length < 2) { this.emit('table:stuck', {}); return false; }

    this.handNo++;
    this.deck.reset();
    if (opts.stack) this.deck.stack(opts.stack);
    this.board = [];
    this.pot = 0;
    this.pots = [];
    this.street = 'preflop';
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.done = false;
    this.showdown = false;

    for (const s of this.seats) {
      s.cards = []; s.bet = 0; s.committed = 0; s.acted = false; s.canRaise = true;
      s.lastAction = null; s.won = 0; s.allIn = false;
      s.inHand = s.chips > 0;
      s.folded = !s.inHand;
      s.startChips = s.chips;
    }

    // the button moves to the next seat that can play
    if (this.handNo > 1) this.button = this.seatAfter(this.button, s => s.inHand).i;
    else if (!this.seats[this.button].inHand) this.button = this.seatAfter(this.button, s => s.inHand).i;

    const n = this.live.length;
    const sb = n === 2 ? this.seats[this.button] : this.seatAfter(this.button, s => s.inHand);
    const bb = this.seatAfter(sb.i, s => s.inHand);
    this.sbSeat = sb.i; this.bbSeat = bb.i;

    this.emit('hand:start', { handNo: this.handNo, button: this.button, sb: sb.i, bb: bb.i });

    this.post(sb, this.smallBlind, 'sb');
    this.post(bb, this.bigBlind, 'bb');
    this.currentBet = Math.max(sb.bet, bb.bet);
    this.lastRaiseSize = this.bigBlind;

    // hole cards, one at a time round the table starting left of the button
    const order = [];
    let k = sb.i;
    for (let round = 0; round < 2; round++) {
      for (let c = 0; c < n; c++) {
        const s = this.seats[k];
        s.cards.push(this.deck.draw());
        order.push({ seat: k, index: round });
        k = this.seatAfter(k, x => x.inHand).i;
      }
    }
    this.emit('deal', { order });

    // Preflop the button acts first heads-up, otherwise the seat left of the big
    // blind. Both blinds can be all-in already, and then nobody has an action.
    const firstActor = n === 2 ? this.seats[this.button] : this.seatAfter(bb.i, x => x.inHand && x.chips > 0);
    if (firstActor && firstActor.chips > 0 && !firstActor.folded) {
      this.toAct = firstActor.i;
      this.emit('turn', { seat: this.toAct, legal: this.legal() });
    } else {
      this.toAct = bb.i;
      this.advance();
    }
    return true;
  }

  post(seat, amount, kind) {
    const put = Math.min(amount, seat.chips);
    seat.chips -= put; seat.bet += put; seat.committed += put;
    if (seat.chips === 0) seat.allIn = true;
    this.emit('post', { seat: seat.i, amount: put, kind, allIn: seat.allIn });
  }

  // ---- what the player to act may do --------------------------------------
  legal(i = this.toAct) {
    const s = this.seats[i];
    if (!s || this.done) return null;
    const toCall = Math.min(this.currentBet - s.bet, s.chips);
    const maxTo = s.bet + s.chips;
    const isBet = this.currentBet === 0;
    let raise = null;
    if (s.canRaise && s.chips > toCall) {
      const wantTo = isBet ? Math.max(this.bigBlind, this.lastRaiseSize) : this.currentBet + this.lastRaiseSize;
      raise = { min: Math.min(wantTo, maxTo), max: maxTo, isBet };
    }
    return {
      seat: i,
      fold: true,
      check: toCall === 0,
      call: toCall > 0 ? toCall : 0,
      callAllIn: toCall > 0 && toCall === s.chips,
      raise,
      toCall, pot: this.potTotal(), currentBet: this.currentBet, myBet: s.bet, chips: s.chips,
    };
  }

  potTotal() { return this.pot + this.seats.reduce((a, s) => a + s.bet, 0); }

  // ---- acting -------------------------------------------------------------
  act(a) {
    if (this.done) throw new Error('hand is over');
    const s = this.seats[this.toAct];
    const L = this.legal();
    let type = a.type, amount = 0, allIn = false;

    if (type === 'check' && !L.check) type = 'fold';
    if (type === 'call' && L.call === 0) type = 'check';

    if (type === 'fold') {
      s.folded = true; s.acted = true;
    } else if (type === 'check') {
      s.acted = true;
    } else if (type === 'call') {
      amount = L.call;
      s.chips -= amount; s.bet += amount; s.committed += amount; s.acted = true;
      if (s.chips === 0) { s.allIn = true; allIn = true; }
    } else if (type === 'bet' || type === 'raise') {
      if (!L.raise) throw new Error('raising is not allowed here');
      let to = Math.round(a.to != null ? a.to : a.amount);
      if (to > L.raise.max) to = L.raise.max;
      if (to < L.raise.min) to = L.raise.min;
      const put = to - s.bet;
      const raiseSize = to - this.currentBet;
      s.chips -= put; s.bet = to; s.committed += put; s.acted = true;
      if (s.chips === 0) { s.allIn = true; allIn = true; }
      const full = raiseSize >= this.lastRaiseSize;
      const prevBet = this.currentBet;
      this.currentBet = to;
      if (full) this.lastRaiseSize = raiseSize;
      // Re-open the round. A full raise puts everybody back in; an all-in that
      // falls short of a full raise lets those who already acted call or fold
      // but not raise again - the standard rule, and the one that quietly goes
      // missing in home-made engines.
      for (const o of this.seats) {
        if (o === s || !o.inHand || o.folded || o.chips === 0) continue;
        if (full) { o.acted = false; o.canRaise = true; }
        else if (o.bet < this.currentBet) { if (o.acted) o.canRaise = false; o.acted = false; }
      }
      amount = put; type = prevBet === 0 ? 'bet' : 'raise';
      this.emit('action', { seat: s.i, type, amount, to, allIn, chips: s.chips });
      s.lastAction = { type, to, amount, allIn };
      this.advance();
      return;
    }

    s.lastAction = { type, to: s.bet, amount, allIn };
    this.emit('action', { seat: s.i, type, amount, to: s.bet, allIn, chips: s.chips });
    this.advance();
  }

  advance(silent = false) {
    if (this.live.length <= 1) { this.collect(); this.finish(); return; }
    const next = this.seatAfter(this.toAct, s =>
      s.inHand && !s.folded && s.chips > 0 && (!s.acted || s.bet < this.currentBet));
    if (next) {
      this.toAct = next.i;
      this.emit('turn', { seat: this.toAct, legal: this.legal() });
      return;
    }
    this.endStreet();
  }

  endStreet() {
    this.collect();
    if (this.live.length <= 1) { this.finish(); return; }

    // With fewer than two players who still have chips there is nothing left to
    // bet: the rest of the board is dealt and the hand goes to showdown.
    const noMoreBetting = this.actors.length < 2;
    let street = this.street;

    const dealNext = () => {
      if (street === 'preflop') { street = 'flop'; return this.deck.drawN(3); }
      if (street === 'flop') { street = 'turn'; return [this.deck.draw()]; }
      if (street === 'turn') { street = 'river'; return [this.deck.draw()]; }
      return null;
    };

    if (noMoreBetting) {
      while (street !== 'river') {
        const cards = dealNext();
        this.board.push(...cards);
        this.street = street;
        this.emit('street', { street, cards, board: this.board.slice(), runout: true });
      }
      this.finish();
      return;
    }

    if (street === 'river') { this.finish(); return; }
    const cards = dealNext();
    this.board.push(...cards);
    this.street = street;
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    for (const s of this.seats) { s.bet = 0; s.acted = false; s.canRaise = true; s.lastAction = null; }
    this.emit('street', { street, cards, board: this.board.slice() });

    const first = this.seatAfter(this.button, s => s.inHand && !s.folded && s.chips > 0);
    this.toAct = first.i;
    this.emit('turn', { seat: this.toAct, legal: this.legal() });
  }

  collect() {
    const bets = [];
    for (const s of this.seats) if (s.bet > 0) { bets.push({ seat: s.i, amount: s.bet }); this.pot += s.bet; s.bet = 0; }
    if (bets.length) this.emit('collect', { street: this.street, bets, pot: this.pot });
  }

  // ---- the end of the hand ------------------------------------------------
  finish() {
    // Give back the part of the last bet that nobody could cover. Without this
    // a lone raiser "wins" chips that were always his.
    const commits = this.seats.map(s => s.committed).sort((a, b) => b - a);
    const top = commits[0], second = commits[1] != null ? commits[1] : 0;
    if (top > second) {
      const s = this.seats.find(x => x.committed === top);
      const back = top - second;
      s.chips += back; s.committed -= back; this.pot -= back;
      this.emit('return', { seat: s.i, amount: back });
    }

    this.pots = this.buildPots();
    const live = this.live;

    if (live.length === 1) {
      const w = live[0];
      const amount = this.pots.reduce((a, p) => a + p.amount, 0);
      w.chips += amount; w.won = amount;
      this.emit('award', { pots: [{ amount, winners: [{ seat: w.i, amount }], shown: false }], uncontested: true });
    } else {
      this.showdown = true;
      const strength = new Map();
      for (const s of live) {
        const seven = s.cards.concat(this.board);
        strength.set(s.i, { value: evalHand(seven), best: best5(seven) });
      }
      // Reveal in the order the table would: the last aggressor first, then
      // clockwise. Cheap to compute, and it reads like a real showdown.
      const reveals = live.map(s => ({ seat: s.i, cards: s.cards.slice(), value: strength.get(s.i).value, best: strength.get(s.i).best }));
      this.emit('reveal', { reveals, board: this.board.slice() });

      const awarded = [];
      for (const p of this.pots) {
        const contenders = p.eligible.filter(i => !this.seats[i].folded);
        let bestV = -1;
        for (const i of contenders) bestV = Math.max(bestV, strength.get(i).value);
        const winners = contenders.filter(i => strength.get(i).value === bestV);
        const share = Math.floor(p.amount / winners.length);
        let rest = p.amount - share * winners.length;
        // Odd chips go clockwise from the small blind, as at a real table.
        const ordered = [];
        let k = this.sbSeat != null ? this.seats[this.sbSeat].i : this.button;
        const startPred = i => winners.includes(i);
        if (startPred(k)) ordered.push(k);
        for (let c = 0; c < this.seats.length; c++) {
          k = this.seatAfter(k, () => true).i;
          if (startPred(k) && !ordered.includes(k)) ordered.push(k);
        }
        const list = ordered.length ? ordered : winners;
        const parts = list.map(i => ({ seat: i, amount: share, value: strength.get(i).value, best: strength.get(i).best }));
        for (let j = 0; rest > 0; j++, rest--) parts[j % parts.length].amount++;
        for (const w of parts) { this.seats[w.seat].chips += w.amount; this.seats[w.seat].won += w.amount; }
        awarded.push({ amount: p.amount, winners: parts, shown: true });
      }
      this.emit('award', { pots: awarded, uncontested: false });
    }

    this.pot = 0;
    this.done = true;
    this.toAct = -1;
    const results = this.seats.map(s => ({ seat: s.i, net: s.chips - s.startChips, chips: s.chips }));
    this.emit('hand:end', { results, handNo: this.handNo });
  }

  // Main pot first, then one side pot per all-in level. Folded money is in the
  // pot but its owner is never eligible for it.
  buildPots() {
    const levels = [...new Set(this.seats.filter(s => s.committed > 0).map(s => s.committed))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lv of levels) {
      let amount = 0;
      for (const s of this.seats) amount += Math.min(s.committed, lv) - Math.min(s.committed, prev);
      const eligible = this.seats.filter(s => s.inHand && !s.folded && s.committed >= lv).map(s => s.i);
      if (amount > 0 && eligible.length) {
        const last = pots[pots.length - 1];
        // levels that nobody was knocked out on produce the same eligible set
        if (last && last.eligible.length === eligible.length && last.eligible.every((x, j) => x === eligible[j])) last.amount += amount;
        else pots.push({ amount, eligible });
      } else if (amount > 0 && pots.length) {
        pots[pots.length - 1].amount += amount;      // dead money from folds
      }
      prev = lv;
    }
    return pots;
  }

  // ---- a read-only view for a bot, with nobody else's cards in it ----------
  viewFor(i) {
    const s = this.seats[i];
    const L = this.legal(i);
    return {
      hole: s.cards.slice(),
      board: this.board.slice(),
      street: this.street,
      pot: this.potTotal(),
      toCall: L.toCall,
      chips: s.chips,
      myBet: s.bet,
      currentBet: this.currentBet,
      raise: L.raise,
      bigBlind: this.bigBlind,
      committed: s.committed,
      position: this.positionOf(s),
      seatsLeftToAct: this.actors.filter(o => o !== s && (!o.acted || o.bet < this.currentBet)).length,
      opponents: this.live.filter(o => o !== s).length,
      aggressors: this.live.filter(o => o !== s && o.lastAction && (o.lastAction.type === 'bet' || o.lastAction.type === 'raise')).length,
      legal: L,
    };
  }
}
