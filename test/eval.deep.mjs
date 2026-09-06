// The full census of all 133,784,560 seven-card hands against published
// frequencies. Takes about half a minute, so it is not part of the fast suite:
// run it after touching the evaluator.
import { evalHand } from '../js/eval.js';
import { CATEGORY } from '../js/eval.js';

const count = new Array(9).fill(0);
const h = new Int8Array(7);
const t0 = Date.now();
for (let a = 0; a < 46; a++) { h[0] = a;
  for (let b = a + 1; b < 47; b++) { h[1] = b;
    for (let c = b + 1; c < 48; c++) { h[2] = c;
      for (let d = c + 1; d < 49; d++) { h[3] = d;
        for (let e = d + 1; e < 50; e++) { h[4] = e;
          for (let f = e + 1; f < 51; f++) { h[5] = f;
            for (let g = f + 1; g < 52; g++) { h[6] = g; count[evalHand(h) >>> 20]++; }}}}}}}

const want = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584];
let fails = 0;
for (let i = 0; i < 9; i++) {
  const okay = count[i] === want[i];
  if (!okay) fails++;
  console.log(`${okay ? 'ok  ' : 'FAIL'} ${CATEGORY[i].padEnd(16)} ${count[i].toLocaleString('en').padStart(12)}  want ${want[i].toLocaleString('en')}`);
}
console.log(`total ${count.reduce((x, y) => x + y, 0).toLocaleString('en')} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(fails ? `${fails} FAILED` : 'all green');
process.exit(fails ? 1 : 0);
