// Step 2: the turbulent cascade. Canvas 2D; animates only while visible, never under prefers-reduced-motion or when paused.
// Grounded parts (sources in the page's reference list):
// - eddy speeds follow Kolmogorov (1941): du_l ~ (eps l)^{1/3}, so an eddy of size l turns over at a rate u_l / l ~ l^{-2/3}.
//   The rotation speeds of the drawn eddies, the energy packet's time per level and the stretching-rate bars all use that law.
// - spectrum: E(k) ~ k^{-5/3} (Kolmogorov 1941, as stated in Schekochihin 2020 eq. 2.1) with an exponential viscous cut-off
//   (shape illustrative; the same form is fitted to simulations in Kriel et al. 2022).
// - magnetic curve: the shape of the growing Kazantsev mode, M ~ x^{3/2} K0(x), x = k/k_eta; its height
//   relative to the velocity spectrum is illustrative.
// - spacing of the marked sizes is illustrative (k_nu = 16 k_L, k_eta = 10 k_nu, d_e = 50 l_eta); the caption says so.
import { logK0 } from './physics.js';
import { withCites } from './refs.js';

const COL = { ink: '#1a1d23', muted: '#555c68', rule: '#c9c5bc', accent: '#b5430f', mag: '#71026e', hi: 'rgba(181,67,15,0.13)' };
const NLEV = 5;                                  // eddy sizes L, L/2, ..., L/16
const KNU = 2 ** (NLEV - 1), KETA = 10 * KNU, KSEED = 50 * KETA;
const rate = (n) => 2 ** (2 * n / 3);            // turnover (stretching) rate of level n relative to the largest eddies

export const CSTAGES = [
  { id: 'stir', name: 'Stirring', levels: [0], krange: [0.85, 1.5],
    text: 'Something stirs the gas on the largest scales. In a galaxy cluster that can be clusters merging, the wakes of galaxies or jets from giant black holes[[Schekochihin2005fast]]. The largest eddies hold most of the energy.' },
  { id: 'break', name: 'Breaking up', levels: [1, 2, 3], krange: [1.5, 11],
    text: 'Each eddy breaks up into smaller, faster eddies and hands its energy on. The same amount of energy per second flows through every size, which gives Kolmogorov\'s famous spectrum: energy falls off with size as the −5/3 power of the wavenumber[[Schekochihin2020turbulence]].' },
  { id: 'visc', name: 'Smallest eddies', levels: [4], krange: [11, 24],
    text: 'At the viscous scale, the gas\'s internal friction turns the energy into heat and the cascade ends. These smallest eddies turn over fastest, so they stretch magnetic field lines fastest[[Schekochihin2002model]].' },
  { id: 'mag', name: 'Below the eddies', levels: [], krange: [24, 3 * KETA],
    text: 'There are no smaller eddies, but the smallest ones keep stretching and folding the magnetic field into ever thinner sheets. The folding stops near the resistive scale, where the plasma\'s resistance smooths the field out. That is where the growing field is concentrated[[Kriel2022fundamental,StOnge2020fluctuation]].' },
];

function fit(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

export function createCascade({ eddies, spec, buttons, caption, pauseBtn, reduceMotion }) {
  let stage = 0, playing = !reduceMotion, visible = false, raf = 0, t = 0, last = 0;
  // geometry of the eddy column, recomputed on draw
  let rows = [];

  function drawEddies() {
    const { ctx, w, h } = fit(eddies); ctx.clearRect(0, 0, w, h);
    const narrow = w < 440;
    const labW = narrow ? 86 : 118, barW = narrow ? 70 : 104;
    const gap = 16, top = 30, bottom = 30;
    const D0 = Math.min(w - labW - barW - 24, (h - top - bottom - gap * (NLEV - 1)) / (2 - 2 ** (1 - NLEV)));
    if (!(D0 > 16)) return;                       // canvas not laid out yet (or far too small)
    const x0 = labW + (w - labW - barW - D0) / 2;
    rows = []; let y = top;
    for (let n = 0; n < NLEV; n++) { const d = D0 / 2 ** n; rows.push({ y, d }); y += d + gap; }
    const sel = CSTAGES[stage].levels;
    ctx.font = `${narrow ? 11 : 12}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.ink; ctx.textAlign = 'left';
    ctx.textAlign = 'right'; ctx.fillText('energy in', x0 + D0 / 2 - 6, 12);
    ctx.strokeStyle = COL.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 + D0 / 2, 4); ctx.lineTo(x0 + D0 / 2, top - 4); ctx.stroke();
    arrowHead(ctx, x0 + D0 / 2, top - 3, Math.PI / 2, COL.accent);
    const labels = ['largest eddies', 'half size', 'quarter size', 'eighth size', 'viscous scale'];
    rows.forEach(({ y: ry, d }, n) => {
      if (sel.includes(n)) { ctx.fillStyle = COL.hi; ctx.fillRect(4, ry - gap / 2 + 2, w - 8, d + gap - 4); }
      const cnt = 2 ** n;
      for (let i = 0; i < cnt; i++) {
        const cx = x0 + (i + 0.5) * d, cy = ry + d / 2, r = d * 0.42;
        // alternate the sense of rotation, as neighbouring eddies do
        drawEddy(ctx, cx, cy, r, (i + n) % 2 ? 1 : -1, t * 0.35 * rate(n), sel.includes(n) ? COL.accent : COL.muted, n);
      }
      ctx.fillStyle = sel.includes(n) ? COL.accent : COL.ink; ctx.textAlign = 'right';
      ctx.fillText(labels[n], labW - 6, ry + d / 2);
      // stretching-rate bar, proportional to l^{-2/3}
      const bx = x0 + D0 + 14, bl = (barW - 22) * rate(n) / rate(NLEV - 1);
      ctx.fillStyle = sel.includes(n) ? COL.accent : '#9aa0a8'; ctx.fillRect(bx, ry + d / 2 - 4, Math.max(2, bl), 8);
    });
    // energy packet: spends a time proportional to the turnover time (l^{2/3}) on each level, so it speeds up on the way down
    const T0 = 2.4, durs = rows.map((_, n) => T0 / rate(n)), total = durs.reduce((a, b) => a + b, 0) + 0.8;
    let tau = t % total, n = 0;
    while (n < NLEV && tau > durs[n]) { tau -= durs[n]; n++; }
    if (n < NLEV) {
      const { y: ry, d } = rows[n], frac = tau / durs[n];
      const py = ry + d * (0.15 + 0.7 * frac), px = x0 + D0 / 2 + Math.sin(frac * Math.PI * 2) * d * 0.15;
      ctx.fillStyle = 'rgba(181,67,15,0.85)'; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 2 * Math.PI); ctx.fill();
    }
    const yb = y - gap + 6;
    ctx.fillStyle = COL.muted; ctx.textAlign = 'left'; ctx.fillText('↓ heat', x0 + D0 / 2 - 14, Math.min(h - 10, yb + 8));
    ctx.textAlign = 'center'; ctx.fillStyle = COL.ink;
    ctx.fillText(narrow ? 'stretching rate' : 'how fast they stretch', x0 + D0 + 14 + (barW - 22) / 2, 12);
  }
  function drawEddy(ctx, cx, cy, r, dir, ang, color, n) {
    ctx.strokeStyle = color; ctx.lineWidth = n > 2 ? 1.2 : 1.6;
    for (let a = 0; a < 2; a++) {
      const a0 = dir * ang + a * Math.PI, a1 = a0 + dir * Math.PI * 0.75;
      ctx.beginPath(); ctx.arc(cx, cy, r * (a ? 0.62 : 1), a0, a1, dir < 0); ctx.stroke();
      if (r > 5) arrowHead(ctx, cx + r * (a ? 0.62 : 1) * Math.cos(a1), cy + r * (a ? 0.62 : 1) * Math.sin(a1), a1 + dir * Math.PI / 2, color, Math.min(5, r * 0.35));
    }
  }
  function arrowHead(ctx, x, y, dir, color, s = 6) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x + s * Math.cos(dir), y + s * Math.sin(dir));
    ctx.lineTo(x + s * Math.cos(dir + 2.5), y + s * Math.sin(dir + 2.5));
    ctx.lineTo(x + s * Math.cos(dir - 2.5), y + s * Math.sin(dir - 2.5)); ctx.closePath(); ctx.fill();
  }

  function drawSpec() {
    const { ctx, w, h } = fit(spec); ctx.clearRect(0, 0, w, h);
    const narrow = w < 440;
    const box = { x: 30, y: 34, w: w - 44, h: h - 92 };
    const lx = [Math.log10(0.6), Math.log10(KSEED * 1.6)], ly = [-7.2, 0.6];
    const X = (k) => box.x + (Math.log10(k) - lx[0]) / (lx[1] - lx[0]) * box.w;
    const Y = (v) => box.y + box.h - (Math.log10(v) - ly[0]) / (ly[1] - ly[0]) * box.h;
    const kr = CSTAGES[stage].krange;
    ctx.fillStyle = COL.hi; ctx.fillRect(X(kr[0]), box.y, X(kr[1]) - X(kr[0]), box.h);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(box.x, box.y); ctx.lineTo(box.x, box.y + box.h); ctx.lineTo(box.x + box.w, box.y + box.h); ctx.stroke();
    ctx.font = `${narrow ? 11 : 12}px system-ui, sans-serif`; ctx.textBaseline = 'alphabetic';
    // marked sizes, linked to the ladder in step 1
    const marks = [[1, narrow ? 'largest' : 'largest eddies', COL.ink], [KNU, 'viscous', COL.ink], [KETA, 'resistive', COL.mag], [KSEED, narrow ? 'seed' : 'seed born', COL.mag]];
    for (const [k, lab, c] of marks) {
      ctx.strokeStyle = c; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(k), box.y); ctx.lineTo(X(k), box.y + box.h); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = c; ctx.textAlign = k === 1 ? 'left' : k === KSEED ? 'right' : 'center';
      ctx.fillText(lab, X(k) + (k === 1 ? -2 : k === KSEED ? 2 : 0), box.y + box.h + 15);
      if (k === KNU || k === KETA) ctx.fillText('scale', X(k), box.y + box.h + 29);
    }
    // velocity spectrum: k^{-5/3} with an exponential viscous cut-off
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.4; ctx.beginPath();
    for (let i = 0; i <= 300; i++) { const k = 10 ** (0 + i / 300 * 3); const v = k ** (-5 / 3) * Math.exp(-k / KNU);
      i ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v)); }
    ctx.stroke();
    // magnetic: growing Kazantsev mode shape x^{3/2} K0(x), x = k/k_eta, peak height illustrative
    const mag = (k) => { const x = k / KETA; return Math.exp(1.5 * Math.log(x) + logK0(x)); };
    const mpk = mag(1.0675 * KETA), A = 10 ** -3.2 / mpk;
    ctx.strokeStyle = COL.mag; ctx.lineWidth = 2; ctx.setLineDash([7, 4]); ctx.beginPath();
    for (let i = 0; i <= 300; i++) { const k = 10 ** (Math.log10(0.8) + i / 300 * (Math.log10(KETA * 40) - Math.log10(0.8)));
      const v = A * mag(k); i ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v)); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // labels on the lines
    ctx.textAlign = 'left'; ctx.fillStyle = COL.ink;
    const kl = 2.6; ctx.fillText('slope −5/3', X(kl) + 6, Y(kl ** (-5 / 3)) - 6);
    ctx.fillText(narrow ? 'eddy energy' : 'energy in eddies', X(1.05), Y(1) - 8);
    ctx.fillStyle = COL.mag; ctx.textAlign = 'center';
    ctx.fillText(narrow ? 'magnetic field' : 'growing magnetic field', X(KETA), Y(10 ** -3.2) - 10);
    ctx.fillStyle = COL.ink; ctx.textAlign = 'left'; ctx.fillText('energy at each size', box.x, box.y - 14);
    ctx.fillStyle = COL.muted; ctx.textAlign = 'center';
    ctx.fillText('← larger      size      smaller →', box.x + box.w / 2, box.y + box.h + 50);
  }

  function draw() { drawEddies(); drawSpec(); }
  function setStage(i, focus) {
    stage = (i + CSTAGES.length) % CSTAGES.length;
    buttons.forEach((b, j) => { b.setAttribute('aria-pressed', String(j === stage)); b.tabIndex = j === stage ? 0 : -1; });
    if (focus) buttons[stage].focus();
    caption.innerHTML = `<h3>${CSTAGES[stage].name}</h3><p>${withCites(CSTAGES[stage].text)}</p>`;
    draw();
  }
  function loop(now) {
    raf = 0;
    if (!playing || !visible) return;
    t += Math.min(0.1, (now - last) / 1000); last = now; draw();
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (playing && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function setPlaying(p) {
    playing = p; pauseBtn.textContent = p ? 'Pause motion' : 'Play motion'; pauseBtn.setAttribute('aria-pressed', String(!p)); kick();
  }
  buttons.forEach((b, i) => b.addEventListener('click', () => setStage(i, true)));
  buttons[0].parentElement.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') setStage(stage + 1, true);
    else if (k === 'ArrowLeft' || k === 'ArrowUp') setStage(stage - 1, true);
    else if (k === 'Home') setStage(0, true);
    else if (k === 'End') setStage(CSTAGES.length - 1, true);
    else return;
    e.preventDefault();
  });
  // clicking a row of eddies selects its stage
  eddies.addEventListener('click', (e) => {
    const r = eddies.getBoundingClientRect(), y = e.clientY - r.top;
    const n = rows.findIndex((row) => y >= row.y - 8 && y <= row.y + row.d + 8);
    if (n >= 0) setStage(CSTAGES.findIndex((s) => s.levels.includes(n)), false);
  });
  pauseBtn.addEventListener('click', () => setPlaying(!playing));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((ents) => { visible = ents.some((x) => x.isIntersecting); kick(); }).observe(eddies);
  }
  window.addEventListener('resize', draw);
  setPlaying(playing);
  setStage(0, false);
  return { setStage, setPlaying, get stage() { return stage; }, get time() { return t; } };
}
