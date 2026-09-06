// The betting engine. Scripted hands for the rules that are easy to get wrong,
// then a long random run whose only job is to prove that chips are never
// created or destroyed.
import { Table } from '../js/engine.js';
import { parseCards, mulberry32 } from '../js/cards.js';

let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.log('  FAIL ' + what); } };
const eq = (a, b, what) => ok(a === b, `${what}: got ${a}, want ${b}`);

function table(stacks, opts = {}) {
  const t = new Table({
    seats: stacks.map((c, i) => ({ name: 'S' + i, chips: c })),
    smallBlind: opts.sb || 5, bigBlind: opts.bb || 10, button: 0,
    rnd: mulberry32(opts.seed || 7),
  });
  t.log = [];
  t.on('*', e => t.log.push(e));
  return t;
}
const events = (t, ev) => t.log.filter(e => e.ev === ev);

console.log('blinds and the order of action');
{
  const t = table([1000, 1000, 1000, 1000, 1000, 1000]);
  t.startHand();
  eq(t.seats[1].bet, 5, 'small blind');
  eq(t.seats[2].bet, 10, 'big blind');
  eq(t.toAct, 3, 'the seat left of the big blind acts first preflop');
  eq(t.legal().call, 10, 'facing the big blind');
  eq(t.legal().raise.min, 20, 'minimum raise is to two big blinds');
  eq(t.positionOf(t.seats[0]), 'BTN', 'seat 0 is the button');
  eq(t.positionOf(t.seats[3]), 'UTG', 'seat 3 is under the gun');
  eq(t.positionOf(t.seats[5]), 'CO', 'seat 5 is the cutoff');
  for (const i of [3, 4, 5, 0, 1]) { eq(t.toAct, i, 'action moves clockwise'); t.act({ type: 'call' }); }
  eq(t.toAct, 2, 'the big blind gets the option');
  ok(t.legal().check, 'and may check it');
  t.act({ type: 'check' });
  eq(t.street, 'flop', 'checking round closes the street');
  eq(t.pot, 60, 'six limpers make a pot of sixty');
  eq(t.toAct, 1, 'the small blind acts first after the flop');
  eq(t.board.length, 3, 'the flop is three cards');
}

console.log('heads-up positions');
{
  const t = table([1000, 1000]);
  t.startHand();
  eq(t.seats[0].bet, 5, 'the button posts the small blind heads-up');
  eq(t.toAct, 0, 'and acts first preflop');
  t.act({ type: 'call' }); t.act({ type: 'check' });
  eq(t.toAct, 1, 'the big blind acts first after the flop');
}

console.log('minimum raise, and a short all-in that does not re-open betting');
{
  const t = table([1000, 1000, 1000]);
  t.startHand();                       // button 0, sb 1, bb 2, first to act 0
  t.act({ type: 'raise', to: 30 });    // raise of 20 over the big blind
  eq(t.lastRaiseSize, 20, 'the raise size is twenty');
  eq(t.legal().raise.min, 50, 'the next raise must be to fifty');
  t.act({ type: 'raise', to: 50 });
  t.act({ type: 'call' });
  eq(t.toAct, 0, 'the first raiser must answer the re-raise');
  ok(t.legal().raise, 'and may raise again');
}
{
  const t = table([1000, 1000, 26]);   // seat 2 posts the big blind and is short
  t.startHand();
  t.act({ type: 'raise', to: 30 });    // seat 0 raises to 30, raise size 20
  t.act({ type: 'call' });             // seat 1 calls 30
  eq(t.toAct, 2, 'the short big blind is next');
  ok(!t.legal().raise, 'a stack that cannot cover the call has no raise');
  ok(t.legal().callAllIn, 'his call is an all-in');
  t.act({ type: 'call' });             // all-in for 16 more, short of the 30
  eq(t.street, 'flop', 'the round closes: nobody owes anything');
  eq(t.seats[2].chips, 0, 'the short stack is in for everything');
  eq(t.pot, 86, 'the pot holds every chip put in, including the four each that only the deep stacks can win');
}
{
  const t = table([1000, 1000, 1000, 44]);
  t.startHand();                       // btn 0, sb 1, bb 2, utg 3 with 44
  t.act({ type: 'raise', to: 44 });    // seat 3 is all-in for 44: a full raise (34 >= 10)
  ok(t.seats[3].allIn, 'seat 3 is all-in');
  eq(t.legal().raise.min, 78, 'a full all-in raise sets the next minimum');
}
{
  // the case the rule is actually about: a raise, a call, a re-raise, and then
  // an all-in that raises by less than the last full raise
  const t = table([1000, 1000, 1000, 130]);
  t.startHand();                       // btn 0, sb 1, bb 2, utg 3 with 130
  t.act({ type: 'raise', to: 50 });    // seat 3
  t.act({ type: 'call' });             // seat 0 calls 50
  t.act({ type: 'fold' });             // seat 1
  t.act({ type: 'raise', to: 100 });   // seat 2 re-raises, raise size 50
  eq(t.toAct, 3, 'the short stack is next');
  eq(t.legal().raise.min, 130, 'he cannot make a full raise, so his only raise is all-in');
  t.act({ type: 'raise', to: 130 });   // all-in: a raise of only 30
  eq(t.currentBet, 130, 'the current bet still moves up');
  eq(t.lastRaiseSize, 50, 'but the minimum raise does not');
  eq(t.toAct, 0, 'the caller still owes eighty and must act');
  eq(t.legal().call, 80, 'he may call the eighty he owes');
  ok(t.legal().raise, 'and he may raise: the re-raise to a hundred re-opened his action');
  t.act({ type: 'call' });
  eq(t.toAct, 2, 'the re-raiser also owes thirty');
  ok(!t.legal().raise, 'but he may not raise: he already acted, and thirty is not a full raise');
  eq(t.legal().call, 30, 'he can only call or fold');
}

console.log('the uncalled part of a bet comes back');
{
  const t = table([1000, 1000, 1000]);
  t.startHand();
  t.act({ type: 'raise', to: 200 });   // seat 0
  t.act({ type: 'fold' });             // seat 1 (small blind, 5 in)
  t.act({ type: 'fold' });             // seat 2 (big blind, 10 in)
  const back = events(t, 'return')[0];
  eq(back.amount, 190, 'a hundred and ninety comes back');
  eq(t.seats[0].chips, 1015, 'the raiser is up the blinds only');
  eq(t.seats[1].chips, 995, 'the small blind is down five');
  eq(t.seats[2].chips, 990, 'the big blind is down ten');
}

console.log('side pots');
{
  // stacks 100 / 500 / 500: the short stack can only win a hundred from each
  const t = table([100, 500, 500], { sb: 5, bb: 10 });
  t.startHand();                        // btn 0 (100), sb 1, bb 2
  t.act({ type: 'raise', to: 100 });    // seat 0 all-in
  t.act({ type: 'raise', to: 300 });    // seat 1
  t.act({ type: 'call' });              // seat 2 calls 300
  while (!t.done) t.act({ type: 'check' });   // the two deep stacks check it down
  const pots = t.pots;
  eq(pots.length, 2, 'two pots');
  eq(pots[0].amount, 300, 'main pot is three hundred');
  eq(pots[0].eligible.length, 3, 'everyone plays for the main pot');
  eq(pots[1].amount, 400, 'side pot is four hundred');
  eq(pots[1].eligible.length, 2, 'only the two deep stacks play for it');
  eq(t.seats.reduce((a, s) => a + s.chips, 0), 1100, 'chips are conserved');
}
{
  // three all-ins of different sizes make three pots
  const t = table([60, 160, 400, 400], { sb: 5, bb: 10 });
  t.startHand();                        // btn 0, sb 1, bb 2, utg 3
  t.act({ type: 'raise', to: 400 });    // seat 3 all-in
  t.act({ type: 'call' });              // seat 0 all-in for 60
  t.act({ type: 'call' });              // seat 1 all-in for 160
  t.act({ type: 'call' });              // seat 2 calls 400
  eq(t.pots.length, 3, 'three pots');
  eq(t.pots[0].amount, 240, 'main pot: sixty from each of four');
  eq(t.pots[1].amount, 300, 'first side pot: a hundred from each of three');
  eq(t.pots[2].amount, 480, 'second side pot: two hundred and forty from each of two');
  eq(t.seats.reduce((a, s) => a + s.chips, 0), 1020, 'chips are conserved');
}

console.log('a split pot, and the odd chip');
{
  // both players hold the same hand: the board plays
  const t = table([1000, 1000], { sb: 5, bb: 10 });
  t.startHand({ stack: parseCards('2c 3c 2d 3d Ah Kh Qh Jh Th') });
  // seat 0 gets 2c 2d, seat 1 gets 3c 3d, board is a royal flush
  t.act({ type: 'call' }); t.act({ type: 'check' });
  t.act({ type: 'check' }); t.act({ type: 'check' });
  t.act({ type: 'check' }); t.act({ type: 'check' });
  t.act({ type: 'check' }); t.act({ type: 'check' });
  eq(t.seats[0].chips, 1000, 'the board plays: seat 0 gets its money back');
  eq(t.seats[1].chips, 1000, 'and so does seat 1');
}
{
  const t = table([1000, 1000, 1000], { sb: 5, bb: 15 });
  t.startHand({ stack: parseCards('2c 3c 4d 2d 3d 4h Ah Kh Qh Jh Th') });
  // three identical hands on a royal board, pot of 45 split three ways
  t.act({ type: 'call' }); t.act({ type: 'call' }); t.act({ type: 'check' });
  for (let s = 0; s < 3; s++) { t.act({ type: 'check' }); t.act({ type: 'check' }); t.act({ type: 'check' }); }
  eq(t.seats.reduce((a, s) => a + s.chips, 0), 3000, 'chips are conserved in a three-way split');
}
{
  // an odd chip: a pot of 31 split two ways
  const t = table([1000, 1000], { sb: 5, bb: 10 });
  t.startHand({ stack: parseCards('2c 3c 2d 3d Ah Kh Qh Jh Th') });
  t.act({ type: 'raise', to: 15 }); t.act({ type: 'call' });
  for (let s = 0; s < 3; s++) { t.act({ type: 'check' }); t.act({ type: 'check' }); }
  eq(t.seats.reduce((a, s) => a + s.chips, 0), 2000, 'chips are conserved with an odd pot');
}

console.log('everybody folds');
{
  const t = table([1000, 1000, 1000, 1000, 1000, 1000]);
  t.startHand();
  for (let i = 0; i < 5; i++) t.act({ type: 'fold' });
  ok(t.done, 'the hand is over');
  eq(t.seats[2].chips, 1005, 'the big blind wins the small blind');
  eq(events(t, 'reveal').length, 0, 'nobody shows a hand');
}

console.log('twenty thousand random hands: no chip is created or destroyed');
{
  const rnd = mulberry32(424242);
  const stacks = [1000, 1000, 1000, 1000, 1000, 1000];
  const t = new Table({
    seats: stacks.map((c, i) => ({ name: 'S' + i, chips: c })),
    smallBlind: 5, bigBlind: 10, button: 0, rnd,
  });
  const totalStart = stacks.reduce((a, b) => a + b, 0);
  let hands = 0, showdowns = 0, allins = 0, bad = 0, negative = 0;
  t.on('reveal', () => showdowns++);
  for (let h = 0; h < 20000; h++) {
    // top the short stacks back up, the way a cash game does, and count it
    let added = 0;
    for (const s of t.seats) if (s.chips < 10) { added += 1000 - s.chips; s.chips = 1000; }
    t.topUp = (t.topUp || 0) + added;
    if (!t.startHand()) break;
    hands++;
    let guard = 0;
    while (!t.done) {
      if (++guard > 400) { console.log('  runaway hand'); bad++; break; }
      const L = t.legal();
      const r = rnd();
      if (r < 0.18) t.act({ type: 'fold' });
      else if (r < 0.62) t.act({ type: L.check ? 'check' : 'call' });
      else if (L.raise) {
        const span = L.raise.max - L.raise.min;
        const to = Math.round(L.raise.min + span * Math.pow(rnd(), 3));
        if (to >= L.raise.max) allins++;
        t.act({ type: 'raise', to });
      } else t.act({ type: L.check ? 'check' : 'call' });
    }
    for (const s of t.seats) if (s.chips < 0) negative++;
    const sum = t.seats.reduce((a, s) => a + s.chips, 0);
    if (sum !== totalStart + t.topUp) { bad++; if (bad < 3) console.log(`  hand ${h}: chips ${sum}, want ${totalStart + t.topUp}`); }
  }
  eq(bad, 0, 'no hand lost or invented chips');
  eq(negative, 0, 'no stack ever went negative');
  console.log(`  ${hands} hands, ${showdowns} showdowns, ${allins} all-in raises, top-ups ${t.topUp.toLocaleString('en')}`);
  ok(showdowns > hands * 0.1, 'showdowns actually happen');
}

console.log(fails ? `\n${fails} FAILED` : '\nall green');
process.exit(fails ? 1 : 0);
