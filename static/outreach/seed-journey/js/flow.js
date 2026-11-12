// Stretch, twist, fold: a closed magnetic loop carried by a random multi-scale flow. No DOM; runs in the browser and in Node.
//
// Physics (checked independently against a separate Monte Carlo calculation and the model's analytic rates):
// - Ideal induction (no resistance): a field line moves with the gas as a material line, and the field strength along it grows in
//   proportion to how much the line is stretched (Cauchy solution). For a thin flux tube of fixed flux, the magnetic energy is
//   proportional to the integral of |dx/ds|^2 over the initial arc length s.
// - The flow: a sum of "eddy bands" b = 0..3 with wavenumbers k_b = 2^b in a 2*pi-periodic box. Each band is one incompressible
//   Fourier shear u = U_b e sin(k_b n.x + phi), with e perpendicular to n (so div u = 0), random orientation and phase, held
//   for the band's lifetime tau_b and then renewed (a "renovating" random flow).
//   Kolmogorov scaling sets the band speeds and lifetimes: U_b ~ k_b^{-1/3}, tau_b = S0 / (k_b U_b) ~ k_b^{-2/3}, so every band
//   gets the same strain S0 per lifetime and smaller eddies turn over (and stretch) faster.
// - A single steady Fourier shear is integrated exactly: n.x does not change along the flow, so x(t+h) = x + e U_b h sin(k_b n.x + phi).
//   Bands are applied one after another within each step h (operator splitting; each sub-map is exact and volume preserving).
// - For small S0 the flow is short-correlated, the regime of the Kazantsev-Kraichnan model. Then (white-noise limit; derived in
//   analytically) each band adds gammabar_b = S0^2 / (12 tau_b) to the Kazantsev rate gammabar, and the model predicts:
//   typical stretching (Lyapunov) rate 0.6 gammabar, line-length growth 0.8 gammabar, field-energy growth 2 gammabar.
//   The check script measures the finite-S0 values.

export const S0 = 0.5;                       // strain per eddy lifetime
export const BANDS = [1, 2, 4, 8].map((k) => ({ k, U: k ** (-1 / 3), tau: S0 / (k * k ** (-1 / 3)) }));
export const gammaBand = (b) => S0 * S0 / (12 * BANDS[b].tau);           // white-noise estimate of gammabar for band b
export const gammaBar = (nb) => { let g = 0; for (let b = 0; b < nb; b++) g += gammaBand(b); return g; };
export const GAMMA_ALL = gammaBar(BANDS.length);                        // time unit of the view: 1 / gammabar of all four bands

// mulberry32: small seeded generator, so a restart replays the same flow
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function randomShear(rand, band) {
  // n uniform on the sphere; e uniform on the circle perpendicular to n
  const z = 2 * rand() - 1, a = 2 * Math.PI * rand(), r = Math.sqrt(1 - z * z);
  const n = [r * Math.cos(a), r * Math.sin(a), z];
  const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let p = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
  const pl = Math.hypot(p[0], p[1], p[2]); p = p.map((v) => v / pl);
  const q = [n[1] * p[2] - n[2] * p[1], n[2] * p[0] - n[0] * p[2], n[0] * p[1] - n[1] * p[0]];
  const c = 2 * Math.PI * rand(), cc = Math.cos(c), sc = Math.sin(c);
  const e = [cc * p[0] + sc * q[0], cc * p[1] + sc * q[1], cc * p[2] + sc * q[2]];
  return { kn: n.map((v) => v * band.k), e, U: band.U, phi: 2 * Math.PI * rand(), left: band.tau };
}

// A closed loop of radius R in the plane z = pi, centred in the box.
export function createLoop({ seed = 7, nbands = 4, R = 1.2, n0 = 480, cap = 160000, dmax = 0.035 } = {}) {
  const rand = rng(seed);
  let X = new Float64Array(cap), Y = new Float64Array(cap), Z = new Float64Array(cap), Sm = new Float64Array(cap);
  let X2 = new Float64Array(cap), Y2 = new Float64Array(cap), Z2 = new Float64Array(cap), S2 = new Float64Array(cap);
  let N = n0;
  const L0 = 2 * Math.PI * R;
  for (let i = 0; i < N; i++) {
    const th = 2 * Math.PI * i / N; X[i] = Math.PI + R * Math.cos(th); Y[i] = Math.PI + R * Math.sin(th); Z[i] = Math.PI; Sm[i] = L0 * i / N;
  }
  const shears = BANDS.map((b) => randomShear(rand, b));
  const st = { t: 0, nbands, full: false };

  function applyShear(sh, h) {
    const [kx, ky, kz] = sh.kn, [ex, ey, ez] = sh.e, a = sh.U * h, phi = sh.phi;
    for (let i = 0; i < N; i++) {
      const d = a * Math.sin(kx * X[i] + ky * Y[i] + kz * Z[i] + phi);
      X[i] += ex * d; Y[i] += ey * d; Z[i] += ez * d;
    }
  }
  function refine() {
    // insert midpoints in segments longer than dmax (closed loop; the material coordinate is interpolated too)
    let m = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      X2[m] = X[i]; Y2[m] = Y[i]; Z2[m] = Z[i]; S2[m] = Sm[i]; m++;
      const dx = X[j] - X[i], dy = Y[j] - Y[i], dz = Z[j] - Z[i];
      if (m + (N - i) >= cap) st.full = true;            // the remaining original points must still fit
      if (!st.full && dx * dx + dy * dy + dz * dz > dmax * dmax) {
        const sj = j === 0 ? Sm[0] + L0 : Sm[j];
        X2[m] = X[i] + 0.5 * dx; Y2[m] = Y[i] + 0.5 * dy; Z2[m] = Z[i] + 0.5 * dz; S2[m] = 0.5 * (Sm[i] + sj); m++;
      }
    }
    [X, X2] = [X2, X]; [Y, Y2] = [Y2, Y]; [Z, Z2] = [Z2, Z]; [Sm, S2] = [S2, Sm]; N = m;
  }
  // advance by time h (in flow units); every band keeps its shear for its lifetime, then a new random one is drawn
  function step(h) {
    for (let b = 0; b < BANDS.length; b++) {
      let rem = h;
      while (rem > 1e-15) {
        const sh = shears[b], dt = Math.min(rem, sh.left);
        if (b < st.nbands) applyShear(sh, dt);
        sh.left -= dt; rem -= dt;
        if (sh.left <= 1e-15) shears[b] = randomShear(rand, BANDS[b]);
      }
    }
    st.t += h;
    if (!st.full) refine();
  }
  // length relative to the start, and the flux-tube magnetic energy relative to the start
  function diagnostics() {
    let L = 0, E = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, dx = X[j] - X[i], dy = Y[j] - Y[i], dz = Z[j] - Z[i];
      const ds = (j === 0 ? Sm[0] + L0 : Sm[j]) - Sm[i], l2 = dx * dx + dy * dy + dz * dz;
      L += Math.sqrt(l2); E += l2 / ds;
    }
    return { length: L / L0, energy: E / L0 };
  }
  return {
    st, step, diagnostics,
    get N() { return N; }, get X() { return X; }, get Y() { return Y; }, get Z() { return Z; }, get S() { return Sm; }, L0,
    setBands(nb) { st.nbands = nb; },
  };
}
