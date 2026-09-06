// Correctness of the evaluator, checked against numbers nobody can fudge:
// the census of every five-card hand, and a brute-force second opinion on
// seven-card hands.
import { evalHand, best5, handName, categoryOf, CATEGORY } from '../js/eval.js';
import { parseCards, cardCode, mulberry32 } from '../js/cards.js';

let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.log('  FAIL ' + what); } };
const val = s => evalHand(parseCards(s));

console.log('named hands');
const named = [
  ['As Ks Qs Js Ts', 'Royal flush'],
  ['9h 8h 7h 6h 5h', 'Straight flush, nine high'],
  ['5c 4c 3c 2c Ac', 'Straight flush, five high'],
  ['7d 7h 7s 7c 2d', 'Four sevens'],
  ['Kd Kh Ks 3c 3d', 'Full house, kings over threes'],
  ['Ad Jd 8d 4d 2d', 'Flush, ace high'],
  ['Ah Kd Qc Js Th', 'Straight, ace high'],
  ['Ah 2d 3c 4s 5h', 'Straight, five high'],
  ['9h 9d 9s Kc 2d', 'Three nines'],
  ['Ah Ad 7c 7s 3d', 'Two pair, aces and sevens'],
  ['Qh Qd 9c 6s 3d', 'Pair of queens'],
  ['Ah Jd 9c 6s 3d', 'Ace high'],
];
for (const [cards, name] of named) ok(handName(val(cards)) === name, `${cards} -> ${handName(val(cards))}, want ${name}`);

console.log('ordering');
const ladder = [
  'Ah Jd 9c 6s 3d', 'Qh Qd 9c 6s 3d', 'Ah Ad 7c 7s 3d', '9h 9d 9s Kc 2d',
  'Ah Kd Qc Js Th', 'Ad Jd 8d 4d 2d', 'Kd Kh Ks 3c 3d', '7d 7h 7s 7c 2d', '9h 8h 7h 6h 5h',
];
for (let i = 1; i < ladder.length; i++) ok(val(ladder[i]) > val(ladder[i - 1]), `${ladder[i]} > ${ladder[i - 1]}`);

console.log('kickers and ties');
ok(val('Ah Ad Kc 7s 3d') > val('Ah Ad Qc 7s 3d'), 'pair, better kicker wins');
ok(val('Ah Ad Kc 7s 3d') === val('As Ac Kd 7h 3c'), 'same hand in other suits ties');
ok(val('Ah Kd Qc Js Th') === val('As Kc Qd Jh Tc'), 'straights of different suits tie');
ok(val('9h 9d 9s 9c Kd') > val('9h 9d 9s 9c Qd'), 'quads, better kicker wins');
ok(val('Kh Kd Kc 4s 4d') > val('Qh Qd Qc As Ad'), 'the trips half decides a full house');
// seven cards, where the extras must be ignored
ok(evalHand(parseCards('Ah Ad Ac Kh Kd 2s 3c')) === val('Ah Ad Ac Kh Kd'), 'seven cards: best five wins');
ok(categoryOf(evalHand(parseCards('2h 3h 4h 5h 6h 7h 8h'))) === 8, 'seven hearts make a straight flush');
ok(handName(evalHand(parseCards('2h 3h 4h 5h 6h 7h 8h'))) === 'Straight flush, eight high', 'and it is the highest one');
// three pairs on seven cards: the third pair only kicks
ok(evalHand(parseCards('Ah Ad Kh Kd 7c 7s 2d')) === val('Ah Ad Kh Kd 7c'), 'three pairs play as two pair, third pair kicks');
// a straight that is only visible using both hole cards and four of the board
ok(categoryOf(evalHand(parseCards('9c 8d 7h 6s 5c Ah Kd'))) === 4, 'straight found among seven');

console.log('census of all 2,598,960 five-card hands');
{
  const count = new Array(9).fill(0);
  const hand = new Int8Array(5);
  for (let a = 0; a < 48; a++) { hand[0] = a;
    for (let b = a + 1; b < 49; b++) { hand[1] = b;
      for (let c = b + 1; c < 50; c++) { hand[2] = c;
        for (let d = c + 1; d < 51; d++) { hand[3] = d;
          for (let e = d + 1; e < 52; e++) { hand[4] = e; count[evalHand(hand) >>> 20]++; }}}}}
  // published frequencies
  const want = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40];
  for (let i = 0; i < 9; i++) ok(count[i] === want[i], `${CATEGORY[i]}: ${count[i]}, want ${want[i]}`);
  ok(count.reduce((x, y) => x + y, 0) === 2598960, 'total is 2,598,960');
  console.log('  ' + count.map((n, i) => `${CATEGORY[i]} ${n.toLocaleString('en')}`).join(', '));
}

console.log('seven cards against a brute force over all 21 five-card subsets');
{
  const rnd = mulberry32(20260906);
  const deck = new Int8Array(52); for (let i = 0; i < 52; i++) deck[i] = i;
  let bad = 0;
  for (let t = 0; t < 60000; t++) {
    for (let i = 51; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const x = deck[i]; deck[i] = deck[j]; deck[j] = x; }
    const seven = Array.from(deck.slice(0, 7));
    const fast = evalHand(seven);
    let slow = -1;
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) for (let c = b + 1; c < 5; c++)
      for (let d = c + 1; d < 6; d++) for (let e = d + 1; e < 7; e++) {
        const x = evalHand([seven[a], seven[b], seven[c], seven[d], seven[e]]);
        if (x > slow) slow = x;
      }
    if (fast !== slow) { bad++; if (bad < 4) console.log('  ' + seven.map(cardCode).join(' ') + ` fast=${fast} slow=${slow}`); }
    // best5 must reproduce the winning value exactly
    if (evalHand(best5(seven)) !== fast) { bad++; if (bad < 4) console.log('  best5 mismatch on ' + seven.map(cardCode).join(' ')); }
  }
  ok(bad === 0, `${bad} mismatches in 60,000 random seven-card hands`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall green');
process.exit(fails ? 1 : 0);
