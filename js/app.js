// The table on screen. The engine emits what happened; this file turns each
// event into an animation, queues them so they play in order, and waits for the
// hero between them. Nothing here decides anything about the game.
import { Table } from './engine.js';
import { decide, thinkTime, STYLES } from './bots.js';
import { RANKS, SUITS, RED, rankOf, suitOf } from './cards.js';
import { evalHand, handName, handNameShort } from './eval.js';
import { Spring, wait, reducedMotion, flyTo, running as SPRINGS_RUNNING } from './spring.js';
import { sound, setEnabled as setSound, isEnabled as soundOn, unlock as unlockSound } from './sound.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- storage that never throws ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('hd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hd.' + k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- money ---------- */
const SUFFIX = ['', 'K', 'M', 'B', 'T'];
function money(n) {
  n = Math.round(n);
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 1000000) return sign + n.toLocaleString('en-US');
  let i = 0;
  while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
  return sign + (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.round(n)) + SUFFIX[i];
}

/* ---------- settings and session ---------- */
const BB = 10, SB = 5, BUYIN = 1000;
const NAMES = ['Nora', 'Vik', 'Sam', 'Iris', 'Dan', 'Ada', 'Ben'];
const STYLE_POOL = ['shark', 'solid', 'station', 'maniac', 'rock', 'solid'];

let seatCount = clamp(store.get('seats', 6), 2, 6);
if (seatCount !== 2 && seatCount !== 3 && seatCount !== 6) seatCount = 6;

const blankStats = () => ({ hands: 0, won: 0, sd: 0, sdWon: 0, best: 0, bestPot: 0, net: 0, buyIns: 1, streak: 0, bestStreak: 0 });
let stats = Object.assign(blankStats(), store.get('stats', {}));
let heroStack = store.get('stack', BUYIN);
if (!(heroStack > 0)) heroStack = BUYIN;

/* ---------- seat geometry ----------
   x and y are percentages of the felt; wd and dd are pixel offsets from the
   centre of the seat, scaled with the table, for the wager and the button. */
const LAYOUTS = {
  2: [{ x: 50, y: 85, wd: [0, -78], dd: [74, 12] },
      { x: 50, y: 17, wd: [0, 52], dd: [58, 14] }],
  3: [{ x: 50, y: 85, wd: [0, -78], dd: [74, 12] },
      { x: 18, y: 26, wd: [54, 20], dd: [50, 20] },
      { x: 82, y: 26, wd: [-54, 20], dd: [-50, 20] }],
  6: [{ x: 50, y: 85, wd: [0, -78], dd: [74, 12] },
      { x: 15, y: 69, wd: [58, -14], dd: [50, 12] },
      { x: 15, y: 30, wd: [58, 18], dd: [50, 20] },
      { x: 50, y: 15, wd: [0, 50], dd: [58, 14] },
      { x: 85, y: 30, wd: [-58, 18], dd: [-50, 20] },
      { x: 85, y: 69, wd: [-58, -14], dd: [-50, 12] }],
};

/* ---------- card faces ---------- */
const PIP = {
  s: 'M12 2c1.6 3.6 8 6.4 8 11.1 0 2.5-1.9 4.3-4.2 4.3-1.5 0-2.7-.7-3.4-1.7.2 2 .8 3.4 1.8 4.3H9.8c1-.9 1.6-2.3 1.8-4.3-.7 1-1.9 1.7-3.4 1.7C5.9 17.4 4 15.6 4 13.1 4 8.4 10.4 5.6 12 2z',
  h: 'M12 21C6.6 16.9 3 13.9 3 10.1 3 7.2 5.2 5 8 5c1.7 0 3.2.8 4 2.1C12.8 5.8 14.3 5 16 5c2.8 0 5 2.2 5 5.1 0 3.8-3.6 6.8-9 10.9z',
  d: 'M12 2.5 20 12l-8 9.5L4 12z',
  c: 'M12 2.6c2.2 0 4 1.8 4 4 0 .6-.1 1.1-.3 1.6.6-.4 1.4-.6 2.1-.6 2.2 0 4 1.8 4 4s-1.8 4-4 4c-1.6 0-3-.9-3.6-2.3.1 2.4.8 4.1 1.9 5.1H7.9c1.1-1 1.8-2.7 1.9-5.1-.6 1.4-2 2.3-3.6 2.3-2.2 0-4-1.8-4-4s1.8-4 4-4c.7 0 1.5.2 2.1.6-.2-.5-.3-1-.3-1.6 0-2.2 1.8-4 4-4z',
};
function pipSVG(suit, cls) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls || ''}"><path d="${PIP[SUITS[suit]]}" fill="currentColor"/></svg>`;
}
function cardEl(card, width) {
  const el = document.createElement('div');
  el.className = 'card';
  if (width) el.style.setProperty('--w', width);
  const face = card == null ? '' :
    `<span class="rk">${RANKS[rankOf(card)]}${pipSVG(suitOf(card))}</span><span class="pip">${pipSVG(suitOf(card))}</span>`;
  el.innerHTML = `<div class="in"><div class="f${card != null && RED[suitOf(card)] ? ' red' : ''}">${face}</div><div class="b"></div></div>`;
  el._in = el.querySelector('.in');
  el._face = el.querySelector('.f');
  el.card = card;
  el.faceUp = false;
  el._in.style.transform = 'rotateY(180deg)';
  return el;
}
function setCard(el, card) {
  el.card = card;
  el._face.className = 'f' + (RED[suitOf(card)] ? ' red' : '');
  el._face.innerHTML = `<span class="rk">${RANKS[rankOf(card)]}${pipSVG(suitOf(card))}</span><span class="pip">${pipSVG(suitOf(card))}</span>`;
}
function flip(el, up = true, opts = {}) {
  const from = el.faceUp ? 0 : 180;
  const to = up ? 0 : 180;
  el.faceUp = up;
  if (from === to) return Promise.resolve();
  const s = new Spring(from, v => { el._in.style.transform = `rotateY(${v}deg)`; }, { response: opts.response || 0.36, eps: 0.4 });
  return s.to(to);
}

/* ---------- chips ---------- */
function chipTiers() { return [SB, BB * 2, BB * 10, BB * 50]; }
function chipStack(amount) {
  const den = chipTiers();
  const out = [];
  let rest = amount;
  for (let i = den.length - 1; i >= 0 && out.length < 5; i--) {
    let n = Math.floor(rest / den[i]);
    if (n <= 0) continue;
    n = Math.min(n, 5 - out.length);
    for (let j = 0; j < n; j++) out.push(i);
    rest -= n * den[i];
  }
  if (!out.length && amount > 0) out.push(0);
  return out;
}
function stackHTML(amount) {
  const list = chipStack(amount);
  if (!list.length) return '<span class="stack empty"></span>';
  return `<span class="stack" style="--n:${list.length}">` +
    list.map((t, i) => `<span class="ch c${t + 1}" style="--i:${i}"></span>`).join('') + '</span>';
}

/* ---------- the table on screen ---------- */
const felt = $('felt'), seatsBox = $('seats'), boardBox = $('board'), flyBox = $('fly');
let table = null;
let ui = [];                 // one entry per seat: its DOM and springs
let potSpring = null, potShown = 0;
let busy = false, heroResolve = null, currentLegal = null, raiseTo = 0;
let queue = [], draining = false;
let autoTimer = null;

let K = 1;
const CARD_W = 50, CARD_WM = 31;      // card widths at scale 1, matching --cw and --cwm
function scale() {
  const w = felt.clientWidth, h = felt.clientHeight;
  K = clamp(Math.min(w / 430, h / 400), 0.7, 1.45);
  document.documentElement.style.setProperty('--k', K.toFixed(3));
  return K;
}

function buildTable() {
  const styles = STYLE_POOL.slice(0, seatCount - 1);
  const seats = [{ name: 'You', hero: true, chips: heroStack }];
  for (let i = 0; i < seatCount - 1; i++) seats.push({ name: NAMES[i], bot: styles[i], chips: BUYIN });
  table = new Table({ seats, smallBlind: SB, bigBlind: BB, startStack: BUYIN, button: seatCount - 1 });
  wireEngine(table);
  buildSeats();
  window.__hd = { table, ui, stats, chipStack, // "nothing is moving": waiting for the hero to press something is not
    // motion, and a screenshot taken then is a valid frame
    busy: () => draining || queue.length > 0 || SPRINGS_RUNNING() || (busy && !heroResolve) };
}

function buildSeats() {
  seatsBox.innerHTML = '';
  ui = [];
  const layout = LAYOUTS[seatCount];
  table.seats.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'seat' + (s.hero ? ' hero' : '');
    el.style.setProperty('--x', layout[i].x);
    el.style.setProperty('--y', layout[i].y);
    el.innerHTML =
      `<div class="hole"></div>
       <div class="plate"><span class="ring"></span><span class="nm"></span><span class="st num"></span><span class="pos"></span></div>
       <div class="tag"></div>
       <div class="dealer">D</div>
       <div class="wager"><span class="chips"></span><span class="amt num"></span></div>`;
    seatsBox.appendChild(el);
    const o = {
      el, hole: el.querySelector('.hole'), plate: el.querySelector('.plate'),
      nm: el.querySelector('.nm'), st: el.querySelector('.st'), pos: el.querySelector('.pos'),
      tag: el.querySelector('.tag'), dealer: el.querySelector('.dealer'),
      wager: el.querySelector('.wager'), wagerChips: el.querySelector('.wager .chips'),
      wagerAmt: el.querySelector('.wager .amt'), cards: [], shown: 0,
    };
    o.nm.textContent = s.hero ? 'You' : s.name;
    o.stackSpring = new Spring(s.chips, v => { o.st.textContent = money(v); }, { response: 0.5, eps: 0.6 });
    o.st.textContent = money(s.chips);   // a spring only paints when it moves, and before the first hand it has not
    // the position of these two lives in CSS `translate`; the spring drives
    // `scale`, a separate property, so the two never overwrite each other
    o.tagSpring = new Spring(0, v => { o.tag.style.scale = String(0.7 + 0.3 * v); o.tag.style.opacity = v; }, { response: 0.3, eps: 0.01 });
    o.wagerSpring = new Spring(0, v => { o.wager.style.scale = String(0.6 + 0.4 * v); o.wager.style.opacity = v; }, { response: 0.3, eps: 0.01 });
    ui.push(o);
    placeSeat(i);
  });
  layoutAll();
}
function placeSeat(i) {
  const l = LAYOUTS[seatCount][i], o = ui[i];
  o.wager.style.left = `calc(50% + ${(l.wd[0] * K).toFixed(1)}px)`;
  o.wager.style.top = `calc(50% + ${(l.wd[1] * K).toFixed(1)}px)`;
  o.dealer.style.left = `calc(50% + ${(l.dd[0] * K).toFixed(1)}px)`;
  o.dealer.style.top = `calc(50% + ${(l.dd[1] * K).toFixed(1)}px)`;
}
function layoutAll() {
  scale();
  for (let i = 0; i < ui.length; i++) { placeSeat(i); layoutHole(i); }
}
// two cards side by side, the second slightly turned so a pair of face-down
// cards does not read as one thick card
function layoutHole(i) {
  const o = ui[i], hero = table.seats[i].hero;
  const w = (hero ? CARD_W : CARD_WM) * K;
  o.cards.forEach((c, j) => {
    c.style.setProperty('--w', w + 'px');
    c._home = { x: j * (hero ? w + 6 : w * 0.62), y: 0, r: hero ? 0 : (j === 0 ? -4 : 4) };
    if (c._placed) c.style.transform = `translate(${c._home.x}px, ${c._home.y}px) rotate(${c._home.r}deg)`;
  });
}

/* the point new cards fly in from: the middle of the table, a little high */
function deckPoint() {
  const r = felt.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.30 };
}
function centrePoint() {
  const r = $('pot').getBoundingClientRect();
  const f = felt.getBoundingClientRect();
  return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: f.left + f.width / 2, y: f.top + f.height * 0.42 };
}

/* ---------- the event queue ---------- */
function push(fn) { queue.push(fn); }
async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) { const fn = queue.shift(); await fn(); }
  draining = false;
}

function wireEngine(t) {
  t.on('hand:start', e => push(async () => {
    boardBox.innerHTML = '';
    $('msg').className = 'msg';
    $('msg').textContent = '';
    potShown = 0;
    $('pot').classList.remove('on');
    $('potVal').textContent = '0';
    table.seats.forEach((s, i) => {
      const o = ui[i];
      o.el.className = 'seat' + (s.hero ? ' hero' : '') + (s.inHand ? '' : ' out');
      o.hole.innerHTML = ''; o.cards = []; o.shown = 0;
      o.tagSpring.jump(0); o.wagerSpring.jump(0);
      o.stackSpring.jump(s.chips);
      o.pos.textContent = s.inHand ? table.positionOf(s) : '';
      o.dealer.classList.toggle('on', i === e.button);
    });
    sound.shuffle();
    await wait(180);
  }));

  t.on('post', e => push(async () => {
    showWager(e.seat, table.seats[e.seat].bet);
    ui[e.seat].stackSpring.set(table.seats[e.seat].chips);
    setPot(table.potTotal());
    sound.chips(1);
    await wait(90);
  }));

  t.on('deal', e => push(async () => {
    const from = deckPoint();
    for (const step of e.order) {
      const s = table.seats[step.seat], o = ui[step.seat];
      const c = cardEl(s.hero ? s.cards[step.index] : null);
      o.hole.appendChild(c);
      o.cards.push(c);
      layoutHole(step.seat);
      const box = o.hole.getBoundingClientRect();
      const home = c._home;
      const start = { x: from.x - box.left, y: from.y - box.top };
      c.style.transform = `translate(${start.x}px, ${start.y}px) scale(.8)`;
      sound.deal();
      const spr = new Spring(0, p => {
        const x = start.x + (home.x - start.x) * p;
        const y = start.y + (home.y - start.y) * p;
        c.style.transform = `translate(${x}px, ${y}px) rotate(${home.r * p}deg) scale(${0.8 + 0.2 * p})`;
      }, { response: 0.34, eps: 0.003 });
      const done = spr.to(1);
      c._placed = true;
      if (s.hero) setTimeout(() => flip(c, true), 120);
      await wait(reducedMotion() ? 0 : 78);
      if (step === e.order[e.order.length - 1]) await done;
    }
  }));

  t.on('turn', e => push(async () => {
    ui.forEach((o, i) => o.el.classList.toggle('turn', i === e.seat));
  }));

  t.on('action', e => push(async () => {
    const s = table.seats[e.seat], o = ui[e.seat];
    o.stackSpring.set(s.chips);
    let text = '', cls = '';
    if (e.type === 'fold') { text = 'Fold'; sound.fold(); o.el.classList.add('folded'); }
    else if (e.type === 'check') { text = 'Check'; sound.check(); }
    else if (e.type === 'call') { text = e.allIn ? 'All-in' : 'Call ' + money(e.to); cls = e.allIn ? 'allin' : ''; e.allIn ? sound.allIn() : sound.chips(2); }
    else { text = e.allIn ? 'All-in ' + money(e.to) : (e.type === 'bet' ? 'Bet ' : 'Raise to ') + money(e.to); cls = e.allIn ? 'allin' : 'aggro'; e.allIn ? sound.allIn() : sound.chips(3); }
    o.tag.className = 'tag on ' + cls;
    o.tag.textContent = text;
    o.tagSpring.set(1);
    if (e.type === 'fold') {
      // the cards go into the muck; the seat keeps its height so the row of
      // plates stays level, and the tag drops into the space they left
      for (const c of o.cards) {
        const home = c._home;
        const s2 = new Spring(1, v => {
          c.style.opacity = String(v);
          c.style.transform = `translate(${home.x}px, ${home.y + 10 * (1 - v)}px) rotate(${home.r}deg) scale(${0.75 + 0.25 * v})`;
        }, { response: 0.32, eps: 0.01 });
        s2.set(0);
      }
    } else showWager(e.seat, s.bet);
    setPot(table.potTotal());
    await wait(reducedMotion() ? 0 : 150);
  }));

  t.on('collect', e => push(async () => {
    const to = centrePoint();
    const flights = [];
    for (const b of e.bets) {
      const o = ui[b.seat];
      const box = o.wager.getBoundingClientRect();
      if (!box.width) continue;
      const ghost = document.createElement('div');
      ghost.innerHTML = stackHTML(b.amount);
      flyBox.appendChild(ghost);
      const fr = flyBox.getBoundingClientRect();
      const from = { x: box.left + box.width / 2 - fr.left - 8, y: box.top + box.height / 2 - fr.top - 8 };
      o.wagerSpring.set(0);
      flights.push(flyTo(ghost, from, { x: to.x - fr.left - 8, y: to.y - fr.top - 8 }, { response: 0.36, scale: 0.7 })
        .then(() => ghost.remove()));
    }
    sound.chips(Math.min(4, e.bets.length + 1));
    setPot(table.potTotal());
    await Promise.all(flights);
  }));

  t.on('street', e => push(async () => {
    for (const card of e.cards) {
      const c = cardEl(card);
      c.style.transform = 'translateY(-14px) scale(.9)';
      boardBox.appendChild(c);
      sound.deal();
      const spr = new Spring(0, p => { c.style.transform = `translateY(${-14 * (1 - p)}px) scale(${0.9 + 0.1 * p})`; }, { response: 0.3, eps: 0.004 });
      spr.to(1);
      flip(c, true, { response: 0.32 });
      await wait(reducedMotion() ? 0 : 130);
    }
    ui.forEach(o => { o.tagSpring.set(0); o.wagerSpring.set(0); });
    await wait(reducedMotion() ? 0 : 90);
  }));

  t.on('return', e => push(async () => {
    ui[e.seat].stackSpring.set(table.seats[e.seat].chips);
    setPot(table.potTotal());
    sound.chips(1);
    await wait(60);
  }));

  t.on('reveal', e => push(async () => {
    for (const r of e.reveals) {
      const s = table.seats[r.seat], o = ui[r.seat];
      if (s.hero) continue;
      o.cards.forEach((c, j) => { setCard(c, r.cards[j]); });
      sound.flip();
      await Promise.all(o.cards.map(c => flip(c, true)));
      await wait(reducedMotion() ? 0 : 90);
    }
  }));

  t.on('award', e => push(async () => {
    const winners = new Map();
    for (const p of e.pots) for (const w of p.winners) winners.set(w.seat, (winners.get(w.seat) || 0) + w.amount);
    const from = centrePoint();
    const fr = flyBox.getBoundingClientRect();
    const flights = [];
    for (const [seat, amount] of winners) {
      const o = ui[seat];
      o.el.classList.add('winner');
      const box = o.plate.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.innerHTML = stackHTML(amount);
      flyBox.appendChild(ghost);
      flights.push(flyTo(ghost,
        { x: from.x - fr.left - 8, y: from.y - fr.top - 8 },
        { x: box.left + box.width / 2 - fr.left - 8, y: box.top + box.height / 2 - fr.top - 8 },
        { response: 0.4, scale: 0.8 }).then(() => { ghost.remove(); o.stackSpring.set(table.seats[seat].chips); }));
    }
    setPot(0);
    $('pot').classList.remove('on');
    announce(e, winners);
    await Promise.all(flights);
    await wait(reducedMotion() ? 0 : 120);
  }));

  t.on('hand:end', e => push(async () => {
    ui.forEach(o => o.el.classList.remove('turn'));
  }));
}

function showWager(i, amount) {
  const o = ui[i];
  if (amount <= 0) { o.wagerSpring.set(0); return; }
  o.wagerChips.innerHTML = stackHTML(amount);
  o.wagerAmt.textContent = money(amount);
  o.wagerSpring.set(1);
}
function setPot(n) {
  if (!potSpring) potSpring = new Spring(0, v => { $('potVal').textContent = money(v); }, { response: 0.45, eps: 0.6 });
  potShown = n;
  $('pot').classList.toggle('on', n > 0);
  potSpring.set(n);
}

/* ---------- what the table says at the end of a hand ---------- */
function announce(e, winners) {
  const msg = $('msg');
  const hero = table.seats.find(s => s.hero);
  const heroWon = winners.get(hero.i) || 0;
  const total = [...winners.values()].reduce((a, b) => a + b, 0);
  let text, cls;

  if (e.uncontested) {
    const seat = [...winners.keys()][0];
    text = seat === hero.i ? `You take ${money(heroWon)}` : `${table.seats[seat].name} takes it uncontested`;
    cls = seat === hero.i ? 'win' : 'info';
  } else {
    const parts = [];
    for (const p of e.pots) {
      for (const w of p.winners) {
        const s = table.seats[w.seat];
        parts.push(`${s.hero ? 'You' : s.name}: ${handNameShort(w.value)}`);
      }
    }
    const best = e.pots[0].winners[0];
    const shared = e.pots[0].winners.length > 1;
    const nameOf = i => table.seats[i].hero ? 'You' : table.seats[i].name;
    if (heroWon > 0 && !shared) text = `${handName(best.value)} - you win ${money(heroWon)}`;
    else if (heroWon > 0 && shared) text = `Split pot - ${handName(best.value)}, you take ${money(heroWon)}`;
    else text = `${nameOf(best.seat)} wins with ${handName(best.value)}`;
    cls = heroWon > 0 ? 'win' : 'lose';
    // dim the hands that lost, and ring the five cards that won
    const bestSet = new Set(best.best);
    for (const s of table.seats) {
      if (!s.inHand || s.folded) continue;
      const o = ui[s.i];
      const isWinner = winners.has(s.i);
      o.cards.forEach(c => { if (!isWinner) c.classList.add('dim'); else if (bestSet.has(c.card)) c.classList.add('pick'); });
    }
    [...boardBox.children].forEach(c => { if (bestSet.has(c.card)) c.classList.add('pick'); });
  }

  msg.textContent = text;
  msg.className = 'msg on ' + cls;
  if (heroWon > 0) (heroWon >= total * 0.9 && heroWon > BB * 12 ? sound.big() : sound.win()); else sound.lose();
}

/* ---------- the hero's turn ---------- */
function heroTurn() {
  return new Promise(res => {
    heroResolve = res;
    currentLegal = table.legal();
    showActs(currentLegal);
  });
}
function submit(action) {
  if (!heroResolve) return;
  const r = heroResolve; heroResolve = null;
  hideActs();
  r(action);
}

function showActs(L) {
  $('uiWait').hidden = true;
  $('uiNext').hidden = true;
  $('uiRebuy').hidden = true;
  $('acts').hidden = false;
  $('btnCall').textContent = '';
  const call = $('btnCall');
  call.innerHTML = (L.check ? 'Check' : `Call <span class="amt num">${money(L.toCall)}</span>`) + ' <kbd>C</kbd>';
  const raise = $('btnRaise');
  if (L.raise) {
    $('sizer').hidden = false;
    raiseTo = clamp(raiseTo, L.raise.min, L.raise.max);
    if (raiseTo < L.raise.min) raiseTo = L.raise.min;
    setRaise(suggestSize(L), L);
    raise.disabled = false;
  } else {
    $('sizer').hidden = true;
    raise.disabled = true;
    raise.innerHTML = 'Raise <kbd>R</kbd>';
  }
  updateRaiseLabel(L);
  $('hint').textContent = describeSpot(L);
}
function hideActs() {
  $('acts').hidden = true;
  $('sizer').hidden = true;
  $('uiWait').hidden = false;
  $('waiting').textContent = 'Waiting…';
}
function suggestSize(L) {
  const pot = L.pot;
  const want = L.raise.isBet ? Math.round(pot * 0.6) : Math.round(L.currentBet * 2.5);
  return clamp(want, L.raise.min, L.raise.max);
}
function setRaise(v, L) {
  L = L || currentLegal;
  if (!L || !L.raise) return;
  raiseTo = clamp(Math.round(v), L.raise.min, L.raise.max);
  const span = L.raise.max - L.raise.min;
  $('slider').value = span > 0 ? Math.round((raiseTo - L.raise.min) / span * 100) : 100;
  $('sizeVal').textContent = money(raiseTo);
  updateRaiseLabel(L);
  markPreset(L);
}
function updateRaiseLabel(L) {
  const b = $('btnRaise');
  if (!L || !L.raise) return;
  const allIn = raiseTo >= L.raise.max;
  const word = allIn ? 'All-in' : L.raise.isBet ? 'Bet' : 'Raise to';
  b.innerHTML = `${word} <span class="amt num">${money(raiseTo)}</span> <kbd>R</kbd>`;
}
function presetValue(kind, L) {
  const pot = L.pot, call = L.toCall;
  switch (kind) {
    case 'min': return L.raise.min;
    case 'half': return L.myBet + call + Math.round((pot + call) * 0.5);
    case 'three': return L.myBet + call + Math.round((pot + call) * 0.75);
    case 'pot': return L.myBet + call + (pot + call);
    default: return L.raise.max;
  }
}
function markPreset(L) {
  for (const b of $('presets').children) {
    const v = clamp(presetValue(b.dataset.preset, L), L.raise.min, L.raise.max);
    b.setAttribute('aria-pressed', String(v === raiseTo));
    b.disabled = false;
  }
}
function describeSpot(L) {
  const pot = L.pot;
  if (L.toCall > 0) {
    const odds = Math.round(100 * L.toCall / (pot + L.toCall));
    return `Pot ${money(pot)} · calling ${money(L.toCall)} needs to win ${odds}% of the time`;
  }
  return `Pot ${money(pot)} · nothing to call`;
}

/* ---------- the loop ---------- */
async function playHand() {
  if (busy) return;
  const hero = table.seats.find(s => s.hero);
  if (hero.chips < BB) { offerRebuy(); return; }
  for (const s of table.seats) {
    if (s.hero) continue;
    if (s.chips < BB) { s.chips = BUYIN; ui[s.i].stackSpring.set(BUYIN); }
  }
  busy = true;
  $('uiNext').hidden = true;
  $('uiWait').hidden = false;
  $('waiting').textContent = 'Dealing…';
  unlockSound();

  const startChips = hero.chips;
  table.startHand();
  await drain();

  while (!table.done) {
    const i = table.toAct;
    const s = table.seats[i];
    if (s.hero) {
      const a = await heroTurn();
      table.act(a);
    } else {
      const v = table.viewFor(i);
      const a = decide(v, s.bot, Math.random);
      await wait(thinkTime(a, v));
      table.act(a);
    }
    await drain();
  }

  recordHand(hero, startChips);
  heroStack = hero.chips;
  store.set('stack', heroStack);
  busy = false;
  $('uiWait').hidden = true;
  $('btnNext').innerHTML = 'Next hand <kbd>Space</kbd>';
  if (hero.chips < BB) offerRebuy(); else { $('uiNext').hidden = false; $('btnNext').focus({ preventScroll: true }); }
  $('hint').textContent = hintLine();
}

function recordHand(hero, startChips) {
  const net = hero.chips - startChips;
  stats.hands++;
  stats.net += net;
  if (net > 0) { stats.won++; stats.streak = Math.max(0, stats.streak) + 1; }
  else if (net < 0) { stats.streak = Math.min(0, stats.streak) - 1; }
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  if (table.showdown && hero.inHand && !hero.folded) {
    stats.sd++;
    if (net > 0) stats.sdWon++;
  }
  const potSize = table.seats.reduce((a, s) => a + s.committed, 0);
  stats.bestPot = Math.max(stats.bestPot, potSize);
  if (hero.inHand && !hero.folded && table.board.length === 5) {
    // the hero's own hand, whether or not it went to showdown
    const v = evalHand(hero.cards.concat(table.board));
    if (v > stats.best) stats.best = v;
  }
  store.set('stats', stats);
  $('heroStack').textContent = money(hero.chips);
}
function hintLine() {
  if (!stats.hands) return `No-limit hold'em · blinds ${SB}/${BB} · buy-in ${money(BUYIN)}`;
  const line = `${stats.hands} hand${stats.hands === 1 ? '' : 's'} · net ${stats.net >= 0 ? '+' : ''}${money(stats.net)}`;
  // BB/100 off twenty hands is a number about nothing, and printing it invites
  // the reader to believe it
  if (stats.hands < 20) return line;
  const bb = stats.net / BB / stats.hands * 100;
  return `${line} · ${bb >= 0 ? '+' : ''}${bb.toFixed(0)} BB/100`;
}
function offerRebuy() {
  $('uiNext').hidden = true;
  $('uiWait').hidden = true;
  $('uiRebuy').hidden = false;
  $('btnRebuy').textContent = `Buy in again for ${money(BUYIN)}`;
  $('msg').textContent = 'You are out of chips.';
  $('msg').className = 'msg on info';
}

/* ---------- controls ---------- */
function press(el, fn) {
  el.addEventListener('pointerdown', ev => {
    el.classList.add('pressed');
    const x0 = ev.clientX, y0 = ev.clientY;
    let cancelled = false;
    const move = e2 => { if (Math.hypot(e2.clientX - x0, e2.clientY - y0) > 10) { cancelled = true; el.classList.remove('pressed'); } };
    const up = () => { el.classList.remove('pressed'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  el.addEventListener('click', fn);
}

press($('btnFold'), () => { sound.click(); submit({ type: 'fold' }); });
press($('btnCall'), () => { sound.click(); submit({ type: currentLegal && currentLegal.check ? 'check' : 'call' }); });
press($('btnRaise'), () => { sound.click(); submit({ type: currentLegal && currentLegal.raise && currentLegal.raise.isBet ? 'bet' : 'raise', to: raiseTo }); });
press($('btnNext'), () => { sound.click(); playHand(); });
press($('btnRebuy'), () => {
  const hero = table.seats.find(s => s.hero);
  hero.chips = BUYIN; heroStack = BUYIN; stats.buyIns++;
  store.set('stack', heroStack); store.set('stats', stats);
  ui[hero.i].stackSpring.set(BUYIN);
  $('heroStack').textContent = money(BUYIN);
  $('uiRebuy').hidden = true;
  playHand();
});

$('slider').addEventListener('input', () => {
  if (!currentLegal || !currentLegal.raise) return;
  const L = currentLegal;
  const span = L.raise.max - L.raise.min;
  setRaise(L.raise.min + span * ($('slider').value / 100), L);
});
for (const b of $('presets').children) {
  press(b, () => {
    if (!currentLegal || !currentLegal.raise) return;
    sound.click();
    setRaise(presetValue(b.dataset.preset, currentLegal), currentLegal);
  });
}

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' && e.key !== 'Escape') return;
  const k = e.key.toLowerCase();
  if (!$('sheet').hidden) { if (e.key === 'Escape') closeSheet(); return; }
  if (e.key === 'Escape' && tools.classList.contains('open')) {
    tools.classList.remove('open'); $('btnMenu').setAttribute('aria-expanded', 'false'); $('btnMenu').focus();
    return;
  }
  if (k === 'f' && !$('acts').hidden) { e.preventDefault(); $('btnFold').click(); }
  else if (k === 'c' && !$('acts').hidden) { e.preventDefault(); $('btnCall').click(); }
  else if (k === 'r' && !$('acts').hidden && !$('btnRaise').disabled) { e.preventDefault(); $('btnRaise').click(); }
  else if (e.key === ' ' || e.key === 'Enter') {
    if (!$('uiNext').hidden) { e.preventDefault(); $('btnNext').click(); }
    else if (!$('uiRebuy').hidden) { e.preventDefault(); $('btnRebuy').click(); }
  }
});

/* ---------- theme ---------- */
const themeSeg = $('themeSeg'), themeKnob = $('themeKnob');
const MODES = ['light', 'auto', 'dark'];
let themeMode = store.get('theme', 'auto');
const knobSpring = new Spring(0, v => { themeKnob.style.transform = `translateX(${v}px)`; }, { response: 0.32, eps: 0.2 });
function applyTheme(mode, animate = true) {
  themeMode = mode;
  store.set('theme', mode);
  const dark = mode === 'dark' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme-mode', mode);
  const i = MODES.indexOf(mode);
  [...themeSeg.querySelectorAll('button')].forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  const w = 32;
  knobSpring.set(i * w, animate ? {} : { immediate: true });
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', dark ? '#0F1011' : '#F5F5F6');
}
for (const b of themeSeg.querySelectorAll('button')) press(b, () => { sound.click(); applyTheme(b.dataset.mode); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themeMode === 'auto') applyTheme('auto', false); });

/* ---------- sound toggle ---------- */
setSound(store.get('sound', true));
$('btnSound').classList.toggle('off', !soundOn());
$('btnSound').setAttribute('aria-pressed', String(soundOn()));
press($('btnSound'), () => {
  setSound(!soundOn());
  store.set('sound', soundOn());
  $('btnSound').classList.toggle('off', !soundOn());
  $('btnSound').setAttribute('aria-pressed', String(soundOn()));
  $('btnSound').setAttribute('aria-label', soundOn() ? 'Sound on' : 'Sound off');
  if (soundOn()) sound.chips(1);
});

/* ---------- the phone menu ---------- */
const tools = $('tools');
$('btnSound').dataset.label = 'Sound';
$('btnStats').dataset.label = 'Statistics';
$('btnSettings').dataset.label = 'Table';
$('btnHelp').dataset.label = 'How to play';
press($('btnMenu'), () => {
  const open = !tools.classList.contains('open');
  tools.classList.toggle('open', open);
  $('btnMenu').setAttribute('aria-expanded', String(open));
});
document.addEventListener('pointerdown', e => {
  if (tools.classList.contains('open') && !tools.contains(e.target)) {
    tools.classList.remove('open'); $('btnMenu').setAttribute('aria-expanded', 'false');
  }
}, true);

/* ---------- sheets ---------- */
const sheet = $('sheet'), scrim = $('scrim');
let sheetFocus = null;
const sheetSpring = new Spring(1, v => { sheet.style.translate = `0 ${v * 100}%`; }, { response: 0.36, eps: 0.002 });
const scrimSpring = new Spring(0, v => { scrim.style.opacity = v; }, { response: 0.3, eps: 0.01 });
function openSheet(title, html) {
  sheetFocus = document.activeElement;
  tools.classList.remove('open');
  $('sheetTitle').textContent = title;
  $('sheetBody').innerHTML = html;
  sheet.hidden = false; scrim.hidden = false;
  sheet.removeAttribute('inert');
  sheet.setAttribute('aria-hidden', 'false');
  sheetSpring.set(0); scrimSpring.set(1);
  $('sheetBody').focus({ preventScroll: true });
  wireSheet();
}
function closeSheet() {
  // inert at once, not when the animation lands: a panel on its way out is
  // still in the tree, and Tab would walk into it
  sheet.setAttribute('inert', '');
  sheet.setAttribute('aria-hidden', 'true');
  scrimSpring.set(0);
  sheetSpring.set(1, { onRest: () => { sheet.hidden = true; scrim.hidden = true; } });
  if (sheetFocus && sheetFocus.focus) sheetFocus.focus({ preventScroll: true });
}
press($('sheetClose'), closeSheet);
scrim.addEventListener('click', closeSheet);
sheet.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const f = [...sheet.querySelectorAll('button, [tabindex="0"], input')].filter(x => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
function wireSheet() {
  for (const b of sheet.querySelectorAll('[data-seats]')) {
    press(b, () => {
      const n = Number(b.dataset.seats);
      if (n === seatCount) return;
      seatCount = n; store.set('seats', n);
      const hero = table.seats.find(s => s.hero);
      heroStack = hero.chips;
      buildTable();
      closeSheet();
      toast(`Table set to ${n === 2 ? 'heads-up' : n + ' players'}`);
      $('uiNext').hidden = false;
      $('uiWait').hidden = true;
    });
  }
  const reset = sheet.querySelector('[data-reset]');
  if (reset) press(reset, () => {
    stats = blankStats();
    heroStack = BUYIN;
    store.set('stats', stats); store.set('stack', heroStack);
    buildTable();
    closeSheet();
    toast('Session reset');
    $('heroStack').textContent = money(BUYIN);
    $('hint').textContent = hintLine();
    $('uiNext').hidden = false; $('uiWait').hidden = true;
  });
}

press($('btnStats'), () => openSheet('This session', statsHTML()));
press($('btnSettings'), () => openSheet('Table', settingsHTML()));
press($('btnHelp'), () => openSheet('How to play', helpHTML()));

function statsHTML() {
  const bb = stats.hands ? (stats.net / BB / stats.hands * 100) : 0;
  const cell = (k, v, cls) => `<div><span class="k">${k}</span><span class="v ${cls || ''}">${v}</span></div>`;
  const sign = n => (n >= 0 ? '+' : '') + money(n);
  return `<div class="kv">
      ${cell('Hands', stats.hands)}
      ${cell('Won', stats.hands ? Math.round(100 * stats.won / stats.hands) + '%' : '-')}
      ${cell('Net', sign(stats.net), stats.net > 0 ? 'up' : stats.net < 0 ? 'down' : '')}
      ${cell('BB/100', stats.hands >= 20 ? (bb >= 0 ? '+' : '') + bb.toFixed(1) : 'too few hands', stats.hands >= 20 ? (bb > 0 ? 'up' : bb < 0 ? 'down' : '') : 'small')}
      ${cell('Showdowns', stats.sd)}
      ${cell('Showdowns won', stats.sd ? Math.round(100 * stats.sdWon / stats.sd) + '%' : '-')}
      ${cell('Biggest pot', money(stats.bestPot))}
      ${cell('Best hand', stats.best ? handNameShort(stats.best) : '-')}
      ${cell('Best run', stats.bestStreak ? stats.bestStreak + ' hands' : '-')}
      ${cell('Buy-ins', stats.buyIns)}
    </div>
    <h3>What to expect</h3>
    <p>Over a few hundred hands the number that means anything is BB/100 - big blinds won per hundred hands. A good player in a game like this makes somewhere between five and fifteen; a hundred hands is far too few to tell that apart from luck. Swings of forty buy-ins in either direction happen to everyone.</p>
    <p><button type="button" class="pill" data-reset>Reset the session</button></p>`;
}
function settingsHTML() {
  const opt = (n, label) => `<button type="button" class="pill" data-seats="${n}" aria-pressed="${n === seatCount}">${label}</button>`;
  return `<h3>Players</h3>
    <div class="choice">${opt(6, '6-max')}${opt(3, '3-handed')}${opt(2, 'Heads-up')}</div>
    <p>Changing the table deals everyone a fresh stack of ${money(BUYIN)}. Your own chips carry over.</p>
    <h3>Stakes</h3>
    <div class="kv">
      <div><span class="k">Blinds</span><span class="v">${SB} / ${BB}</span></div>
      <div><span class="k">Buy-in</span><span class="v">${money(BUYIN)}</span></div>
    </div>
    <h3>Who you are playing</h3>
    <div class="who-list">${table.seats.filter(s => !s.hero).map(s =>
      `<div><span class="nm">${s.name}</span><span class="ds">${STYLES[s.bot].label}</span></div>`).join('')}</div>
    <p>Each opponent plays its own way: how many hands it enters, how often it raises, and how often it is bluffing. They read the board the same way you do - by working out how often the hand in front of them actually wins.</p>`;
}
function helpHTML() {
  return `<h3>The hand</h3>
    <p>Everyone gets two cards of their own. Five more come face up in the middle - three, then one, then one - and there is a round of betting after each. Your hand is the best five cards you can make out of the seven; both, one or neither of your own cards may be in it.</p>
    <h3>Betting</h3>
    <ul>
      <li><b>Check</b> - stay in without putting anything in, only possible when nobody has bet.</li>
      <li><b>Call</b> - match the current bet.</li>
      <li><b>Bet</b> or <b>raise</b> - put more in. The minimum raise is the size of the last one.</li>
      <li><b>Fold</b> - give up the hand and everything already in the pot.</li>
    </ul>
    <p>Run out of chips in the middle of a hand and you are all-in: you play for the part of the pot you could cover, and the rest is settled between the others in a side pot.</p>
    <h3>Hands, strongest first</h3>
    <ul>
      <li>Straight flush - five in a row, all one suit</li>
      <li>Four of a kind</li>
      <li>Full house - three of one rank and two of another</li>
      <li>Flush - five of one suit</li>
      <li>Straight - five in a row</li>
      <li>Three of a kind</li>
      <li>Two pair</li>
      <li>Pair</li>
      <li>High card</li>
    </ul>
    <p>The ace plays high or low, so A-2-3-4-5 is a straight, and it is the lowest one.</p>
    <h3>The table</h3>
    <p>Blinds are ${SB} and ${BB}: the two seats left of the dealer button put them in before the cards come out, and the button moves one seat every hand. Position matters - acting last in a betting round is worth more than any pair.</p>
    <h3>Keys</h3>
    <p>F folds, C checks or calls, R bets or raises, Space deals the next hand.</p>`;
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(text, ms = 2000) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/* ---------- start ---------- */
applyTheme(themeMode, false);
buildTable();
$('heroStack').textContent = money(heroStack);
$('hint').textContent = hintLine();
$('uiWait').hidden = true;
$('uiNext').hidden = false;
$('btnNext').textContent = stats.hands ? 'Next hand' : 'Deal';
$('btnNext').innerHTML = (stats.hands ? 'Next hand' : 'Deal') + ' <kbd>Space</kbd>';

let resizeTimer = null;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layoutAll, 80); });
addEventListener('orientationchange', () => setTimeout(layoutAll, 120));
layoutAll();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
