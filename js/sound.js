// Synthesised sound: no audio files, so the whole game stays a few kilobytes
// and works offline. Everything is filtered noise plus a couple of decaying
// partials - a card is a short band of noise around a kilohertz over a thump of
// felt, a clay chip is an inharmonic ring between 500 and 1200 Hz. Sine tones an
// octave higher than that read as beeping, which is the mistake this file avoids.
let ctx = null, master = null, comp = null;
let enabled = true;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();      // overlapping chips would clip without it
    comp.threshold.value = -18; comp.ratio.value = 4; comp.release.value = 0.15;
    master = ctx.createGain(); master.gain.value = 0.5;
    comp.connect(master); master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') { try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  return ctx;
}
export function unlock() { if (enabled) ac(); }
export function setEnabled(v) { enabled = v; if (v) ac(); }
export function isEnabled() { return enabled; }

const rnd = (a, b) => a + Math.random() * (b - a);

function noiseBurst(t0, dur, freq, q, peak, type = 'bandpass') {
  const c = ac(); if (!c) return;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(comp);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

function partial(t0, freq, dur, peak, type = 'sine') {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(comp);
  o.start(t0); o.stop(t0 + dur + 0.03);
}

function oneChip(t0) {
  const k = rnd(0.94, 1.07);                    // no two chips sound the same
  noiseBurst(t0, 0.012, 1700 * k, 2.6, 0.62);   // the tick of the edge
  partial(t0, 520 * k, 0.10, 0.10);             // clay body
  partial(t0 + 0.002, 790 * k, 0.075, 0.055);
  partial(t0 + 0.004, 1180 * k, 0.05, 0.03);
}

export const sound = {
  deal() {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    noiseBurst(t, 0.07, rnd(820, 1050), 2.2, 1.5);
    noiseBurst(t + 0.028, 0.055, 190, 0.7, 0.5, 'lowpass');
  },
  flip() {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    noiseBurst(t, 0.045, rnd(900, 1150), 3.4, 1.3);
    partial(t, 320, 0.05, 0.045, 'triangle');
  },
  // sliding a hand into the muck: quieter than a deal and with no snap
  fold() {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    noiseBurst(t, 0.11, rnd(520, 660), 1.2, 0.5);
    noiseBurst(t + 0.05, 0.07, 160, 0.6, 0.3, 'lowpass');
  },
  // rapping the table twice with two knuckles
  check() {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    for (const at of [0, 0.085]) {
      noiseBurst(t + at, 0.03, 240, 1.1, 0.55, 'lowpass');
      partial(t + at, 132, 0.06, 0.05);
    }
  },
  chips(n = 3) {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    let at = 0;
    for (let i = 0; i < n; i++) { oneChip(t + at); at += rnd(0.018, 0.045); }
  },
  // a stack pushed forward: more chips, and they keep sliding
  allIn() {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    for (let i = 0; i < 9; i++) oneChip(t + i * rnd(0.012, 0.03));
    noiseBurst(t + 0.06, 0.22, 420, 1.0, 0.4);
  },
  shuffle() {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    for (let i = 0; i < 14; i++) noiseBurst(t + i * 0.03 + rnd(0, .006), 0.04, rnd(650, 1000), 3.2, 0.5);
    noiseBurst(t + 0.47, 0.09, 560, 2.4, 0.7);
    noiseBurst(t + 0.49, 0.07, 170, 0.7, 0.38, 'lowpass');
  },
  win() {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    partial(t, 392, 0.20, 0.095, 'triangle');
    partial(t + 0.085, 587.33, 0.30, 0.085, 'triangle');
    this.chips(3);
  },
  big() {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    [392, 523.25, 659.25, 783.99].forEach((f, i) => partial(t + i * 0.07, f, 0.34, 0.08, 'triangle'));
    setTimeout(() => this.chips(5), 120);
  },
  lose() {
    if (!enabled || !ac()) return; const t = ctx.currentTime;
    partial(t, 174.61, 0.22, 0.095); partial(t + 0.07, 130.81, 0.34, 0.08);
  },
  click() { if (!enabled || !ac()) return; noiseBurst(ctx.currentTime, 0.014, 900, 3.0, 0.45); }
};
