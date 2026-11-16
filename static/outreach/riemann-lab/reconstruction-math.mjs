import { HIGH_METHODS } from './higher-order.mjs';
import { higherMarkup } from './higher-order-math.mjs';
import { METHODS, NONLINEAR, PROBLEMS, facePolynomial } from './core.mjs';
import { math, equation as eq, texNumber } from './typeset.mjs';

const t = String.raw, q = i => t`\bar q_{${i}}`;
const small = text => `<p class="math-note">${text}</p>`;
const number = v => v === 0 ? '0' : (Math.abs(v) < 1e-4 || Math.abs(v) > 1e4) ? v.toExponential(3) : Number(v.toPrecision(6)).toString();
let lastMethod = '';
const coords = () => small(`${math(t`\bar q_i`)} is a cell average. The donor-centered coordinate is ${math(t`z=(x-x_i)/\Delta x`)} and ${math(t`s=z+\tfrac12`)}. The donor cell spans ${math(t`-\tfrac12\le z\le\tfrac12`)}. Each candidate retains this mean.`);
const differences = () => eq(t`\Delta_-=${q('i')}-${q('i-1')},\qquad\Delta_+=${q('i+1')}-${q('i')}`);
const minmod = () => small(`${math(t`\operatorname{minmod}`)} returns the common sign times the smallest absolute argument when all arguments have that sign, and zero otherwise. The physical slope is ${math(t`\sigma_i/\Delta x`)}.`);

function classic(method) {
  if (method === 'pcm') return eq(t`P_i(z)=${q('i')}`) + small('The left and right face values are both the stored mean.');
  if (method === 'minmod' || method === 'mc') return eq(t`P_i(z)=${q('i')}+\sigma_i z`) + differences()
    + eq(method === 'minmod' ? t`\sigma_i=\operatorname{minmod}(\Delta_-,\Delta_+)` : t`\sigma_i=\operatorname{minmod}\!\left(2\Delta_-,\frac{\Delta_-+\Delta_+}{2},2\Delta_+\right)`)
    + eq(t`q_i^{\mathrm{left}}=${q('i')}-\frac{\sigma_i}{2},\qquad q_i^{\mathrm{right}}=${q('i')}+\frac{\sigma_i}{2}`) + minmod();
  return eq(t`P_i(s)=L_i+s\bigl[R_i-L_i+Q_{6,i}(1-s)\bigr]`)
    + eq(t`Q_{6,i}=6${q('i')}-3(L_i+R_i)`)
    + small('The preliminary face value is a fourth-order interpolation of cell averages, clipped between the two adjacent means:')
    + eq(t`E_{i+1/2}=\operatorname{clip}\!\left[\frac7{12}(${q('i')}+${q('i+1')})-\frac1{12}(${q('i-1')}+${q('i+2')})\right]`)
    + small(`The clipping interval runs from ${math(t`\min(${q('i')},${q('i+1')})`)} to ${math(t`\max(${q('i')},${q('i+1')})`)}. Initially ${math(t`L_i=E_{i-1/2}`)} and ${math(t`R_i=E_{i+1/2}`)}. Monotonicity then requires`)
    + eq(t`(R_i-${q('i')})(${q('i')}-L_i)\le0\quad\Longrightarrow\quad L_i=R_i=${q('i')}`)
    + small(`Otherwise, ${math(t`\Delta_i=R_i-L_i`)} and ${math(t`Q_{6,i}`)} are evaluated before either adjustment:`)
    + eq(t`\begin{aligned}\Delta_i Q_{6,i}>\Delta_i^2&\Longrightarrow L_i=3${q('i')}-2R_i,\\\Delta_i Q_{6,i}<-\Delta_i^2&\Longrightarrow R_i=3${q('i')}-2L_i.\end{aligned}`)
    + small(`The polynomial uses the recomputed ${math(t`Q_{6,i}`)} after limiting. No contact steepening or shock flattening is used.`);
}
function candidates() {
  return small('Each three-cell stencil determines a quadratic whose integrals match its three input means:')
    + eq(t`S_0=\{i-2,i-1,i\},\quad S_1=\{i-1,i,i+1\},\quad S_2=\{i,i+1,i+2\}`)
    + eq(t`\begin{aligned}v_0&=\frac{2${q('i-2')}-7${q('i-1')}+11${q('i')}}6,\\v_1&=\frac{-${q('i-1')}+5${q('i')}+2${q('i+1')}}6,\\v_2&=\frac{2${q('i')}+5${q('i+1')}-${q('i+2')}}6.\end{aligned}`)
    + eq(t`q_i^{\mathrm{right}}=\sum_{k=0}^2\omega_k v_k,\qquad(d_0,d_1,d_2)=\left(\frac1{10},\frac6{10},\frac3{10}\right)`)
    + small(`These formulas target the donor cell’s right face. The left-face calculation reverses the five inputs about the donor. At face ${math('j')}, ${math('q_L')} comes from cell ${math('j-1')} and ${math('q_R')} from cell ${math('j')}, with independent weights.`);
}
function indicators() {
  return '<details class="math-more"><summary>Smoothness indicators &amp; full candidate polynomials</summary>'
    + eq(t`\beta_0=\frac{13}{12}(${q('i-2')}-2${q('i-1')}+${q('i')})^2+\frac14(${q('i-2')}-4${q('i-1')}+3${q('i')})^2`)
    + eq(t`\beta_1=\frac{13}{12}(${q('i-1')}-2${q('i')}+${q('i+1')})^2+\frac14(${q('i-1')}-${q('i+1')})^2`)
    + eq(t`\beta_2=\frac{13}{12}(${q('i')}-2${q('i+1')}+${q('i+2')})^2+\frac14(3${q('i')}-4${q('i+1')}+${q('i+2')})^2`)
    + small('The plotted quadratic uses a basis whose linear and quadratic terms have zero mean on the donor cell:')
    + eq(t`P_k(z)=${q('i')}+b_kz+c_k\left(z^2-\frac1{12}\right)`)
    + eq(t`\begin{aligned}b_0&=\frac{3${q('i')}-4${q('i-1')}+${q('i-2')}}2,&c_0&=\frac{${q('i')}-2${q('i-1')}+${q('i-2')}}2,\\b_1&=\frac{${q('i+1')}-${q('i-1')}}2,&c_1&=\frac{${q('i-1')}-2${q('i')}+${q('i+1')}}2,\\b_2&=\frac{-3${q('i')}+4${q('i+1')}-${q('i+2')}}2,&c_2&=\frac{${q('i')}-2${q('i+1')}+${q('i+2')}}2.\end{aligned}`)
    + eq(t`v_k=P_k\!\left(\frac12\right),\qquad q_i^{\mathrm{right}}=\sum_{k=0}^2\omega_k P_k\!\left(\frac12\right)`)
    + small('The plots show each candidate across its full three-cell support. The blue diamond is the weighted face value. Fifth-order accuracy applies at that face. A weighted quadratic is not a fifth-order interpolant throughout the stencil. The optional gray quartic matches all five means and is an unlimited reference only.')
    + '</details>';
}
function nonlinear(method) {
  const header = candidates() + eq(t`\tau_5=|\beta_0-\beta_2|,\qquad\varepsilon=10^{${Math.log10(NONLINEAR.epsilon)}}`);
  if (method === 'wenoz') return header
    + eq(t`\alpha_k=d_k\left[1+\left(\frac{\tau_5}{\beta_k+\varepsilon}\right)^{${NONLINEAR.zPower}}\right],\qquad\omega_k=\frac{\alpha_k}{\sum_{m=0}^2\alpha_m}`)
    + small('WENO-Z continuously adjusts all three weights, independently at each face.')
    + indicators() + small('The weighting form is given in §2.2, Eq. (16), of <a href="https://www.mdpi.com/2227-7390/11/21/4449#sec2dot2-mathematics-11-04449">Han &amp; Li (2023)</a>. Here it acts on finite-volume cell-average quadratics.');
  return header + eq(t`\gamma_k=\left(1+\frac{\tau_5}{\beta_k+\varepsilon}\right)^{${NONLINEAR.tenoPower}},\qquad\chi_k=\frac{\gamma_k}{\sum_{m=0}^2\gamma_m}`)
    + eq(t`\delta_k=\begin{cases}0,&\chi_k<C_T,\\1,&\chi_k\ge C_T,\end{cases}\qquad C_T=10^{${Math.log10(NONLINEAR.tenoCutoff)}}`)
    + eq(t`\omega_k=\frac{d_k\delta_k}{\sum_{m=0}^2d_m\delta_m}`)
    + small('TENO5 rejects candidates that cross its smoothness cutoff, then renormalizes the retained optimal weights. This is the fixed-cutoff variant.')
    + indicators() + small('See <a href="https://mediatum.ub.tum.de/doc/1370877/996147.pdf#page=72">Fu, Hu &amp; Adams (2016), §3.1–3.2 and Table 5</a>, archived in Fu’s thesis. Here the stencils are ordered left, central, right. The paper’s central, right, left weights are reordered accordingly.');
}
export function reconstructionMarkup(method, nv) {
  return coords() + (nv === 1 ? '' : small('For Euler, these formulas act componentwise on primitive values derived from conserved means. The plot shows density. This conversion does not imply the same formal order for the full Euler discretization.'))
    + (HIGH_METHODS[method] ? higherMarkup(method) : METHODS[method].faceBased ? nonlinear(method) : classic(method)) + '<div id="math-live" class="math-live"></div>';
}
function weightTable(data, label, method) {
  const teno = method.startsWith('teno');
  return `<h4>${label}</h4><p class="math-note">${data.tau===null?'':math(t`\tau_{${method==='teno6'?6:5}}=${texNumber(data.tau)}`)} · cells [${data.indices.join(', ')}]</p>`
    +(data.limiter?small(`Unlimited ${number(data.limiter.raw)} → final ${number(data.value)}; bounds [${number(data.limiter.lower)}, ${number(data.limiter.upper)}]. ${data.limiter.bypass?'Quick test accepted the unlimited value.':'Limiter applied.'}`):'')
    + '<div class="weight-table-wrap"><table class="weight-table"><thead><tr>'
    + ['k','v_k',t`\beta_k`,...(teno?[t`\chi_k`,t`\delta_k`]:[]),t`\omega_k`].map(label=>`<th scope="col">${math(label)}</th>`).join('') + '</tr></thead><tbody>'
    + data.weights.map((w, k) => `<tr${teno && !data.keep[k] ? ' class="rejected"' : ''}><td>${k}</td><td>${number(data.candidates[k])}</td><td>${number(data.beta[k])}</td>${teno ? `<td>${number(data.chi[k])}</td><td>${data.keep[k]}</td>` : ''}<td>${number(w)}</td></tr>`).join('')
    + '</tbody></table></div>';
}
export function updateReconstructionMath(frame, trace, selected, face) {
  const method=frame.methods[0],nv=frame.cfg.nv,n=frame.cfg.n,key=`${method}/${nv}`;
  if(lastMethod!==key){document.getElementById('math-body').innerHTML=reconstructionMarkup(method,nv);lastMethod=key;}
  const live=document.getElementById('math-live');
  if(!METHODS[method].faceBased){
    live.innerHTML=small(`Cell ${selected}: mean ${number(trace.q[selected*nv])}, left edge ${number(trace.left[selected*nv])}, right edge ${number(trace.right[selected*nv])}.`);
    return;
  }
  const j=selected+face,periodic=PROBLEMS[frame.cfg.problem].periodic;
  const l=facePolynomial(trace.q,n,nv,method,j-1,'right',0,periodic),r=facePolynomial(trace.q,n,nv,method,j,'left',0,periodic);
  live.innerHTML=`<p class="math-live-heading">Live weights · ${face?'right':'left'} face of cell ${selected}</p>`
    +weightTable(l,`${math('q_L')} from cell ${j-1}`,method)+weightTable(r,`${math('q_R')} from cell ${j} (reflected)`,method);
}
