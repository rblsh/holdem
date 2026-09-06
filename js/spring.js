// Spring engine (house-ui, section 8). A spring starts from the current value
// and the current velocity, so any animation can be retargeted mid-flight
// instead of being cancelled and restarted.
const RMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export function reducedMotion() { return !!(RMQ && RMQ.matches); }

const SPRINGS = [];
let RAF = null, lastT = 0;

export class Spring {
  constructor(v, on, o = {}) {
    this.x = v; this.v = 0; this.target = v; this.on = on;
    this.response = o.response || 0.4;
    this.damping = o.damping != null ? o.damping : 1;
    this.eps = o.eps || 0.05;
    this.active = false; this.onRest = [];
  }
  set(t, o = {}) {
    this.target = t;
    if (o.velocity != null) this.v = o.velocity;
    if (o.response) this.response = o.response;
    if (o.damping != null) this.damping = o.damping;
    if (o.onRest) this.onRest.push(o.onRest);   // callbacks accumulate: a retarget must not drop an earlier waiter
    if (reducedMotion() || o.immediate) { this.jump(t); return this; }
    if (!this.active) { this.active = true; SPRINGS.push(this); }
    if (!RAF) RAF = requestAnimationFrame(tickAll);
    return this;
  }
  jump(v) {
    this.x = this.target = v; this.v = 0; this.active = false;
    const i = SPRINGS.indexOf(this); if (i > -1) SPRINGS.splice(i, 1);
    this.on(this.x);
    this.rest();
  }
  rest() { const fs = this.onRest; this.onRest = []; for (const f of fs) f(); }
  to(t, o = {}) { return new Promise(res => this.set(t, Object.assign({}, o, { onRest: res }))); }
}

function tickAll(t) {
  RAF = null;
  const dt = lastT ? Math.min(0.064, (t - lastT) / 1000) : 0.016; lastT = t;
  for (let i = SPRINGS.length - 1; i >= 0; i--) {
    const s = SPRINGS[i];
    const k = Math.pow(2 * Math.PI / s.response, 2), c = 4 * Math.PI * s.damping / s.response, h = dt / 4;
    for (let j = 0; j < 4; j++) { s.v += (-k * (s.x - s.target) - c * s.v) * h; s.x += s.v * h; }
    if (Math.abs(s.v) < s.eps && Math.abs(s.x - s.target) < s.eps) {
      s.x = s.target; s.v = 0; s.active = false; SPRINGS.splice(i, 1); s.on(s.x); s.rest();
    } else s.on(s.x);
  }
  if (SPRINGS.length) RAF = requestAnimationFrame(tickAll); else lastT = 0;
}

export function running() { return SPRINGS.length > 0; }

export function wait(ms) { return new Promise(r => setTimeout(r, reducedMotion() ? 0 : ms)); }

// A two-dimensional flight for a card or a chip: one spring drives progress
// from 0 to 1 and the caller reads the point off it, so the element can be
// redirected mid-air without a second animation fighting the first.
export function flyTo(el, from, to, o = {}) {
  const arc = o.arc || 0;
  const s = new Spring(0, p => {
    const x = from.x + (to.x - from.x) * p;
    const y = from.y + (to.y - from.y) * p - arc * Math.sin(Math.PI * p);
    const r = o.rotate != null ? ` rotate(${o.rotate * p}deg)` : '';
    const sc = o.scale != null ? ` scale(${1 + (o.scale - 1) * p})` : '';
    el.style.transform = `translate(${x}px, ${y}px)${r}${sc}`;
  }, { response: o.response || 0.34, damping: o.damping != null ? o.damping : 1, eps: 0.002 });
  s.on(0);
  return s.to(1);
}
