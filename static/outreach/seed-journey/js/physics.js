// Closed-form results of the Kazantsev-Kraichnan model (independently reviewed), evaluated in the browser.
// Checked against high-precision SciPy reference values.

const G2 = 0.9064024770554771 ** 2 / Math.sqrt(2 * Math.PI);   // Gamma(5/4)^2 / sqrt(2 pi)

// log K0(x), Abramowitz & Stegun 9.8.1, 9.8.5 (x <= 2) and 9.8.6 (x > 2); relative error < 2e-7.
export function logK0(x) {
  if (x <= 2) {
    const t = (x / 3.75) ** 2;
    const I0 = 1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
    const y = x * x / 4;
    const k = -Math.log(x / 2) * I0 - 0.57721566 + y * (0.42278420 + y * (0.23069756 + y * (0.03488590 +
      y * (0.00262698 + y * (0.00010750 + y * 0.0000074)))));
    return Math.log(k);
  }
  const y = 2 / x;
  const p = 1.25331414 + y * (-0.07832358 + y * (0.02189568 + y * (-0.01062446 + y * (0.00587872 +
    y * (-0.00251540 + y * 0.00053208)))));
  return -x - 0.5 * Math.log(x) + Math.log(p);
}

// log of the projection weight w(x) = x^{-5/2} K0(x)
const logw = (x) => -2.5 * Math.log(x) + logK0(x);

// Narrow seed at x0 = k0/k_eta (exact Bessel form). Returns log10 F.
export function log10Fnarrow(x0) { return (Math.log(G2) + logw(x0)) / Math.LN10; }

// Recovery time: gammabar t_rec = -2 W_{-1}(-(5/2) F^{2/3}). Takes log10 F.
export function tRecovery(log10F) {
  const L = Math.log(2.5) + (2 / 3) * log10F * Math.LN10;   // ln(-a), a = -(5/2) F^{2/3}
  if (L > -1) return NaN;                                     // a < -1/e: no real branch
  // solve w + ln(-w) = L on the W_{-1} branch (w < -1)
  let w = L - Math.log(-L);
  for (let i = 0; i < 50; i++) {
    const g = w + Math.log(-w) - L, dg = 1 + 1 / w;
    const dw = g / dg; w -= dw;
    if (w > -1) w = -1 - 1e-12;
    if (Math.abs(dw) < 1e-13 * Math.abs(w)) break;
  }
  return -2 * w;
}
