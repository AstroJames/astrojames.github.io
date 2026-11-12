// The seed's journey: outreach page logic. No build step; ES modules only.
import { log10Fnarrow, tRecovery } from './physics.js';
import { withCites } from './refs.js';
import { createCascade, CSTAGES } from './cascade.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Seed colours: CMasher chroma at 0.62 (A, larger seed) and 0.30 (B, smaller seed), as in the two-seed hero animation
const COL = { a: '#b68301', b: '#71026e', ink: '#1a1d23', muted: '#555c68', rule: '#c9c5bc', accent: '#b5430f' };

// ---------------------------------------------------------------- 1. scale ladder
// Intracluster-medium scales from published estimates (log10 cm; sources cited on each rung). Comparisons are rounded everyday facts.
const RUNGS = [
  { id: 'de', name: 'Electron skin depth', lg: 7.2, size: '≈ 160 km',
    what: 'The natural size of the Weibel instability, the plasma process that can make magnetic fields from nothing. The first seed fields are born around here[[Zhou2021spontaneous,Sironi2023generation,Zhou2023magnetogenesis]].',
    cmp: 'About the length of a large city region.' },
  { id: 'eta', name: 'Resistive scale', lg: 8.9, size: '≈ 8,000 km',
    what: 'Below this size, the plasma\'s electrical resistance erases magnetic fields faster than turbulence can stretch them, if resistance is the classic, collisional kind[[StOnge2020fluctuation]]. In such thin, hot gas it may not be[[Zhou2023magnetogenesis,Schekochihin2020turbulence]].',
    cmp: 'A little smaller than the Earth (12,700 km across).' },
  { id: 'kw', name: 'Weibel filaments, grown', lg: 11.6, size: '≈ 4 million km',
    what: 'Weibel filaments grow to roughly this size by the time the instability stops growing[[Zhou2021spontaneous,Zhou2023magnetogenesis]].',
    cmp: 'About ten times the distance from the Earth to the Moon.' },
  { id: 'seed', name: 'Seed after merging', lg: 15.9, size: '≈ 500 times the Earth–Sun distance',
    what: 'Where continued merging leaves the seed after one turn of the largest eddies, according to one published estimate[[Zhou2023magnetogenesis]].',
    cmp: 'Far beyond the orbit of Pluto, yet still a speck next to a galaxy.' },
  { id: 'obs', name: 'Observed cluster fields', lg: 22.0, lo: 21.5, hi: 22.5, size: '≈ 3,000 to 30,000 light-years',
    what: 'The size over which magnetic fields in galaxy clusters are seen to be coherent, from radio observations[[StOnge2020fluctuation,Schekochihin2005fast]].',
    cmp: 'Up to about a third of the width of the Milky Way.' },
  { id: 'L', name: 'Largest eddies', lg: 23.5, size: '≈ 300,000 light-years',
    what: 'The size of the biggest turbulent swirls stirred up in the hot gas of a galaxy cluster[[StOnge2020fluctuation,Schekochihin2005fast]].',
    cmp: 'Several times the size of the Milky Way.' },
];
const LG0 = 6.5, LG1 = 24;
const pct = (lg) => `${(100 * (lg - LG0) / (LG1 - LG0)).toFixed(2)}%`;

function buildLadder() {
  const ruler = document.getElementById('ruler'), rungs = document.getElementById('rungs'), card = document.getElementById('rung-card');
  for (let d = 7; d <= 24; d++) {
    const t = document.createElement('div'); t.className = 'tick'; t.style.left = pct(d); ruler.appendChild(t);
    if (d % 2 === 1) {
      const l = document.createElement('div'); l.className = 'tlab' + ((d - 7) % 4 ? ' minor' : ''); l.style.left = pct(d);
      l.innerHTML = `10<sup>${d}</sup> cm`; ruler.appendChild(l);
    }
  }
  const obs = RUNGS.find((r) => r.id === 'obs');
  const span = document.createElement('div'); span.className = 'span';
  span.style.left = pct(obs.lo); span.style.width = `${(100 * (obs.hi - obs.lo) / (LG1 - LG0)).toFixed(2)}%`; ruler.appendChild(span);

  const buttons = RUNGS.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'rung' + (i % 2 ? ' low' : ''); b.style.left = pct(r.lg);
    b.textContent = r.name; b.setAttribute('aria-pressed', 'false'); b.tabIndex = -1;
    b.setAttribute('aria-label', `${r.name}, ${r.size}`);
    b.addEventListener('click', () => select(i, true));
    rungs.appendChild(b);
    return b;
  });
  let cur = 0;
  function select(i, focus) {
    cur = (i + RUNGS.length) % RUNGS.length;
    buttons.forEach((b, j) => { b.setAttribute('aria-pressed', String(j === cur)); b.tabIndex = j === cur ? 0 : -1; });
    if (focus) buttons[cur].focus();
    const r = RUNGS[cur];
    const fromSeed = r.lg - RUNGS[0].lg;
    const ratio = cur === 0 ? 'Start of the journey.' :
      `About 10<sup>${fromSeed.toFixed(0)}</sup> times larger than the electron skin depth, where the seed is born.`;
    card.innerHTML = `<h3>${r.name}</h3><p class="size">${r.size} (10<sup>${r.lo ? `${r.lo}–${r.hi}` : r.lg}</sup> cm)</p>
      <p>${withCites(r.what)}</p><p>${r.cmp} ${ratio}</p>`;
  }
  rungs.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { select(cur + 1, true); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { select(cur - 1, true); e.preventDefault(); }
    if (e.key === 'Home') { select(0, true); e.preventDefault(); }
    if (e.key === 'End') { select(RUNGS.length - 1, true); e.preventDefault(); }
  });
  select(0, false);
}

// ---------------------------------------------------------------- canvas helpers
function fitCanvas(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
function supText(ctx, base, exp, x, y, align = 'center') {
  // draws base^exp, e.g. "10" with superscript
  const f = ctx.font, bw = ctx.measureText(base).width;
  ctx.font = f.replace(/(\d+)px/, (m, p) => `${Math.round(p * 0.72)}px`);
  const ew = ctx.measureText(exp).width; ctx.font = f;
  let x0 = align === 'center' ? x - (bw + ew) / 2 : align === 'right' ? x - bw - ew : x;
  ctx.textAlign = 'left'; ctx.fillText(base, x0, y);
  ctx.font = f.replace(/(\d+)px/, (m, p) => `${Math.round(p * 0.72)}px`); ctx.fillText(exp, x0 + bw, y - 6); ctx.font = f;
}
function axes(ctx, box, xr, yr, xt, yt) {
  // box = {x, y, w, h}; xr/yr = [min,max] in log10; ticks at integer decades given
  const X = (v) => box.x + (v - xr[0]) / (xr[1] - xr[0]) * box.w, Y = (v) => box.y + box.h - (v - yr[0]) / (yr[1] - yr[0]) * box.h;
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = COL.ink; ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  for (const v of xt) { ctx.beginPath(); ctx.moveTo(X(v), box.y + box.h); ctx.lineTo(X(v), box.y + box.h - 5); ctx.stroke();
    supText(ctx, '10', String(v).replace('-', '−'), X(v), box.y + box.h + 16); }
  for (const v of yt) { ctx.beginPath(); ctx.moveTo(box.x, Y(v)); ctx.lineTo(box.x + 5, Y(v)); ctx.stroke();
    supText(ctx, '10', String(v).replace('-', '−'), box.x - 6, Y(v) + 4, 'right'); }
  return { X, Y };
}

// ---------------------------------------------------------------- 4. player
const STAGES = [
  { t: 0, h: 'Two seeds', p: 'Two seeds start with the same energy. The gold one is born ten times larger than the resistive scale, the purple one ten times smaller. Well below the resistive scale, the plasma\'s resistance erases magnetic structures faster than turbulence can stretch them.' },
  { t: 0.3, h: 'Head start and erasure', p: 'The larger seed is stretched at once: its energy grows from the very first moment. The smaller seed is being erased. Its total energy will fall to about four millionths of its start, while a faint front of survivors creeps toward larger sizes.' },
  { key: 'Wmin_B', h: 'Capture', p: 'After about four stretching times the survivors of the smaller seed reach sizes where stretching beats resistance. From now on the turbulent dynamo amplifies them too.' },
  { key: 'ground_half_B', h: 'One pattern takes over', p: 'For both seeds a single growing pattern now holds more than half of the energy. It peaks near the resistive scale, whatever size the seed was born at.' },
  { key: 'ground_90_B', h: 'Steady growth', p: 'Both curves now have the same shape and grow at the same rate: the energy doubles about once every stretching time. Both seeds were captured. The only lasting difference is the price the smaller seed paid at the start: it ends with about six billion times less magnetic energy.' },
];

async function buildPlayer(D) {
  const spec = document.getElementById('spec'), energy = document.getElementById('energy');
  const slider = document.getElementById('tslider'), out = document.getElementById('treadout'), play = document.getElementById('play');
  const showA = document.getElementById('showA'), showB = document.getElementById('showB'), stageEl = document.getElementById('stage');
  const N = D.gt.length; slider.max = String(N - 1);
  for (const s of STAGES) if (s.key) s.t = D.stages[s.key];
  const lk = D.log10k, gt = D.gt;
  let f = 0;            // fractional frame index
  let playing = false, last = 0, stageIdx = -1;
  const FPS = 14;       // stored frames per second of playback (constant)
  const listeners = [];

  function rowAt(seed, fi) {
    const i = Math.floor(fi), j = Math.min(i + 1, N - 1), s = fi - i, R = D[seed].log10M;
    return R[i].map((v, n) => { const u = R[j][n]; return v === null || u === null ? (s < 0.5 ? v : u) : v + s * (u - v); });
  }
  const tAt = (fi) => { const i = Math.floor(fi), j = Math.min(i + 1, N - 1); return gt[i] + (fi - i) * (gt[j] - gt[i]); };
  const WAt = (seed, fi) => { const i = Math.floor(fi), j = Math.min(i + 1, N - 1), W = D[seed].log10W; return W[i] + (fi - i) * (W[j] - W[i]); };

  function drawSpec() {
    const { ctx, w, h } = fitCanvas(spec); ctx.clearRect(0, 0, w, h);
    const box = { x: 46, y: 26, w: w - 58, h: h - 76 };
    const xr = [lk[0], lk[lk.length - 1]], yr = [-12, 28];
    const { X, Y } = axes(ctx, box, xr, yr, [-2, -1, 0, 1, 2], [-10, 0, 10, 20]);
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    // reference lines: k_eta and k0
    ctx.strokeStyle = COL.muted; ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(X(0), box.y); ctx.lineTo(X(0), box.y + box.h); ctx.stroke();
    ctx.setLineDash([2, 3]);
    for (const [v, c] of [[-1, COL.a], [1, COL.b]]) { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(X(v), box.y); ctx.lineTo(X(v), box.y + box.h); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = COL.muted; ctx.textAlign = 'left'; ctx.fillText('resistive', X(0) + 4, box.y + 16); ctx.fillText('scale', X(0) + 4, box.y + 30);
    ctx.fillStyle = COL.a; ctx.textAlign = 'right'; ctx.fillText('larger seed', X(-1) - 4, box.y + 16); ctx.fillText('starts', X(-1) - 4, box.y + 30);
    ctx.fillStyle = COL.b; ctx.textAlign = 'left'; ctx.fillText('smaller seed', X(1) + 4, box.y + 16); ctx.fillText('starts', X(1) + 4, box.y + 30);
    const line = (seed, color, dash, lw) => {
      const R = rowAt(seed, f); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash); ctx.beginPath();
      let pen = false;
      R.forEach((v, n) => { if (v === null) { pen = false; return; } const x = X(lk[n]), y = Y(v); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; });
      ctx.stroke(); ctx.setLineDash([]);
    };
    if (showB.checked) line('B', COL.b, [7, 4], 2);
    if (showA.checked) line('A', COL.a, [], 2.4);
    ctx.restore();
    ctx.fillStyle = COL.ink; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(w < 520 ? 'size (wavenumber k/kη)' : 'size of the magnetic structures (wavenumber k/kη)', box.x + box.w / 2, box.y + box.h + 36);
    ctx.fillStyle = COL.muted; ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('← larger', box.x + 4, box.y + box.h - 6);
    ctx.textAlign = 'right'; ctx.fillText('smaller →', box.x + box.w - 4, box.y + box.h - 6);
    ctx.textAlign = 'left'; ctx.fillStyle = COL.ink; ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('magnetic energy at each size', box.x, box.y - 9);
  }
  function drawEnergy() {
    const { ctx, w, h } = fitCanvas(energy); ctx.clearRect(0, 0, w, h);
    const box = { x: 44, y: 26, w: w - 54, h: h - 76 };
    const tr = [0, 60], yr = [-7, 23];
    const X = (t) => box.x + (t - tr[0]) / (tr[1] - tr[0]) * box.w, Y = (v) => box.y + box.h - (v - yr[0]) / (yr[1] - yr[0]) * box.h;
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = COL.ink; ctx.font = '12px system-ui, sans-serif';
    for (const t of [0, 20, 40, 60]) { ctx.beginPath(); ctx.moveTo(X(t), box.y + box.h); ctx.lineTo(X(t), box.y + box.h - 5); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(String(t), X(t), box.y + box.h + 16); }
    for (const v of [-5, 0, 5, 10, 15, 20]) { ctx.beginPath(); ctx.moveTo(box.x, Y(v)); ctx.lineTo(box.x + 5, Y(v)); ctx.stroke();
      supText(ctx, '10', String(v).replace('-', '−'), box.x - 6, Y(v) + 4, 'right'); }
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    ctx.strokeStyle = COL.rule; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(box.x, Y(0)); ctx.lineTo(box.x + box.w, Y(0)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.muted; ctx.textAlign = 'right'; ctx.fillText('starting energy', box.x + box.w - 4, Y(0) - 5);
    const iMax = Math.floor(f);
    const trace = (seed, color, dash) => {
      const W = D[seed].log10W; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath();
      for (let i = 0; i <= iMax; i++) i ? ctx.lineTo(X(gt[i]), Y(W[i])) : ctx.moveTo(X(gt[i]), Y(W[i]));
      ctx.lineTo(X(tAt(f)), Y(WAt(seed, f))); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(tAt(f)), Y(WAt(seed, f)), 4, 0, 2 * Math.PI); ctx.fill();
    };
    if (showB.checked) trace('B', COL.b, [7, 4]);
    if (showA.checked) trace('A', COL.a, []);
    ctx.restore();
    ctx.fillStyle = COL.ink; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('time (stretching times)', box.x + box.w / 2, box.y + box.h + 36);
    ctx.textAlign = 'left'; ctx.fillText('total magnetic energy', box.x, box.y - 9);
  }
  function updateText() {
    const t = tAt(f);
    out.textContent = `${t < 1 ? t.toFixed(3) : t.toFixed(1)} stretching times`;
    slider.value = String(Math.round(f));
    slider.setAttribute('aria-valuetext', out.textContent);
    let s = 0; for (let i = 0; i < STAGES.length; i++) if (t >= STAGES[i].t - 1e-9) s = i;
    if (s !== stageIdx) { stageIdx = s; stageEl.innerHTML = `<h3>${STAGES[s].h}</h3><p>${STAGES[s].p}</p>`; }
  }
  function render() { drawSpec(); drawEnergy(); updateText(); listeners.forEach((fn) => fn(f)); }
  function setPlaying(p) {
    playing = p; play.textContent = p ? 'Pause' : 'Play'; play.setAttribute('aria-pressed', String(p));
    if (p) { if (f >= N - 1) f = 0; last = performance.now(); requestAnimationFrame(tick); }
  }
  function tick(now) {
    if (!playing) return;
    f = Math.min(N - 1, f + (now - last) / 1000 * FPS); last = now; render();
    if (f >= N - 1) { setPlaying(false); return; }
    requestAnimationFrame(tick);
  }
  play.addEventListener('click', () => setPlaying(!playing));
  slider.addEventListener('input', () => { setPlaying(false); f = Number(slider.value); render(); });
  showA.addEventListener('change', render); showB.addEventListener('change', render);
  const section = document.getElementById('player');
  section.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;   // native slider keys
    if (e.key === ' ' && e.target.tagName !== 'BUTTON') { setPlaying(!playing); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setPlaying(false); f = Math.min(N - 1, Math.floor(f) + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { setPlaying(false); f = Math.max(0, Math.ceil(f) - 1); render(); e.preventDefault(); }
    else if (e.key === 'Home') { setPlaying(false); f = 0; render(); e.preventDefault(); }
    else if (e.key === 'End') { setPlaying(false); f = N - 1; render(); e.preventDefault(); }
  });
  section.tabIndex = -1;
  window.addEventListener('resize', render);
  render();
  // Autoplay once when the player scrolls into view, unless the viewer prefers reduced motion.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    let done = false;
    new IntersectionObserver((ents, obs) => {
      if (!done && ents.some((e) => e.isIntersecting)) { done = true; obs.disconnect(); setPlaying(true); }
    }, { threshold: 0.6 }).observe(spec);
  }
  return { onFrame: (fn) => listeners.push(fn), frame: () => f };
}

// ---------------------------------------------------------------- 5. move the seed
// One narrow seed at x0 = k0/k_eta from 0.1 (ten times larger than the resistive scale) to 100 (a hundred times smaller).
// x0 <= X_NOLOSS: the energy never drops below its start (reviewed Fokker-Planck solver).
// x0 >= X_FORMULA: late-time formulas for the surviving fraction and the recovery time.
const X_NOLOSS = 1.73, X_FORMULA = 3;     // x_noloss = 1.726 from the reviewed solver
function buildSurvival() {
  const sl = document.getElementById('x0'), xo = document.getElementById('x0out'), cv = document.getElementById('fplot');
  const ra = document.getElementById('ra'), rr = document.getElementById('rratio');
  const LX0 = -1, LX1 = 2;                                   // x0 from 0.1 to 100
  const xOf = (v) => 10 ** (LX0 + (LX1 - LX0) * v / 1000);
  const curve = [];
  for (let i = 0; i <= 200; i++) { const x = 10 ** (Math.log10(X_FORMULA) + (LX1 - Math.log10(X_FORMULA)) * i / 200); curve.push([x, log10Fnarrow(x)]); }
  const oneIn = (lg) => {
    const n = -lg;
    if (n < 6) return `1 part in ${Math.round(10 ** n).toLocaleString('en-US')}`;
    const e = Math.floor(n), m = Math.round(10 ** (n - e));
    return m >= 10 ? `1 part in 10<sup>${e + 1}</sup>` : `1 part in ${m} × 10<sup>${e}</sup>`;
  };
  const sizeText = (x0) => {
    if (Math.abs(Math.log10(x0)) < 0.02) return 'about the same size as the resistive scale';
    const f = x0 < 1 ? 1 / x0 : x0, fs = f < 10 ? f.toFixed(1) : f.toFixed(0);
    return `${fs} times ${x0 < 1 ? 'larger' : 'smaller'} than the resistive scale`;
  };
  function draw(x0, fa) {
    const { ctx, w, h } = fitCanvas(cv); ctx.clearRect(0, 0, w, h);
    const box = { x: 50, y: 30, w: w - 66, h: h - 80 };
    const xr = [LX0, LX1], yr = [-55, 0];
    const X = (x) => box.x + (Math.log10(x) - xr[0]) / (xr[1] - xr[0]) * box.w, Y = (v) => box.y + box.h - (v - yr[0]) / (yr[1] - yr[0]) * box.h;
    // regions: no loss (x0 <= X_NOLOSS), brief dip (X_NOLOSS..X_FORMULA)
    ctx.fillStyle = 'rgba(182, 131, 1, 0.12)'; ctx.fillRect(box.x, box.y, X(X_NOLOSS) - box.x, box.h);
    ctx.fillStyle = 'rgba(85, 92, 104, 0.07)'; ctx.fillRect(X(X_NOLOSS), box.y, X(X_FORMULA) - X(X_NOLOSS), box.h);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = COL.ink; ctx.font = '12px system-ui, sans-serif';
    for (const [t, lab] of [[0.1, '10× larger'], [1, 'equal'], [10, '10× smaller'], [100, '100× smaller']]) {
      ctx.beginPath(); ctx.moveTo(X(t), box.y + box.h); ctx.lineTo(X(t), box.y + box.h - 5); ctx.stroke();
      ctx.textAlign = t === 0.1 ? 'left' : t === 100 ? 'right' : 'center'; ctx.fillText(lab, X(t), box.y + box.h + 16); }
    for (const v of [-50, -40, -30, -20, -10, 0]) { ctx.beginPath(); ctx.moveTo(box.x, Y(v)); ctx.lineTo(box.x + 5, Y(v)); ctx.stroke();
      supText(ctx, '10', String(v).replace('-', '−'), box.x - 6, Y(v) + 4, 'right'); }
    ctx.fillStyle = '#7a5800'; ctx.textAlign = 'left'; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('nothing lost', box.x + 6, Y(-46)); ctx.fillText('(grows from', box.x + 6, Y(-46) + 15); ctx.fillText('the start)', box.x + 6, Y(-46) + 30);
    ctx.strokeStyle = COL.b; ctx.lineWidth = 2.2; ctx.beginPath();
    curve.forEach((c, i) => i ? ctx.lineTo(X(c[0]), Y(c[1])) : ctx.moveTo(X(c[0]), Y(c[1]))); ctx.stroke();
    ctx.strokeStyle = COL.accent; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X(x0), box.y); ctx.lineTo(X(x0), box.y + box.h); ctx.stroke(); ctx.setLineDash([]);
    if (x0 >= X_FORMULA) { ctx.fillStyle = COL.b; ctx.beginPath(); ctx.arc(X(x0), Y(fa), 5, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = COL.ink; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(w < 520 ? 'seed size vs resistive scale' : 'size of the seed compared with the resistive scale', box.x + box.w / 2, box.y + box.h + 36);
    ctx.textAlign = 'left'; ctx.fillText('fraction of the seed that survives', box.x, box.y - 10);
  }
  function update() {
    const x0 = xOf(Number(sl.value)), fa = log10Fnarrow(x0);
    const txt = sizeText(x0);
    xo.textContent = txt; sl.setAttribute('aria-valuetext', txt);
    if (x0 <= X_NOLOSS) {
      ra.innerHTML = 'Nothing is lost. Stretching beats resistance from the start, so the dynamo amplifies the seed right away.';
    } else if (x0 < X_FORMULA) {
      ra.innerHTML = 'Its energy dips for a few stretching times while resistance trims the smallest structures, then it grows.';
    } else {
      ra.innerHTML = `Survives: about ${oneIn(fa)}<br>Back to its starting energy after about ${tRecovery(fa).toFixed(0)} stretching times`;
    }
    rr.innerHTML = 'Either way the seed is captured: what survives grows in the same pattern, at the same rate. Only the price differs.';
    draw(x0, fa);
  }
  sl.addEventListener('input', update); window.addEventListener('resize', update);
  sl.value = String(Math.round(1000 * (1 - LX0) / (LX1 - LX0)));     // x0 = 10, the smaller seed of the animation
  update();
}

// ---------------------------------------------------------------- 2. cascade
function buildCascade() {
  const box = document.getElementById('cstages');
  const buttons = CSTAGES.map((st) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'stage-btn'; b.textContent = st.name;
    b.setAttribute('aria-pressed', 'false'); box.appendChild(b); return b;
  });
  return createCascade({ eddies: document.getElementById('eddies'), spec: document.getElementById('cspec'), buttons,
    caption: document.getElementById('ccaption'), pauseBtn: document.getElementById('cpause'), reduceMotion });
}

// ---------------------------------------------------------------- 3. stretch, twist, fold (three.js, loaded near the viewport)
function buildStretchLauncher() {
  const sec = document.getElementById('stretch'), msg = document.getElementById('s3d-msg'), read = document.getElementById('s3read');
  const play = document.getElementById('s3play'), restartB = document.getElementById('s3restart'), endB = document.getElementById('s3end');
  const resetB = document.getElementById('s3reset'), bands = document.getElementById('s3bands');
  const fmt = (v) => (v < 100 ? v.toFixed(1) : v < 1e4 ? Math.round(v).toLocaleString('en-US') : `${(v / 10 ** Math.floor(Math.log10(v))).toFixed(1)} × 10<sup>${Math.floor(Math.log10(v))}</sup>`);
  let view = null, started = false, autoplayed = false, lastAnnounce = -1;
  function onUpdate(u) {
    play.textContent = u.playing ? 'Pause' : (u.finished ? 'Play again' : 'Play'); play.setAttribute('aria-pressed', String(u.playing));
    // the live region is refreshed at most once per stretching time while playing, to keep screen readers calm
    const tick = Math.floor(u.t);
    if (u.playing && tick === lastAnnounce) return;
    lastAnnounce = u.playing ? tick : -1;
    read.innerHTML = `<h3>After ${u.t.toFixed(1)} stretching times</h3>
      <p>The loop is <strong>${fmt(u.length)}</strong> times longer.</p>
      <p>Its magnetic energy is <strong>${fmt(u.energy)}</strong> times the start.</p>
      <p class="small">Eddies: ${view ? view.bandName(u.nb) : ''}${u.finished ? '. Run finished.' : '.'}</p>`;
  }
  async function start() {
    if (started) return; started = true; msg.textContent = 'Loading the 3D view…';
    try {
      const [{ createStretch }, lut] = await Promise.all([import('./stretch3d.js'), fetch('data/ember_lut.json').then((r) => r.json())]);
      view = createStretch({ canvas: document.getElementById('s3d'), chart: document.getElementById('s3chart'), lut: lut.rgb, reduceMotion, onUpdate });
      msg.hidden = true;
      [play, restartB, endB, resetB].forEach((b) => { b.disabled = false; }); bands.disabled = false;
      play.addEventListener('click', () => view.toggle());
      restartB.addEventListener('click', () => view.restart());
      endB.addEventListener('click', () => view.skipToEnd());
      resetB.addEventListener('click', () => view.reset());
      bands.addEventListener('change', (e) => view.restart(Number(e.target.value)));
      sec.dataset.ready = '1';
      maybeAutoplay();
    } catch (err) {
      msg.textContent = 'The 3D view could not start in this browser (WebGL is needed). The chart and text above describe it.';
      console.warn('3D view unavailable:', err);
    }
  }
  let inView = false;
  function maybeAutoplay() { if (view && inView && !autoplayed && !reduceMotion) { autoplayed = true; view.play(); } }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) start(); }, { rootMargin: '400px 0px' }).observe(sec);
    new IntersectionObserver((ents) => {
      inView = ents.some((e) => e.isIntersecting); if (view) view.setVisible(inView); maybeAutoplay();
    }, { threshold: 0.35 }).observe(document.getElementById('s3d'));
  } else start();
}

// ---------------------------------------------------------------- boot
buildLadder();
buildCascade();
buildStretchLauncher();
buildSurvival();
fetch('data/kazantsev_frames.json').then((r) => r.json()).then(async (D) => {
  await buildPlayer(D);
  document.documentElement.dataset.ready = '1';
});
