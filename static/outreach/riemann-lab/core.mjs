// One-dimensional finite-volume teaching solver. No plotting or browser dependencies.
import { HIGH_METHODS, higherFace, reconstructionSpec, evaluatePolynomial } from './higher-order.mjs';
export const GAMMA = 1.4;
export const CFL = 0.35;
export const GRID_SIZES = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
export const NONLINEAR = Object.freeze({ epsilon: 1e-40, zPower: 2, tenoPower: 6, tenoCutoff: 1e-5 });
// Explicit Butcher tableaus. Flux integration uses the same final weights b.
export const TIME_METHODS = {
  euler: { name: 'Forward Euler', short: 'Euler', order: 1, a: [[]], b: [1], firstFactor: 1 },
  ssprk2: { name: 'SSPRK2', short: 'SSPRK2', order: 2, a: [[], [1]], b: [0.5, 0.5], firstFactor: 1 },
  ssprk3: { name: 'SSPRK3', short: 'SSPRK3', order: 3, a: [[], [1], [0.25, 0.25]], b: [1/6, 1/6, 2/3], firstFactor: 1 },
  rk4: { name: 'Classical RK4', short: 'RK4', order: 4, a: [[], [0.5], [0, 0.5], [0, 0, 1]], b: [1/6, 1/3, 1/3, 1/6], firstFactor: 0.5 },
};
export const METHODS = {
  pcm: { name: 'Piecewise constant', short: 'Constant', stencil: 0 },
  minmod: { name: 'PLM · minmod', short: 'PLM minmod', stencil: 1 },
  mc: { name: 'PLM · MC limiter', short: 'PLM MC', stencil: 1 },
  ppm: { name: 'PPM · monotone', short: 'PPM', stencil: 2 },
  wenoz: { name: 'WENO-Z5 · p = 2', short: 'WENO-Z5', stencil: 2, faceBased: true },
  teno5: { name: 'TENO5 · fixed cutoff', short: 'TENO5', stencil: 2, faceBased: true },
  ...HIGH_METHODS,
};
// end is the finite audit horizon, not a limit on interactive evolution.
export const PROBLEMS = {
  gaussian: { name: 'Smooth pulse', equation: 'advection', end: 1, periodic: true },
  sine: { name: 'Sine wave', equation: 'advection', end: 1, periodic: true },
  square: { name: 'Square pulse', equation: 'advection', end: 1, periodic: true },
  sod: { name: 'Sod shock tube', equation: 'euler', end: 0.2, periodic: false,
    left: [1, 0, 1], right: [0.125, 0, 0.1] },
  lax: { name: 'Lax shock tube', equation: 'euler', end: 0.14, periodic: false,
    left: [0.445, 0.698, 3.528], right: [0.5, 0, 0.571] },
};
const wrap = x => ((x % 1) + 1) % 1;
const minmod = (...v) => v.every(x => x > 0) ? Math.min(...v)
  : v.every(x => x < 0) ? Math.max(...v) : 0;
const clamp = (v, a, b) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), v));
const mapIndex = (i, n, periodic) => periodic ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));

export function primitiveToConserved(q) {
  const [rho, u, p] = q;
  return [rho, rho * u, p / (GAMMA - 1) + 0.5 * rho * u * u];
}
export function conservedToPrimitive(U) {
  const rho = U[0], u = U[1] / rho;
  return [rho, u, (GAMMA - 1) * (U[2] - 0.5 * U[1] * u)];
}
export function primitiveFields(U, n, nv) {
  const q = new Float64Array(U.length);
  for (let i = 0; i < n; i++) {
    if (nv === 1) q[i] = U[i];
    else q.set(conservedToPrimitive(U.subarray(i * 3, i * 3 + 3)), i * 3);
  }
  return q;
}

// All five inputs are cell averages, ordered toward the target right face.
// Every candidate quadratic has mean v[2] on the donor cell, z ∈ [-1/2,1/2].
export function nonlinearFace(v, method, dx = 1) {
  if (!METHODS[method]?.faceBased) throw new Error('A face-based method is required');
  if (HIGH_METHODS[method]) return higherFace(v, method, dx);
  const [a, b, q, d, e] = v;
  const d0 = b - a, d1 = q - b, d2 = d - q, d3 = e - d;
  const slopes = [(3 * d1 - d0) / 2, (d1 + d2) / 2, (3 * d2 - d3) / 2];
  const curves = [(d1 - d0) / 2, (d2 - d1) / 2, (d3 - d2) / 2];
  const candidates = slopes.map((s, k) => q + 0.5 * s + curves[k] / 6);
  const beta = [13 / 12 * (d1 - d0) ** 2 + 0.25 * (3 * d1 - d0) ** 2,
    13 / 12 * (d2 - d1) ** 2 + 0.25 * (d1 + d2) ** 2,
    13 / 12 * (d3 - d2) ** 2 + 0.25 * (3 * d2 - d3) ** 2];
  const tau = Math.abs(beta[0] - beta[2]), optimal = [0.1, 0.6, 0.3];
  let weights, chi = null, keep = null;
  if (method === 'wenoz') {
    const alpha = optimal.map((w, k) => w * (1 + (tau / (beta[k] + NONLINEAR.epsilon)) ** NONLINEAR.zPower));
    const sum = alpha.reduce((s, v) => s + v, 0);
    weights = alpha.map(w => w / sum);
  } else {
    // Logarithms avoid overflowing gamma; their normalized ratios are unchanged.
    const logs = beta.map(b => NONLINEAR.tenoPower * Math.log1p(tau / (b + NONLINEAR.epsilon)));
    const max = Math.max(...logs), gamma = logs.map(v => Math.exp(v - max));
    const sum = gamma.reduce((s, v) => s + v, 0);
    chi = gamma.map(v => v / sum);
    keep = chi.map(v => v >= NONLINEAR.tenoCutoff ? 1 : 0);
    const norm = optimal.reduce((s, w, k) => s + w * keep[k], 0);
    weights = optimal.map((w, k) => w * keep[k] / norm);
  }
  const weighted = a => a.reduce((s, v, k) => s + weights[k] * v, 0);
  return { value: weighted(candidates), mean: q, slope: weighted(slopes), curve: weighted(curves),
    candidates, beta, tau, weights, optimal, chi, keep, slopes, curves };
}

export function facePolynomial(q, n, nv, method, cell, side = 'right', component = 0, periodic = true) {
  const direction = side === 'right' ? 1 : -1;
  const offsets = HIGH_METHODS[method] ? reconstructionSpec(method).offsets : [-2,-1,0,1,2];
  const indices = offsets.map(offset => mapIndex(cell + direction * offset, n, periodic));
  const data = nonlinearFace(indices.map(i => q[i * nv + component]), method, 1/n);
  return { ...data, ...(data.slope === undefined ? {} : { slope: direction * data.slope }), direction, cell, side, indices };
}

export function faceProfileValue(polynomial, s) {
  const z = s - 0.5;
  if (polynomial.coefficients) return evaluatePolynomial(polynomial.coefficients, polynomial.direction*z);
  return polynomial.mean + polynomial.slope * z + polynomial.curve * (z * z - 1 / 12);
}

// Coordinates are relative to the donor cell, without wrapping physical positions.
// Actual sample indices wrap periodically or clamp into the outflow ghost state.
export function faceStencil(q, n, nv, method, cell, side, component = 0, periodic = true) {
  const direction = side === 'right' ? 1 : -1, radius = METHODS[method].stencil;
  const offsets = HIGH_METHODS[method] ? reconstructionSpec(method).offsets : Array.from({ length: 2 * radius + 1 }, (_, k) => k - radius);
  const cells = offsets.map(offset => cell + direction * offset);
  const indices = cells.map(i => mapIndex(i, n, periodic));
  const values = indices.map(i => q[i * nv + component]);
  const positionsList = HIGH_METHODS[method] ? reconstructionSpec(method).candidates.map(sub=>sub.map(o=>offsets.indexOf(o))) : [[0,1,2], [1,2,3], [2,3,4]];
  const candidates = METHODS[method].faceBased ? positionsList.map(positions => ({
    cells: positions.map(k => cells[k]), indices: positions.map(k => indices[k]),
    offsets: positions.map(k => offsets[k]),
  })) : [];
  return { cell, side, direction, cells, indices, values, candidates,
    ...(METHODS[method].faceBased ? { polynomial: facePolynomial(q, n, nv, method, cell, side, component, periodic) } : {}) };
}

export function candidateProfileValue(polynomial, k, orientedZ) {
  if (polynomial.candidateCoefficients) return evaluatePolynomial(polynomial.candidateCoefficients[k], orientedZ);
  return polynomial.mean + polynomial.slopes[k] * orientedZ + polynomial.curves[k] * (orientedZ * orientedZ - 1 / 12);
}

// Unique degree-four polynomial matching all five averages. This is an optional
// unlimited reference, not the WENO/TENO nonlinear reconstruction.
export function quarticFromAverages(values) {
  const [a,b,c,d,e] = values;
  return [3*a/640 - 29*b/480 + 1067*c/960 - 29*d/480 + 3*e/640,
    5*a/48 - 17*b/24 + 17*d/24 - 5*e/48,
    -a/16 + 3*b/4 - 11*c/8 + 3*d/4 - e/16,
    -a/12 + b/6 - d/6 + e/12,
    a/24 - b/6 + c/4 - d/6 + e/24];
}
export const polynomialValue = (coefficients, z) => coefficients.reduceRight((s, a) => s * z + a, 0);

// Cell-edge values from cell data. For Euler, reconstruct primitive variables.
// Each cell retains its own two edges after monotonicity constraints.
export function reconstruct(q, n, nv, method, periodic) {
  if (!METHODS[method]) throw new Error('Unknown reconstruction');
  const left = new Float64Array(n * nv), right = new Float64Array(n * nv);
  const at = (i, k) => q[mapIndex(i, n, periodic) * nv + k];
  for (let i = 0; i < n; i++) for (let k = 0; k < nv; k++) {
    const v = at(i, k), prev = at(i - 1, k), next = at(i + 1, k);
    let l = v, r = v;
    if (method === 'minmod' || method === 'mc') {
      const slope = method === 'minmod' ? minmod(v - prev, next - v)
        : minmod(2 * (v - prev), 0.5 * (next - prev), 2 * (next - v));
      l -= 0.5 * slope; r += 0.5 * slope;
    } else if (METHODS[method].faceBased) {
      const p = facePolynomial(q, n, nv, method, i, 'right', k, periodic);
      r = p.value;
      l = METHODS[method].cellPolynomial ? faceProfileValue(p, 0) : facePolynomial(q, n, nv, method, i, 'left', k, periodic).value;
    } else if (method === 'ppm') {
      l = clamp((7 * (prev + v) - at(i - 2, k) - next) / 12, prev, v);
      r = clamp((7 * (v + next) - prev - at(i + 2, k)) / 12, v, next);
      if ((r - v) * (v - l) <= 0) l = r = v;
      else {
        const d = r - l, q6 = 6 * v - 3 * (l + r);
        if (d * q6 > d * d) l = 3 * v - 2 * r;
        else if (d * q6 < -d * d) r = 3 * v - 2 * l;
      }
    }
    left[i * nv + k] = l; right[i * nv + k] = r;
  }
  return { left, right };
}

// s runs from 0 (left edge) to 1 (right edge). The polynomial averages to q.
export function profileValue(q, l, r, s, method) {
  if (METHODS[method]?.faceBased) throw new Error('Use faceProfileValue for a face-specific reconstruction');
  if (method === 'pcm') return q;
  if (method !== 'ppm') return l + s * (r - l);
  return l + s * (r - l + (6 * q - 3 * (l + r)) * (1 - s));
}

export function physicalFlux(q) {
  const U = primitiveToConserved(q), [rho, u, p] = q;
  return [rho * u, rho * u * u + p, (U[2] + p) * u];
}

// HLLE with acoustic bounds from both endpoint states and the Roe average.
export function hlle(l, r) {
  const cl = Math.sqrt(GAMMA * l[2] / l[0]), cr = Math.sqrt(GAMMA * r[2] / r[0]);
  const ul = primitiveToConserved(l), ur = primitiveToConserved(r);
  const wl = Math.sqrt(l[0]), wr = Math.sqrt(r[0]);
  const uRoe = (wl * l[1] + wr * r[1]) / (wl + wr);
  const hRoe = (wl * (ul[2] + l[2]) / l[0] + wr * (ur[2] + r[2]) / r[0]) / (wl + wr);
  const cRoe = Math.sqrt((GAMMA - 1) * (hRoe - 0.5 * uRoe * uRoe));
  const sl = Math.min(l[1] - cl, r[1] - cr, uRoe - cRoe);
  const sr = Math.max(l[1] + cl, r[1] + cr, uRoe + cRoe);
  const fl = physicalFlux(l), fr = physicalFlux(r);
  if (sl >= 0) return fl;
  if (sr <= 0) return fr;
  return fl.map((f, k) => (sr * f - sl * fr[k] + sl * sr * (ur[k] - ul[k])) / (sr - sl));
}

export class ReconstructionError extends Error {
  constructor(face) {
    super(`Nonpositive density or pressure at reconstructed face ${face}. Change reconstruction or time integrator and restart.`);
    this.name = 'ReconstructionError';
  }
}
// Donor-cell local Lax–Friedrichs (Rusanov), matching AthenaK's hydro fallback.
export function llf(l, r) {
  const ul = primitiveToConserved(l), ur = primitiveToConserved(r);
  const fl = physicalFlux(l), fr = physicalFlux(r);
  const a = Math.max(Math.abs(l[1]) + Math.sqrt(GAMMA*l[2]/l[0]),
    Math.abs(r[1]) + Math.sqrt(GAMMA*r[2]/r[0]));
  return fl.map((v,k) => 0.5*(v + fr[k] - a*(ur[k]-ul[k])));
}
function markFace(mask, j, n, periodic, reason) {
  const old = mask[j]; mask[j] |= reason;
  if (periodic && (j === 0 || j === n)) mask[j === 0 ? n : 0] |= reason;
  return old === 0;
}
function rhs(U, cfg, method, corrected = null) {
  const { n, nv, speed, problem } = cfg, periodic = PROBLEMS[problem].periodic;
  const q = primitiveFields(U, n, nv), { left, right } = reconstruct(q, n, nv, method, periodic);
  const flux = new Float64Array((n + 1) * nv);
  for (let j = 0; j <= n; j++) {
    // Outflow ghost cells are constant extensions of the boundary cell average.
    const l = j === 0 && !periodic ? q.slice(0, nv)
      : right.slice(mapIndex(j - 1, n, periodic) * nv, (mapIndex(j - 1, n, periodic) + 1) * nv);
    const r = j === n && !periodic ? q.slice((n - 1) * nv, n * nv)
      : left.slice(mapIndex(j, n, periodic) * nv, (mapIndex(j, n, periodic) + 1) * nv);
    const invalid = nv === 3 && (![...l,...r].every(Number.isFinite) || l[0] <= 0 || r[0] <= 0 || l[2] <= 0 || r[2] <= 0);
    if (invalid && !corrected) throw new ReconstructionError(j);
    // A separate face guard avoids passing nonphysical reconstructed states to HLLE.
    // Keep the original reconstruction in the trace so the reason remains inspectable.
    if (invalid) markFace(corrected, j, n, periodic, 1);
    const f = corrected?.[j] ? llf(
      q.subarray(mapIndex(j-1,n,periodic)*nv,(mapIndex(j-1,n,periodic)+1)*nv),
      q.subarray(mapIndex(j,n,periodic)*nv,(mapIndex(j,n,periodic)+1)*nv))
      : nv === 1 ? [speed * (speed >= 0 ? l[0] : r[0])] : hlle(l, r);
    flux.set(f, j * nv);
  }
  const d = new Float64Array(U.length), boundary = new Float64Array(nv);
  for (let i = 0; i < n; i++) for (let k = 0; k < nv; k++)
    d[i * nv + k] = -n * (flux[(i + 1) * nv + k] - flux[i * nv + k]);
  for (let k = 0; k < nv; k++) boundary[k] = flux[k] - flux[n * nv + k];
  return { d, boundary, q, left, right, flux, corrected };
}

// Read the actual spatial operator and first intermediate state used by RK.
// Forward Euler returns its full update; RK4 returns the first midpoint state.
export function inspectSubstep(U, cfg, method, dt) {
  if (cfg.fofc && cfg.nv === 3) {
    const result = correctedRKStep(U, cfg, method, dt);
    if (!result) throw new Error('FOFC preview needs a smaller time step.');
    return result.firstTrace;
  }
  const operator = rhs(U, cfg, method);
  const stageDt = dt * TIME_METHODS[cfg.integrator ?? 'ssprk3'].firstFactor;
  return { ...operator, dt, stageDt, first: U.map((v, i) => v + stageDt * operator.d[i]) };
}

export function admissible(U, nv) {
  if (!U.every(Number.isFinite)) return false;
  if (nv === 1) return true;
  for (let i = 0; i < U.length; i += 3) {
    const q = conservedToPrimitive(U.subarray(i, i + 3));
    if (!(q[0] > 0 && q[2] > 0)) return false;
  }
  return true;
}
export function stableDt(U, cfg) {
  const cfl = cfg.cfl ?? CFL;
  if (cfg.nv === 1) return cfl / (cfg.n * Math.max(Math.abs(cfg.speed), 1e-12));
  const q = primitiveFields(U, cfg.n, 3);
  let max = 0;
  for (let i = 0; i < q.length; i += 3)
    max = Math.max(max, Math.abs(q[i + 1]) + Math.sqrt(GAMMA * q[i + 2] / q[i]));
  return cfl / (cfg.n * max);
}
export function rkStep(U, cfg, method, dt) {
  if (cfg.fofc && cfg.nv === 3) return correctedRKStep(U, cfg, method, dt);
  const tableau = TIME_METHODS[cfg.integrator ?? 'ssprk3'];
  const stages = [];
  for (const row of tableau.a) {
    const y = U.map((v, j) => v + dt * row.reduce((sum, a, k) => sum + a * stages[k].d[j], 0));
    if (!admissible(y, cfg.nv)) return null;
    try { stages.push(rhs(y, cfg, method)); }
    catch (error) {
      // Smaller dt can repair an intermediate stage, but cannot change the
      // reconstruction of the initial state of this step.
      if (error instanceof ReconstructionError && stages.length > 0) return null;
      throw error;
    }
  }
  const next = U.map((v, j) => v + dt * tableau.b.reduce((sum, b, k) => sum + b * stages[k].d[j], 0));
  if (!admissible(next, cfg.nv)) return null;
  const boundary = Float64Array.from({ length: cfg.nv }, (_, j) =>
    dt * tableau.b.reduce((sum, b, k) => sum + b * stages[k].boundary[j], 0));
  return { U: next, boundary };
}

// Predict each actual Butcher stage and the final update. If a trial cell is bad,
// replace BOTH shared faces in every flux evaluation contributing to that trial,
// then replay from U. Replaying recomputes downstream states/fluxes consistently.
// This extends AthenaK's stage-local correction to all four tableaus in this lab.
// Masks only grow within an attempt; exhausted attempts use the existing dt retry.
function correctedRKStep(U, cfg, method, dt) {
  if (!admissible(U, cfg.nv)) return null;
  const { n, nv, problem } = cfg, periodic = PROBLEMS[problem].periodic;
  const tableau = TIME_METHODS[cfg.integrator ?? 'ssprk3'];
  const masks = tableau.a.map(() => new Uint8Array(n+1));
  const troubled = new Set();
  const flag = (trial, weights) => {
    let bad = false, added = false;
    for (let i=0;i<n;i++) if (!admissible(trial.subarray(i*nv,(i+1)*nv),nv)) {
      bad = true; troubled.add(i);
      weights.forEach((w,k) => { if (w !== 0) for (const j of [i,i+1])
        added = markFace(masks[k],j,n,periodic,2) || added;
      });
    }
    return { bad, added };
  };
  for (let pass=0;pass<8;pass++) {
    const stages = [];
    const combine = weights => U.map((v,j) => v + dt*weights.reduce((sum,a,k) => sum+a*stages[k].d[j],0));
    let replay = false;
    for (let k=0;k<tableau.a.length;k++) {
      const row = tableau.a[k], y = combine(row), check = flag(y,row);
      if (check.bad) { if (!check.added) return null; replay=true; break; }
      stages.push(rhs(y,cfg,method,masks[k]));
    }
    if (replay) continue;
    const next = combine(tableau.b), check = flag(next,tableau.b);
    if (check.bad) { if (!check.added) return null; continue; }
    const boundary = Float64Array.from({length:nv},(_,j) => dt*tableau.b.reduce((sum,b,k)=>sum+b*stages[k].boundary[j],0));
    const faces = new Uint8Array(n+1);
    let faceStages = 0, faceGuards = 0;
    masks.forEach(mask => { for (let j=0;j<=n;j++) {
      faces[j] |= mask[j];
      if (periodic && j===n) continue;
      if (mask[j]) faceStages++;
      if (mask[j]&1) faceGuards++;
    }});
    const stageDt = dt*tableau.firstFactor;
    return { U:next, boundary,
      correction:{faces,faceStages,faceGuards,cells:[...troubled],passes:pass+1},
      firstTrace:{...stages[0],dt,stageDt,first:U.map((v,j)=>v+stageDt*stages[0].d[j])} };
  }
  return null;
}

export function initialScalar(problem, x) {
  x = wrap(x);
  if (problem === 'square') return x >= 0.2 && x < 0.45 ? 1 : 0.2;
  if (problem === 'sine') return 0.55 + 0.35 * Math.sin(2 * Math.PI * (x - 0.15));
  let q = 0.2;
  for (let j = -1; j <= 1; j++) q += 0.8 * Math.exp(-(((x - 0.3 + j) / 0.075) ** 2));
  return q;
}
const gx = [-0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498,
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const gw = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362,
  0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
function integrate(fn, a, b, nv) {
  const out = new Float64Array(nv), h = (b - a) / 2, m = (a + b) / 2;
  for (let j = 0; j < 8; j++) {
    const y = fn(m + h * gx[j]);
    for (let k = 0; k < nv; k++) out[k] += h * gw[j] * y[k];
  }
  return out;
}

const exactCache = new Map();
export function exactEuler(problem) {
  if (exactCache.has(problem)) return exactCache.get(problem);
  const { left: l, right: r } = PROBLEMS[problem], g = GAMMA, gm = (g - 1) / (g + 1);
  const cl = Math.sqrt(g * l[2] / l[0]), cr = Math.sqrt(g * r[2] / r[0]);
  const f = (p, q, c) => p > q[2]
    ? (p - q[2]) * Math.sqrt(2 / ((g + 1) * q[0]) / (p + gm * q[2]))
    : 2 * c / (g - 1) * ((p / q[2]) ** ((g - 1) / (2 * g)) - 1);
  const residual = p => f(p, l, cl) + f(p, r, cr) + r[1] - l[1];
  let lo = 0, hi = Math.max(l[2], r[2]);
  while (residual(hi) < 0) hi *= 2;
  for (let j = 0; j < 80; j++) {
    const mid = (lo + hi) / 2;
    if (residual(mid) > 0) hi = mid; else lo = mid;
  }
  const p = (lo + hi) / 2, u = (l[1] + r[1] + f(p, r, cr) - f(p, l, cl)) / 2;
  const density = q => p > q[2] ? q[0] * (p / q[2] + gm) / (gm * p / q[2] + 1)
    : q[0] * (p / q[2]) ** (1 / g);
  const rl = density(l), rr = density(r);
  const csl = cl * (p / l[2]) ** ((g - 1) / (2 * g));
  const csr = cr * (p / r[2]) ** ((g - 1) / (2 * g));
  const sl = l[1] - cl * Math.sqrt((g + 1) / (2 * g) * p / l[2] + (g - 1) / (2 * g));
  const sr = r[1] + cr * Math.sqrt((g + 1) / (2 * g) * p / r[2] + (g - 1) / (2 * g));
  const speeds = [u, ...(p > l[2] ? [sl] : [l[1] - cl, u - csl]),
    ...(p > r[2] ? [sr] : [u + csr, r[1] + cr])].sort((a, b) => a - b);
  const sample = xi => {
    if (xi <= u) {
      if (p > l[2]) return xi < sl ? l : [rl, u, p];
      if (xi < l[1] - cl) return l;
      if (xi > u - csl) return [rl, u, p];
      const v = 2 / (g + 1) * (cl + 0.5 * (g - 1) * l[1] + xi);
      const c = 2 / (g + 1) * (cl + 0.5 * (g - 1) * (l[1] - xi));
      return [l[0] * (c / cl) ** (2 / (g - 1)), v, l[2] * (c / cl) ** (2 * g / (g - 1))];
    }
    if (p > r[2]) return xi > sr ? r : [rr, u, p];
    if (xi > r[1] + cr) return r;
    if (xi < u + csr) return [rr, u, p];
    const v = 2 / (g + 1) * (-cr + 0.5 * (g - 1) * r[1] + xi);
    const c = 2 / (g + 1) * (cr + 0.5 * (g - 1) * (xi - r[1]));
    return [r[0] * (c / cr) ** (2 / (g - 1)), v, r[2] * (c / cr) ** (2 * g / (g - 1))];
  };
  const model = { p, u, speeds, sample };
  exactCache.set(problem, model);
  return model;
}
export function exactPoint(problem, x, time, displacement = time) {
  if (PROBLEMS[problem].equation === 'advection') return [initialScalar(problem, x - displacement)];
  if (time <= 0) return x < 0.5 ? PROBLEMS[problem].left : PROBLEMS[problem].right;
  return exactEuler(problem).sample((x - 0.5) / time);
}
export function exactReferenceAvailable(problem, time) {
  return PROBLEMS[problem].periodic || time <= 0.5 / Math.max(...exactEuler(problem).speeds.map(Math.abs));
}
export function exactValueRange(problem, time = 0) {
  if (PROBLEMS[problem].equation === 'advection') return { min: 0.2, max: problem === 'sine' ? 0.9 : 1 };
  if (time <= 0) return { min: Math.min(PROBLEMS[problem].left[0],PROBLEMS[problem].right[0]), max: Math.max(PROBLEMS[problem].left[0],PROBLEMS[problem].right[0]) };
  const model=exactEuler(problem),left=-0.5/time,right=0.5/time;
  const cuts=[left,...model.speeds.filter(s=>s>left&&s<right),right].sort((a,b)=>a-b);
  const points=[...cuts,...cuts.slice(1).map((v,i)=>(v+cuts[i])/2)];
  const values = points.map(xi => model.sample(xi)[0]);
  return { min: Math.min(...values), max: Math.max(...values) };
}
export function rangeExcess(U, nv, bounds) {
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < U.length; j += nv) { min = Math.min(min, U[j]); max = Math.max(max, U[j]); }
  return { min, max, overshoot: Math.max(0, max - bounds.max), undershoot: Math.max(0, bounds.min - min) };
}
export function exactAverages(problem, n, time = 0, displacement = 0) {
  const scalar = PROBLEMS[problem].equation === 'advection', nv = scalar ? 1 : 3;
  const out = new Float64Array(n * nv);
  let cuts = scalar ? [] : time > 0 ? exactEuler(problem).speeds.map(s => 0.5 + s * time) : [0.5];
  if (problem === 'square') cuts = [wrap(0.2 + displacement), wrap(0.45 + displacement)];
  cuts = cuts.filter(x => x > 0 && x < 1).sort((a, b) => a - b);
  const fn = x => {
    const q = exactPoint(problem, x, time, displacement);
    return scalar ? q : primitiveToConserved(q);
  };
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n, edges = [a, ...cuts.filter(x => x > a && x < b), b];
    for (let j = 0; j < edges.length - 1; j++) {
      const sum = integrate(fn, edges[j], edges[j + 1], nv);
      for (let k = 0; k < nv; k++) out[i * nv + k] += n * sum[k];
    }
  }
  return out;
}
export function totals(U, n, nv) {
  const out = new Float64Array(nv);
  for (let i = 0; i < n; i++) for (let k = 0; k < nv; k++) out[k] += U[i * nv + k] / n;
  return out;
}

// Shared, side-effect-free trial for evolution and the next-substep diagram.
// Both solves use the same accepted dt, including any positivity retries.
export function trialStep(states, cfg, methods, limit = Infinity) {
  let dt = Math.min(limit, ...states.map(u => stableDt(u,cfg)));
  if (!(dt > 1e-14)) return null;
  for (let retries=0;retries<12;retries++,dt*=0.5) {
    const results = states.map((u,i) => {
      try { return rkStep(u,cfg,methods[i],dt); }
      catch(error) {
        if(error instanceof ReconstructionError)
          error.message=`${i?'Comparison':'Main'} solve (${METHODS[methods[i]].short}): ${error.message}`;
        throw error;
      }
    });
    if (results.every(Boolean)) return {results,dt,retries};
  }
  throw new Error('A positive state could not be obtained. Restart the experiment.');
}

export class Experiment {
  constructor({ problem = 'gaussian', n = 128, methods = ['pcm', 'mc'], speed = 1, integrator = 'ssprk3', fofc = false } = {}) {
    if (!PROBLEMS[problem] || !GRID_SIZES.includes(n)) throw new Error('Invalid experiment');
    if (methods.length !== 2 || methods.some(m => !METHODS[m])) throw new Error('Invalid methods');
    if (PROBLEMS[problem].equation === 'euler' && methods.some(m=>METHODS[m].scalarOnly)) throw new Error('Unlimited 5 is an advection-only diagnostic.');
    if (!TIME_METHODS[integrator]) throw new Error('Invalid time integrator');
    this.cfg = { problem, n, nv: PROBLEMS[problem].equation === 'advection' ? 1 : 3, speed, integrator, fofc: !!fofc };
    this.methods = [...methods];
    this.cfg.cfl = methods.includes('mp5') ? 0.2 : CFL;
    const u = exactAverages(problem, n);
    this.states = [u, u.slice()];
    this.initial = totals(u, n, this.cfg.nv);
    this.boundaries = [new Float64Array(this.cfg.nv), new Float64Array(this.cfg.nv)];
    this.time = 0; this.displacement = 0; this.steps = 0; this.retries = 0;
    this.history = [];
    this.corrections = [0,1].map(() => ({total:0,last:null}));
  }
  setFOFC(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Invalid FOFC setting');
    this.cfg.fofc = enabled;
    this.history.push({time:this.time,text:`First-order flux correction → ${enabled?'on':'off'}`});
  }
  setMethod(run, method) {
    if (![0, 1].includes(run) || !METHODS[method]) throw new Error('Invalid method');
    if(this.cfg.nv===3 && METHODS[method].scalarOnly)throw new Error('Unlimited 5 is an advection-only diagnostic.');
    if (this.methods[run] === method) return;
    this.methods[run] = method;
    this.cfg.cfl = this.methods.includes('mp5') ? 0.2 : CFL;
    this.history.push({ time: this.time, text: `${run ? 'B' : 'A'} → ${METHODS[method].short}` });
  }
  setSpeed(speed) {
    if (!Number.isFinite(speed) || Math.abs(speed) > 2) throw new Error('Invalid speed');
    if (speed !== this.cfg.speed && this.cfg.nv === 1)
      this.history.push({ time: this.time, text: `a → ${speed.toFixed(2)}` });
    this.cfg.speed = speed;
  }
  setIntegrator(integrator) {
    if (!TIME_METHODS[integrator]) throw new Error('Invalid time integrator');
    if (integrator !== this.cfg.integrator)
      this.history.push({ time: this.time, text: `Time integration → ${TIME_METHODS[integrator].short}` });
    this.cfg.integrator = integrator;
  }
  fork() {
    this.states[1] = this.states[0].slice();
    this.boundaries[1] = this.boundaries[0].slice();
    this.corrections[1] = {total:this.corrections[0].total,last:this.corrections[0].last};
    this.history.push({ time: this.time, text: 'B copied the current state of A' });
  }
  step(limit = Infinity) {
    const candidate = trialStep(this.states, this.cfg, this.methods, limit);
    if (!candidate) return 0;
    const {results,dt,retries} = candidate;
    this.retries += retries;
    results.forEach((r, i) => {
      this.states[i] = r.U;
      this.corrections[i].last = r.correction ?? null;
      this.corrections[i].total += r.correction?.faceStages ?? 0;
      for (let k = 0; k < this.cfg.nv; k++) this.boundaries[i][k] += r.boundary[k];
    });
    this.time += dt;
    this.displacement += dt * this.cfg.speed;
    this.steps++;
    return dt;
  }
  diagnostics() {
    const { problem, n, nv } = this.cfg;
    const ref = exactReferenceAvailable(problem, this.time) ? exactAverages(problem, n, this.time, this.displacement) : null;
    return this.states.map((u, run) => {
      const sum = totals(u, n, nv);
      let l1 = 0;
      if (ref) for (let i = 0; i < n; i++) l1 += Math.abs(u[i * nv] - ref[i * nv]) / n;
      return { l1: ref ? l1 : null, balance: Math.abs(sum[0] - this.initial[0] - this.boundaries[run][0]) / this.initial[0] };
    });
  }
}
