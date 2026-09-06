// Not a pass/fail test: a bot table left to run on its own, so the numbers can
// be read against what a real six-max game looks like. VPIP in the thirties,
// preflop raise in the teens, a showdown in roughly a quarter of the hands.
import { Table } from '../js/engine.js';
import { decide } from '../js/bots.js';
import { mulberry32 } from '../js/cards.js';

const HANDS = Number(process.argv[2] || 5000);
const rnd = mulberry32(Number(process.argv[3] || 991));
const styles = (process.env.STYLES || 'shark,solid,station,maniac,rock,solid').split(',');
const t = new Table({
  seats: styles.map((s, i) => ({ name: s + i, bot: s, chips: 1000 })),
  smallBlind: 5, bigBlind: 10, rnd,
});

const st = styles.map(() => ({ vpip: 0, pfr: 0, hands: 0, won: 0, buy: 1000, showdown: 0, wonAtSd: 0 }));
let voluntary = new Set(), raisedPre = new Set(), showdowns = 0;

t.on('hand:start', () => { voluntary = new Set(); raisedPre = new Set(); });
t.on('action', e => {
  if (t.street !== 'preflop') return;
  if (e.type === 'call' || e.type === 'bet' || e.type === 'raise') voluntary.add(e.seat);
  if (e.type === 'raise' || e.type === 'bet') raisedPre.add(e.seat);
});
t.on('reveal', e => { showdowns++; for (const r of e.reveals) st[r.seat].showdown++; });

for (let h = 0; h < HANDS; h++) {
  for (const s of t.seats) if (s.chips < 1000) { st[s.i].buy += 1000 - s.chips; s.chips = 1000; }
  if (!t.startHand()) break;
  let guard = 0;
  while (!t.done) {
    if (++guard > 500) { console.log('runaway'); break; }
    const i = t.toAct;
    const v = t.viewFor(i);
    const a = t.seats[i].bot === 'folder' ? (v.legal.check ? { type: 'check' } : { type: 'fold' }) : decide(v, t.seats[i].bot, rnd);
    t.act(a);
  }
  for (const s of t.seats) { st[s.i].hands++; if (voluntary.has(s.i)) st[s.i].vpip++; if (raisedPre.has(s.i)) st[s.i].pfr++; }
}

const bb = 10;
console.log(`${HANDS} hands, ${showdowns} showdowns (${(100 * showdowns / HANDS).toFixed(0)}% of hands)\n`);
console.log('seat  style     VPIP   PFR   SD%    BB/100');
for (const s of t.seats) {
  const x = st[s.i];
  const net = s.chips - x.buy;
  console.log(
    `  ${s.i}   ${s.bot.padEnd(8)} ${(100 * x.vpip / x.hands).toFixed(0).padStart(4)}% ${(100 * x.pfr / x.hands).toFixed(0).padStart(4)}%` +
    ` ${(100 * x.showdown / x.hands).toFixed(0).padStart(4)}% ${(100 * net / bb / x.hands).toFixed(1).padStart(9)}`);
}
