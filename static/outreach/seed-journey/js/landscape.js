// "A race against resistance, drawn as a landscape": the Kazantsev model in its Schrodinger-like form, solved live in the browser.
// Canvas 2D, no dependencies beyond physics.js. The solver part (createSolver, createRun) touches no DOM, so it also runs outside
// a browser. Every statement in these comments was checked symbolically or numerically before the page was published.
//
// THE EQUATION. The model's Fokker-Planck equation for the magnetic spectrum M(k,t) in the large-Prandtl-number (Batchelor) regime:
//     dM/dt = (gammabar/5) (k^2 M'' - 2 k M' + 6 M) - 2 eta k^2 M.
// With s = ln k and M = k^{3/2} phi(s,t) it becomes
//     dphi/dt = (gammabar/5) d^2phi/ds^2 - [ 2 eta k^2 - (3/4) gammabar ] phi,
// and with the resistive wavenumber k_eta = (gammabar / 10 eta)^{1/2}, 2 eta k^2 = (gammabar/5) (k/k_eta)^2.
// In the units used here (time 1/gammabar, wavenumber k_eta, x = k/k_eta = e^s):
//     dphi/dT = DIFF d^2phi/ds^2 - V(s) phi,     V(s) = WALL e^{2s} - VALLEY.
// The second-derivative term is the turbulence (each mode's ln k wanders); V is the landscape: flat at -VALLEY for large
// sizes (growth) and rising as x^2 for small ones (resistive decay). Energy: W = int M dk = int k^{5/2} phi ds.
// The energy per unit ln k, e = k M = k^{5/2} phi, is what the view draws. It obeys
//     de/dT = (1/5) e_ss - e_s + (2 - x^2/5) e
// (the same model: spreading, a drift to smaller sizes at one e-fold per stretching time, growth at 2 gammabar, resistance).
// K0(e^s) solves DIFF f'' - WALL e^{2s} f = 0, so phi = e^{(3/4)T} K0(x) is the growing pattern at the edge of the model's
// continuum, and e = x^{5/2} K0(x) is its energy per unit ln k, peaked at x = 2.04.
// Numerical checks of the solver (the model's exact time-dependent solution, the narrow-seed surviving fraction, the growth
// rate, convergence, eta = 0, boundaries, positivity, frame-by-frame stepping, the read-out's statements).
import { logK0, log10Fnarrow } from './physics.js';

// ---------------------------------------------------------------- the model's coefficients (read as written here by the symbolic checks)
export const DIFF = 1 / 5;            // gammabar/5: diffusion coefficient in ln k
export const VALLEY = 3 / 4;          // depth of the flat valley: growth rate (3/4) gammabar
export const WALL = 1 / 5;            // 2 eta k_eta^2 / gammabar, from k_eta = (gammabar / 10 eta)^{1/2}
export const ENERGY_WEIGHT = 5 / 2;   // W = int k^{5/2} phi ds

// ---------------------------------------------------------------- numerical and display choices
export const ZMIN = -12, ZMAX = 4;    // domain in s = ln(k/k_eta): k/k_eta from 6e-6 to 55
export const NGRID = 1281;            // uniform grid, ds = 0.0125
export const SIGMA = 0.03;            // width of the seed in ln k (Gaussian in energy per unit ln k)
export const T_END = 30;              // run length, in stretching times 1/gammabar
export const EPS = 0.01, DT_MIN = 2e-4, DT_MAX = 0.02;   // largest time step: dT = clamp(EPS * T, DT_MIN, DT_MAX)
export const X0_MIN = 10 / 33, X0_MAX = 10, X0_DEFAULT = 4;   // slider range of the seed size x0 = k0/k_eta (3.3 times larger to 10 times smaller)
export const X_FORMULA = 3;           // the surviving fraction is quoted from x0 = 3 up, as in the "Move the seed" step
export const STEADY_SHAPE = 0.05, STEADY_RATE = 0.15, STEADY_HOLD = 3;   // "steady growth": see createRun
export const GHOST_AT = 0.1;          // "almost all of the seed is erased": the energy has fallen below a tenth of its start
const G2 = 0.9064024770554771 ** 2 / Math.sqrt(2 * Math.PI);   // Gamma(5/4)^2 / sqrt(2 pi), prefactor of the late-time law

export const landscapeV = (x) => WALL * x * x - VALLEY;
// energy per unit ln k of the growing pattern, x^{5/2} K0(x) (not normalized)
export const patternDensity = (z) => Math.exp(ENERGY_WEIGHT * z + logK0(Math.exp(z)));

// ---------------------------------------------------------------- solver
// Strang splitting, second order and unconditionally stable:
//   phi <- exp(-V dT/2) phi     the landscape term, integrated exactly (so the steep wall causes no stiffness)
//   phi <- Crank-Nicolson step of dphi/dT = DIFF phi_ss (tridiagonal solve)
//   phi <- exp(-V dT/2) phi
// Boundaries: phi = 0 at both ends. At the small-size end (x = 55) the field is erased at 600 per stretching time, so nothing
// is there. At the large-size end (x = 6e-6) the pure model has no wall: phi spreads into the valley for ever (a continuum of
// growing modes). No infrared cut-off is added. The domain is wide enough that the spreading front does not reach the boundary
// before T_END, and the energy weight k^{5/2} makes that region irrelevant to W: the choice of boundary condition and a wider
// domain change W(T_END) by less than 1e-8.
export function createSolver({ x0, sigma = SIGMA, zmin = ZMIN, zmax = ZMAX, n = NGRID, eps = EPS, dtMin = DT_MIN, dtMax = DT_MAX,
  wall = WALL, ir = 'dirichlet' } = {}) {
  const dz = (zmax - zmin) / (n - 1), s0 = Math.log(x0);
  const z = new Float64Array(n), V = new Float64Array(n), weight = new Float64Array(n), k0 = new Float64Array(n);
  const phi = new Float64Array(n), rhs = new Float64Array(n), cp = new Float64Array(n), den = new Float64Array(n), R = new Float64Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) {
    z[i] = zmin + i * dz; V[i] = wall * Math.exp(2 * z[i]) - VALLEY; weight[i] = Math.exp(ENERGY_WEIGHT * z[i]);
    k0[i] = Math.exp(logK0(Math.exp(z[i])));
    const e = Math.exp(-0.5 * ((z[i] - s0) / sigma) ** 2);     // seed: Gaussian in energy per unit ln k, unit energy
    phi[i] = e / weight[i]; norm += e * dz;
  }
  for (let i = 0; i < n; i++) phi[i] /= norm;
  phi[0] = 0; phi[n - 1] = 0;
  const b1 = () => (ir === 'neumann' ? 1 + r / 2 : 1 + r);       // first interior row: zero-gradient or zero-value at the infrared end
  let T = 0, dtC = -1, r = 0, steps = 0;
  function prepare(dt) {
    dtC = dt; r = DIFF * dt / (dz * dz);
    for (let i = 0; i < n; i++) R[i] = Math.exp(-0.5 * dt * V[i]);
    const a = -r / 2; den[1] = b1(); cp[1] = a / den[1];
    for (let i = 2; i < n - 1; i++) { den[i] = 1 + r - a * cp[i - 1]; cp[i] = a / den[i]; }
  }
  function step(maxDt = Infinity) {                              // maxDt: shorten the step to land on a requested time
    const dt = Math.min(dtMax, Math.max(dtMin, eps * T), maxDt);
    if (dt !== dtC) prepare(dt);
    const a = -r / 2, h = r / 2;
    for (let i = 1; i < n - 1; i++) phi[i] *= R[i];
    rhs[1] = phi[1] + h * ((ir === 'neumann' ? phi[1] : 0) - 2 * phi[1] + phi[2]);
    for (let i = 2; i < n - 1; i++) rhs[i] = phi[i] + h * (phi[i - 1] - 2 * phi[i] + phi[i + 1]);
    rhs[1] /= den[1];
    for (let i = 2; i < n - 1; i++) rhs[i] = (rhs[i] - a * rhs[i - 1]) / den[i];
    phi[n - 2] = rhs[n - 2];
    for (let i = n - 3; i >= 1; i--) phi[i] = rhs[i] - cp[i] * phi[i + 1];
    for (let i = 1; i < n - 1; i++) phi[i] *= R[i];
    T += dt; steps++;
    return dt;
  }
  const energy = () => { let s = 0; for (let i = 0; i < n; i++) s += weight[i] * phi[i]; return s * dz; };
  // Gamma(5/4)^2/sqrt(2 pi) * <phi, K0> e^{-(3/4) T}: constant in time in the exact model (the operator is self-adjoint and
  // K0(e^s) is its edge eigenfunction), and equal to the model's surviving fraction for this seed.
  const projection = () => { let s = 0; for (let i = 0; i < n; i++) s += k0[i] * phi[i]; return G2 * s * dz * Math.exp(-VALLEY * T); };
  return { n, dz, z, phi, weight, step, energy, projection, get T() { return T; }, get steps() { return steps; } };
}

// A run: the solver plus what the view reads from it. The page and the numerical checks use the same code.
// "Steady growth" (when the surviving share is shown) means both: the energy's distribution over ln k is within STEADY_SHAPE
// of the growing pattern (half the integrated absolute difference of the two unit-area curves), and the growth rate of W is
// within STEADY_RATE of the limiting (3/4) gammabar, and both have held for STEADY_HOLD stretching times (a seed born in the
// valley passes through the pattern's shape once, briefly, before it settles).
export function createRun(x0, opts = {}) {
  const S = createSolver({ x0, ...opts }), n = S.n, tEnd = opts.tEnd ?? T_END;
  const dens = new Float64Array(n), pat = new Float64Array(n);
  let ps = 0; for (let i = 0; i < n; i++) { pat[i] = patternDensity(S.z[i]); ps += pat[i] * S.dz; }
  for (let i = 0; i < n; i++) pat[i] /= ps;
  const hT = [0], hW = [0];
  let W = 1, Wmin = 1, Tmin = 0, peak = 0, shape = 1, rate = NaN, steadyAt = null, since = null;
  function measure() {
    let s = 0, m = 0; for (let i = 0; i < n; i++) { const e = S.weight[i] * S.phi[i]; dens[i] = e; s += e; if (e > m) m = e; }
    W = s * S.dz; peak = m;
    let d = 0; for (let i = 0; i < n; i++) d += Math.abs(dens[i] / W - pat[i]);
    shape = 0.5 * d * S.dz;
  }
  measure();
  const W0 = W;                                                  // 1 up to the quadrature of the seed
  function advanceTo(T) {                                        // lands exactly on min(T, tEnd)
    const target = Math.min(T, tEnd); let stepped = false;
    while (target - S.T > 1e-12) {
      const lw = Math.log(W), dt = S.step(target - S.T); measure(); stepped = true;
      if (opts.onStep) opts.onStep(S);
      rate = (Math.log(W) - lw) / dt;
      hT.push(S.T); hW.push(Math.log10(W / W0));
      if (W < Wmin) { Wmin = W; Tmin = S.T; }
      if (shape < STEADY_SHAPE && Math.abs(rate - VALLEY) < STEADY_RATE) { if (since === null) since = S.T; } else since = null;
      if (steadyAt === null && since !== null && S.T - since >= STEADY_HOLD) steadyAt = S.T;
    }
    return stepped;
  }
  return { x0, solver: S, dens, pat, hT, hW, advanceTo, tEnd,
    get T() { return S.T; }, get W() { return W / W0; }, get Wmin() { return Wmin / W0; }, get Tmin() { return Tmin; },
    get peak() { return peak; }, get shape() { return shape; }, get rate() { return rate; }, get steadyAt() { return steadyAt; },
    get done() { return S.T >= tEnd - 1e-12; } };
}

// ---------------------------------------------------------------- view
// Playback clock: wall-clock progress u in [0,1] maps to model time T = T_END (A_LIN u + (1 - A_LIN) u^P_WARP), slow at the
// start (where resistance acts within a fraction of a stretching time) and faster later. The page says so. Every frame
// advances the solver exactly to that frame's time (one or more steps, the last one shortened), so no frame is held.
export const DURATION = 18, A_LIN = 0.01, P_WARP = 2.5;
export const warp = (u) => T_END * (A_LIN * u + (1 - A_LIN) * u ** P_WARP);
export function unwarp(T) { let a = 0, b = 1; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (warp(m) < T) a = m; else b = m; } return T >= T_END ? 1 : (a + b) / 2; }

// Display range in size and the vertical scale of the landscape. The landscape's drawn height is the square root of its height
// above the valley floor, sqrt(V + VALLEY) = x / sqrt(5): a compression, stated on the canvas, so that the valley and the wall
// at x = 10 (V = 19 gammabar) fit in one picture.
const XV0 = 0.03, XV1 = 30, HV0 = -0.5, HV1 = 4.75;
const drawnHeight = (z) => Math.sqrt(WALL) * Math.exp(z);
const X_EVEN = Math.sqrt(VALLEY / WALL);                         // V = 0 at x = sqrt(15)/2 = 1.94

// Website dark slate palette. Keep this drawing-only palette independent of the solver and DOM.
const P = { bg: '#121c2a', ink: '#edf2f7', muted: '#b2bfce', rule: '#36485e', energy: '#8cccf4', energyFill: 'rgba(140,204,244,0.16)',
  grow: 'rgba(232,186,76,0.22)', erase: 'rgba(221,139,218,0.13)', ground: '#edf2f7' };
// Every sentence drawn on the canvases
export const CANVAS_TEXT = {
  head1: 'Where the seed’s remaining magnetic energy is (shape only: redrawn at full height in every frame, however little is left)',
  head2: 'The landscape (lower is growth, wall height compressed). Glow: where the energy is now',
  grow: 'here resistance is too slow to stop the growth',
  erase: 'here resistance erases faster than the pattern grows, and faster still at smaller sizes',
  even: 'break-even', born: 'seed born here', pattern: 'the growing pattern', ghost: 'almost all of the seed is erased here',
  late: 'dashed: the model’s formula for late times',
};

function fit(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
function wrap(ctx, text, maxW) {
  const lines = []; let cur = '';
  for (const wd of text.split(' ')) {
    const t = cur ? `${cur} ${wd}` : wd;
    if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
const widest = (ctx, lines) => Math.max(0, ...lines.map((t) => ctx.measureText(t).width));
function balanced(ctx, text, maxW) {                              // the same number of lines as wrap(), with lines of similar length
  const n = wrap(ctx, text, maxW).length; let lo = 0, hi = maxW;
  for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (wrap(ctx, text, m).length > n) lo = m; else hi = m; }
  return wrap(ctx, text, hi);
}
function supText(ctx, base, exp, x, y) {                          // right-aligned "10" with a superscript
  const f = ctx.font, small = f.replace(/(\d+)px/, (m, p) => `${Math.round(p * 0.75)}px`);
  ctx.font = small; const ew = ctx.measureText(exp).width; ctx.font = f;
  const bw = ctx.measureText(base).width;
  ctx.textAlign = 'left'; ctx.fillText(base, x - bw - ew, y); ctx.font = small; ctx.fillText(exp, x - ew, y - 5); ctx.font = f;
}
// half-maximum points of the growing pattern's energy curve, for placing its label
const PATTERN = (() => {
  let zp = 0, m = 0; for (let z = -4; z < 3; z += 0.002) { const v = patternDensity(z); if (v > m) { m = v; zp = z; } }
  let zl = zp, zr = zp; while (patternDensity(zl) > 0.5 * m) zl -= 0.002; while (patternDensity(zr) > 0.5 * m) zr += 0.002;
  return { max: m, zl, zr };
})();

export function createLandscape({ canvas, chart, reduceMotion = false, x0 = X0_DEFAULT, onUpdate = () => {} }) {
  let run = createRun(x0), u = 0, playing = false, visible = true, raf = 0, last = 0;
  let layout = null;                                              // clearances between the labels and the curve, in CSS pixels (for the checks)

  function drawMain() {
    const { ctx, w, h } = fit(canvas);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    if (w < 120 || h < 200) return;                               // not laid out yet
    const narrow = w < 440, fs = narrow ? 12 : 13, lh = fs + 4;
    const font = `${fs}px system-ui, sans-serif`, small = '12px system-ui, sans-serif';
    ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    const L = 12, R = w - 12, Z0 = Math.log(XV0), Z1 = Math.log(XV1);
    const X = (z) => L + (z - Z0) / (Z1 - Z0) * (R - L);
    const head1 = wrap(ctx, CANVAS_TEXT.head1, R - L), head2 = wrap(ctx, CANVAS_TEXT.head2, R - L);
    const S = run.solver, z = S.z, s0 = Math.log(run.x0), xs = X(s0);
    const i0 = Math.max(1, Math.floor((Z0 - z[0]) / S.dz)), i1 = Math.min(S.n - 2, Math.ceil((Z1 - z[0]) / S.dz));
    // A strip of labels above the curves of the upper band: "seed born here" and, for the seeds that lose almost all of their
    // energy (the same seeds for which the share is quoted), a second label that appears once that has happened. The strip's
    // height depends on the seed and the width only, never on time, so nothing moves while the run plays.
    ctx.font = small;
    const bornRight = run.x0 < 2 && xs + 6 + ctx.measureText(CANVAS_TEXT.born).width < R;
    const ghostOn = run.x0 >= X_FORMULA, ghostLines = ghostOn ? wrap(ctx, CANVAS_TEXT.ghost, xs - 6 - L) : [];
    const ramp = (from) => (ghostOn ? Math.min(1, Math.max(0, (from - run.Wmin) / (from - GHOST_AT))) : 0);
    const ghostA = ramp(0.5), ghostLabelA = ramp(0.2);            // the ghost fades in as the energy falls from 50% to 10%, its label from 20% to 10%
    const strip = 7 + 15 * (1 + ghostLines.length);
    ctx.font = font;
    const yA = 6 + head1.length * lh + 4, bottom = 44;
    const avail = h - yA - bottom - 14 - head2.length * lh;
    const hA = Math.round(avail * (narrow ? 0.42 : 0.46)), yB = yA + hA + 14 + head2.length * lh, hB = h - bottom - yB;
    const Y = (hv) => yB + hB - (hv - HV0) / (HV1 - HV0) * hB;     // vertical scale of the lower band
    const ye = Y(Math.sqrt(VALLEY));                              // break-even level, V = 0

    // headings
    ctx.fillStyle = P.ink; ctx.textAlign = 'left';
    head1.forEach((t, i) => ctx.fillText(t, L, 6 + (i + 1) * lh - 4));
    head2.forEach((t, i) => ctx.fillText(t, L, yA + hA + 14 + (i + 1) * lh - 4));

    // zone labels of the lower band. The "erases" label is right-aligned at the first of a few anchors where its last line
    // stays clear of the wall (which is lower everywhere to the left of the anchor).
    let xw = 0, wl = [], wallGap = 0;
    for (const xa of [6, 5, 4.2, 3.5, 3, 2.5]) {
      xw = X(Math.log(xa)); wl = balanced(ctx, CANVAS_TEXT.erase, xw - L - 4);
      wallGap = Y(drawnHeight(Math.log(xa))) - (yB + 6 + wl.length * lh);
      if (wallGap >= 10) break;
    }
    const vl = balanced(ctx, CANVAS_TEXT.grow, X(-0.1) - L - 10);
    const wlBottom = yB + 6 + wl.length * lh, vlTop = ye - 8 - vl.length * lh + 3;
    const sideBySide = xw - widest(ctx, wl) > L + 6 + widest(ctx, vl) + 8;
    layout = { wallGap, zoneGap: sideBySide ? Infinity : vlTop - wlBottom, eraseLines: wl.length, growLines: vl.length,
      ghostLines: ghostLines.length, curveHeight: hA - strip, lowerBand: hB };

    // ---- upper band: the energy's distribution over size, normalized to its own peak in every frame
    const baseA = yA + hA, topA = yA + strip, HA = baseA - topA;
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, baseA + 0.5); ctx.lineTo(R, baseA + 0.5); ctx.stroke();
    // the resistive scale, through both bands
    ctx.strokeStyle = P.muted; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(X(0), topA - 1); ctx.lineTo(X(0), baseA);   // below the label strip
    ctx.moveTo(X(0), wlBottom + 4); ctx.lineTo(X(0), yB + hB); ctx.stroke();
    // where the seed was born
    ctx.strokeStyle = P.energy; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(xs, yA + 4); ctx.lineTo(xs, baseA); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.beginPath(); ctx.rect(L, yA, R - L, hA + 1); ctx.clip();
    // the growing pattern x^{5/2} K0(x), dashed outline
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]); ctx.beginPath();
    for (let i = i0; i <= i1; i += 2) { const y = baseA - HA * patternDensity(z[i]) / PATTERN.max; i === i0 ? ctx.moveTo(X(z[i]), y) : ctx.lineTo(X(z[i]), y); }
    ctx.stroke(); ctx.setLineDash([]);
    // ghost of the seed as it was born (its own Gaussian, at full height), left behind where almost all of it is erased
    if (ghostA > 0) {
      ctx.globalAlpha = 0.3 * ghostA; ctx.fillStyle = P.energy; ctx.beginPath(); ctx.moveTo(X(s0 - 4 * SIGMA), baseA);
      for (let q = -4; q <= 4; q += 0.25) ctx.lineTo(X(s0 + q * SIGMA), baseA - HA * Math.exp(-0.5 * q * q));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    // the energy now
    const d = run.dens, pk = run.peak || 1;
    ctx.beginPath(); ctx.moveTo(X(z[i0]), baseA);
    for (let i = i0; i <= i1; i++) ctx.lineTo(X(z[i]), baseA - HA * d[i] / pk);
    ctx.lineTo(X(z[i1]), baseA); ctx.closePath(); ctx.fillStyle = P.energyFill; ctx.fill();
    ctx.strokeStyle = P.energy; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = i0; i <= i1; i++) { const y = baseA - HA * d[i] / pk; i === i0 ? ctx.moveTo(X(z[i]), y) : ctx.lineTo(X(z[i]), y); }
    ctx.stroke();
    ctx.restore();
    // labels of the upper band (the seed's labels sit in the strip above the curves; the pattern label on the flank away from the seed)
    ctx.font = small; ctx.fillStyle = P.energy;
    ctx.textAlign = bornRight ? 'left' : 'right'; ctx.fillText(CANVAS_TEXT.born, xs + (bornRight ? 6 : -6), yA + 15);
    if (ghostLabelA > 0) { ctx.globalAlpha = ghostLabelA; ghostLines.forEach((t, i) => ctx.fillText(t, xs - 6, yA + 30 + 15 * i)); ctx.globalAlpha = 1; }
    ctx.fillStyle = P.muted;
    const onLeft = run.x0 >= 2, px = onLeft ? X(PATTERN.zl) - 10 : X(PATTERN.zr + 0.34);   // right flank: clear of the curve's brief overshoot
    const pl = wrap(ctx, CANVAS_TEXT.pattern, onLeft ? px - L : R - px);
    ctx.textAlign = onLeft ? 'right' : 'left';
    pl.forEach((t, i) => ctx.fillText(t, px, baseA - HA * 0.5 + 4 + (i - (pl.length - 1) / 2) * 15));

    // ---- lower band: the landscape
    const xe = X(Math.log(X_EVEN));
    const terrain = () => { ctx.beginPath(); ctx.moveTo(L, yB + hB);
      for (let i = i0; i <= i1; i++) ctx.lineTo(X(z[i]), Math.max(yB, Y(drawnHeight(z[i]))));
      ctx.lineTo(X(z[i1]), yB + hB); ctx.closePath(); };
    ctx.save(); ctx.beginPath(); ctx.rect(L, yB, xe - L, hB); ctx.clip(); terrain(); ctx.fillStyle = P.grow; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(xe, yB, R - xe, hB); ctx.clip(); terrain(); ctx.fillStyle = P.erase; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(L, yB, R - L, hB); ctx.clip();
    ctx.strokeStyle = P.ground; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = i0; i <= i1; i++) { const y = Y(drawnHeight(z[i])); i === i0 ? ctx.moveTo(X(z[i]), y) : ctx.lineTo(X(z[i]), y); }
    ctx.stroke();
    // glow along the ground: the same normalized energy curve as above, as brightness
    ctx.strokeStyle = P.energy; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = i0; i < i1; i += 2) {
      const a = d[i + 1] / pk; if (a < 0.02) continue;
      ctx.globalAlpha = Math.min(1, a); ctx.beginPath();
      ctx.moveTo(X(z[i]), Y(drawnHeight(z[i]))); ctx.lineTo(X(z[i + 2]), Y(drawnHeight(z[i + 2]))); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    ctx.restore();
    // break-even level, V = 0
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(L, ye); ctx.lineTo(R, ye); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = small; ctx.fillStyle = P.muted; ctx.textAlign = 'right'; ctx.fillText(CANVAS_TEXT.even, R - 6, ye - 6);
    // where the seed was born, on the landscape
    const ym = Y(drawnHeight(s0));
    ctx.strokeStyle = P.energy; ctx.lineWidth = 2; ctx.fillStyle = P.bg; ctx.beginPath(); ctx.arc(xs, ym, 5.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    // zone labels, in the open space above the valley
    ctx.font = font; ctx.fillStyle = P.ink; ctx.textAlign = 'right';
    wl.forEach((t, i) => ctx.fillText(t, xw, yB + 6 + (i + 1) * lh - 4));
    ctx.textAlign = 'left';
    vl.forEach((t, i) => ctx.fillText(t, L + 6, ye - 8 - (vl.length - 1 - i) * lh));

    // ---- size axis
    ctx.strokeStyle = P.ink; ctx.fillStyle = P.ink; ctx.lineWidth = 1; ctx.textAlign = 'center';
    const ticks = [[0.1, '10× larger'], [1, 'the resistive scale'], [10, '10× smaller']], pitch = X(Math.log(10)) - X(0);
    let axisGap = 0;
    for (const px of [12, 11, 10]) {                               // on very narrow screens the tick labels shrink until they are apart
      ctx.font = `${px}px system-ui, sans-serif`;
      const tw = ticks.map((t) => ctx.measureText(t[1]).width); axisGap = pitch - tw[1] / 2 - Math.max(tw[0], tw[2]) / 2;
      if (axisGap >= 8) break;
    }
    layout.axisGap = axisGap;
    ctx.beginPath(); ctx.moveTo(L, yB + hB + 0.5); ctx.lineTo(R, yB + hB + 0.5); ctx.stroke();
    for (const [x, lab] of ticks) {
      const xx = X(Math.log(x)); ctx.beginPath(); ctx.moveTo(xx, yB + hB); ctx.lineTo(xx, yB + hB + 5); ctx.stroke();
      ctx.fillText(lab, xx, yB + hB + 18);
    }
    ctx.font = small; ctx.fillStyle = P.muted; ctx.fillText('← larger      size      smaller →', (L + R) / 2, yB + hB + 36);
  }

  function drawChart() {
    const { ctx, w, h } = fit(chart);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    if (w < 120 || h < 120) return;
    const box = { x: 48, y: 28, w: w - 62, h: h - 74 }, tr = [0, T_END], yr = [-7, 13];
    const X = (t) => box.x + (t - tr[0]) / (tr[1] - tr[0]) * box.w, Y = (v) => box.y + box.h - (v - yr[0]) / (yr[1] - yr[0]) * box.h;
    ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = P.ink; ctx.fillStyle = P.ink; ctx.lineWidth = 1; ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);
    for (const t of [0, 10, 20, 30]) { ctx.beginPath(); ctx.moveTo(X(t), box.y + box.h); ctx.lineTo(X(t), box.y + box.h - 5); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(String(t), X(t), box.y + box.h + 16); }
    for (const v of [-6, 0, 6, 12]) { ctx.beginPath(); ctx.moveTo(box.x, Y(v)); ctx.lineTo(box.x + 5, Y(v)); ctx.stroke();
      if (v === 0) { ctx.textAlign = 'right'; ctx.fillText('start', box.x - 6, Y(v) + 4); } else supText(ctx, '10', String(v).replace('-', '−'), box.x - 6, Y(v) + 4); }
    ctx.textAlign = 'center'; ctx.fillText('time (stretching times)', box.x + box.w / 2, box.y + box.h + 34);
    ctx.textAlign = 'left'; ctx.fillText('total magnetic energy', box.x - 40, box.y - 10);
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    ctx.strokeStyle = P.rule; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(box.x, Y(0)); ctx.lineTo(box.x + box.w, Y(0)); ctx.stroke();
    // the model's late-time law for a narrow seed, with F from physics.js: W/W0 = F (T/5)^{-3/2} e^{(3/4) T}
    const lF = log10Fnarrow(run.x0);
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]); ctx.beginPath();
    for (let t = 6; t <= T_END + 1e-9; t += 0.5) { const v = lF - 1.5 * Math.log10(t / 5) + VALLEY * t / Math.LN10; t === 6 ? ctx.moveTo(X(t), Y(v)) : ctx.lineTo(X(t), Y(v)); }
    ctx.stroke(); ctx.setLineDash([]);
    const hT = run.hT, hW = run.hW;
    ctx.strokeStyle = P.energy; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let i = 0; i < hT.length; i++) i ? ctx.lineTo(X(hT[i]), Y(hW[i])) : ctx.moveTo(X(hT[i]), Y(hW[i]));
    ctx.stroke();
    ctx.fillStyle = P.energy; ctx.beginPath(); ctx.arc(X(hT[hT.length - 1]), Y(hW[hW.length - 1]), 4, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
    ctx.fillStyle = P.muted; ctx.textAlign = 'left';
    wrap(ctx, CANVAS_TEXT.late, box.w - 16).forEach((t, i) => ctx.fillText(t, box.x + 8, box.y + 17 + i * 15));
  }

  function draw() { drawMain(); drawChart(); }
  function state() {
    return { x0: run.x0, T: run.T, W: run.W, Wmin: run.Wmin, steady: run.steadyAt !== null && run.T >= run.steadyAt,
      finished: run.done, playing, log10F: log10Fnarrow(run.x0) };
  }
  const emit = () => onUpdate(state());
  function frame(now) {
    raf = 0;
    if (!playing || !visible) return;
    u = Math.min(1, u + Math.min(0.1, Math.max(0, now - last) / 1000) / DURATION); last = now;   // never step backwards
    run.advanceTo(u >= 1 ? T_END : warp(u));
    draw();
    if (run.done) { playing = false; emit(); return; }
    emit();
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (playing && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function restart() { run = createRun(run.x0); u = 0; }
  function setPlaying(p) {
    if (p && run.done) restart();
    playing = p; draw(); emit(); kick();
  }
  function skipToEnd() { playing = false; run.advanceTo(T_END); u = 1; draw(); emit(); }
  function setSeed(x) {
    playing = false; run = createRun(Math.min(X0_MAX, Math.max(X0_MIN, x))); u = 0;
    if (reduceMotion) run.advanceTo(T_END), u = 1;                // reduced motion: show the end state, never start moving
    draw(); emit();
  }
  window.addEventListener('resize', draw);
  if (reduceMotion) { run.advanceTo(T_END); u = 1; }
  draw(); emit();
  return {
    play: () => setPlaying(true), pause: () => setPlaying(false), toggle: () => setPlaying(!playing),
    restart() { const was = playing; playing = false; restart(); draw(); emit(); if (was) setPlaying(true); },
    skipToEnd, setSeed, redraw: draw, state, layout: () => layout,
    seek(T) { playing = false; if (T < run.T) restart(); run.advanceTo(T); u = unwarp(run.T); draw(); emit(); },   // paused at time T (tests, review)
    setVisible(v) { visible = v; kick(); },
    get playing() { return playing; }, get finished() { return run.done; },
  };
}

// ---------------------------------------------------------------- page wiring
// The slider offers exactly the seed sizes its label can show ("N.N times larger/smaller than the resistive scale", worded as in
// the "Move the seed" step): 3.3 to 1.1 times larger, the same size, and 1.1 to 10 times smaller, in steps of 0.1. One label
// therefore always means one seed and one set of numbers, and the default is x0 = 4 exactly.
export const SEEDS = [...Array.from({ length: 23 }, (_, i) => 10 / (33 - i)), 1, ...Array.from({ length: 90 }, (_, i) => (11 + i) / 10)];
export const sliderToX0 = (v) => SEEDS[Math.min(SEEDS.length - 1, Math.max(0, Math.round(v)))];
export function x0ToSlider(x) {                                   // the nearest offered size (in the logarithm)
  let best = 0; for (let i = 1; i < SEEDS.length; i++) if (Math.abs(Math.log(SEEDS[i] / x)) < Math.abs(Math.log(SEEDS[best] / x))) best = i;
  return best;
}
export function sizeText(x0) {
  if (Math.abs(Math.log10(x0)) < 0.02) return 'about the same size as the resistive scale';
  const f = x0 < 1 ? 1 / x0 : x0, fs = f < 10 ? f.toFixed(1) : f.toFixed(0);
  return `${fs} times ${x0 < 1 ? 'larger' : 'smaller'} than the resistive scale`;
}
// The surviving share is the same closed form as in the "Move the seed" step (physics.js), printed to two significant figures:
// the drawn seed has a small width, which changes the share by 2% at x0 = 4 and 7% at x0 = 10.
const sig2 = (v) => { const e = Math.floor(Math.log10(v)); return Math.round(v / 10 ** (e - 1)) * 10 ** (e - 1); };
export function oneIn(lg) {                                       // as in the "Move the seed" step, but two significant figures below a million
  const n = -lg;
  if (n < 6) return `1 part in ${sig2(10 ** n).toLocaleString('en-US')}`;
  const e = Math.floor(n), m = Math.round(10 ** (n - e));
  return m >= 10 ? `1 part in 10<sup>${e + 1}</sup>` : `1 part in ${m} × 10<sup>${e}</sup>`;
}
export function energyText(W, T = 1) {                            // energy relative to the starting energy, two significant figures
  if (T === 0) return 'equal to its starting energy';
  if (W >= 0.95 && W < 1.05) return 'about equal to its starting energy';
  if (W >= 1.05) {
    if (W < 10) return `<strong>${W.toFixed(1)} times</strong> its starting energy`;
    if (W < 1e6) return `<strong>${sig2(W).toLocaleString('en-US')} times</strong> its starting energy`;
    const e = Math.floor(Math.log10(W)), m = W / 10 ** e;
    return `<strong>${m.toFixed(1)} × 10<sup>${e}</sup> times</strong> its starting energy`;
  }
  if (W >= 0.01) return `<strong>${Math.round(100 * W)}%</strong> of its starting energy`;
  const N = 1 / W;
  if (N < 1e6) return `<strong>1 part in ${sig2(N).toLocaleString('en-US')}</strong> of its starting energy`;
  const e = Math.floor(Math.log10(N)), m = N / 10 ** e;
  return `<strong>1 part in ${m.toFixed(1)} × 10<sup>${e}</sup></strong> of its starting energy`;
}
export function shareText(s) {
  if (!s.steady) return 'Share that ends up in the growing pattern: shown once the growth is steady.';
  // "never falls this low": the lowest energy of the run stays above the share for every seed that gets this sentence
  if (s.x0 >= X_FORMULA) return `Share that ends up in the growing pattern: about <strong>${oneIn(s.log10F)}</strong> (the model’s late-time formula). The energy never falls this low, because the survivors are already growing while the rest is erased.`;
  // below x0 = 3 the page uses words, as in the "Move the seed" step; which sentence applies is read from this run
  return s.Wmin >= 1 - 1e-9
    ? 'Nothing is lost. Stretching beats resistance from the start, so the dynamo amplifies the seed right away.'
    : 'Its energy dips for a few stretching times while resistance trims the smallest structures, then it grows.';
}

// Wires the step's block of HTML (ids ls-*) to a view, and returns the view's controls (also kept on the block as `lsView`).
// The view plays once when it is first scrolled into view and stops its animation loop while it is off screen. With reduced
// motion it shows the end state and moves only when Play is pressed.
export function mountLandscape(root, { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  const $ = (id) => root.querySelector(`#${id}`);
  const canvas = $('ls-main'), chart = $('ls-chart'), slider = $('ls-x0'), out = $('ls-x0out');
  const playB = $('ls-play'), restartB = $('ls-restart'), endB = $('ls-end');
  const rTime = $('ls-time'), rEnergy = $('ls-energy'), rShare = $('ls-share'), status = $('ls-status');
  let announced = '', played = false;
  function onUpdate(s) {
    if (s.playing) played = true;
    playB.textContent = s.playing ? 'Pause' : (s.finished && played ? 'Play again' : 'Play'); playB.setAttribute('aria-pressed', String(s.playing));
    rTime.textContent = `After ${s.T < 1 ? s.T.toFixed(2) : s.T.toFixed(1)} stretching times`;
    rEnergy.innerHTML = `The seed’s energy is now ${energyText(s.W, s.T)}.`;
    rShare.innerHTML = shareText(s);
    // screen readers hear three moments only (start, steady growth, end), not every frame
    const key = s.finished ? 'end' : s.steady ? 'steady' : s.T === 0 ? 'start' : '';
    if (key && key !== announced) {
      announced = key;
      status.innerHTML = key === 'start' ? `Seed ${sizeText(s.x0)}. Ready to play.`
        : `${rTime.textContent}. ${rEnergy.innerHTML} ${rShare.innerHTML}${key === 'end' ? ' Run finished.' : ''}`;
    } else if (!key) announced = '';
  }
  slider.min = '0'; slider.max = String(SEEDS.length - 1); slider.step = '1'; slider.value = String(x0ToSlider(X0_DEFAULT));
  const view = createLandscape({ canvas, chart, reduceMotion, x0: sliderToX0(Number(slider.value)), onUpdate });
  function seedLabel() { const t = sizeText(sliderToX0(Number(slider.value))); out.textContent = t; slider.setAttribute('aria-valuetext', t); }
  slider.addEventListener('input', () => { played = false; seedLabel(); view.setSeed(sliderToX0(Number(slider.value))); });
  slider.addEventListener('change', () => { if (!reduceMotion) view.play(); });       // autoplay when the seed has been chosen
  playB.addEventListener('click', () => view.toggle());
  restartB.addEventListener('click', () => view.restart());
  endB.addEventListener('click', () => view.skipToEnd());
  seedLabel();
  [slider, playB, restartB, endB].forEach((el) => { el.disabled = false; });
  if ('IntersectionObserver' in window) {
    let auto = reduceMotion;                                       // autoplay once, when first scrolled into view
    new IntersectionObserver((ents) => {
      const e = ents[ents.length - 1]; view.setVisible(e.isIntersecting);          // off screen: the animation loop stops
      if (e.intersectionRatio >= 0.4 && !auto) { auto = true; view.play(); }
    }, { threshold: [0, 0.4] }).observe(canvas);
  }
  root.lsView = view; root.dataset.ready = '1';
  return view;
}
