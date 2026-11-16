import { TABLES } from './reconstruction-tables.mjs';
import { reconstructionSpec } from './higher-order.mjs';
import { math, equation as eq } from './typeset.mjs';
const t=String.raw,small=s=>`<p class="math-note">${s}</p>`;
const sub=o=>o===0?'i':`i${o>0?'+':''}${o}`;
function candidateFormulas(method){
 const spec=reconstructionSpec(method);
 const indices=spec.candidates.map((offs,k)=>eq(t`S_${k}=\{${offs.map(i=>sub(i)).join(',')}\}`)).join('');
 if(method==='cweno5')return indices+small('S0 is the support of the corrected quartic. It is derived from the full interpolant and the three quadratics, rather than matching every mean on its support.');
 return indices+spec.candidates.map((offs,k)=>{
  const kernel=TABLES.kernels[offs.join(',')];
  return eq(t`v_${k}=P_${k}(1/2)=${offs.map((o,j)=>t`\left(${kernel.faceTex[j]}\right)\bar q_{${sub(o)}}`).join('+')}`);
 }).join('');
}
function momentDefinition(method){
 return (method==='cweno5'?small('The following moment equations apply to the quadratic candidates k = 1, 2, 3, and separately to Popt on all five cells. P0 is defined by the correction formula below.'):'')+eq(t`P_k(z)=\sum_{\ell=0}^{r_k-1}a_{k\ell}z^\ell,\qquad\int_{j-1/2}^{j+1/2}P_k(z)\,\mathrm dz=\bar q_{i+j}\quad(j\in S_k-i)`)
  +eq(t`\sum_{\ell=0}^{r_k-1}\frac{(j+1/2)^{\ell+1}-(j-1/2)^{\ell+1}}{\ell+1}a_{k\ell}=\bar q_{i+j}`)
  +small('These moment equations specify every polynomial coefficient exactly. Coordinates are measured in cell widths about the donor. Curves span the highlighted candidate support. A face-specific weighted polynomial is not necessarily high-order accurate inside the cell.');
}
const indicators=()=>eq(t`\beta[P]=\sum_{\ell=1}^{\deg P}\int_{-1/2}^{1/2}\left(\frac{\mathrm d^\ell P}{\mathrm dz^\ell}\right)^2\,\mathrm dz`);
export function higherMarkup(method){
 const spec=reconstructionSpec(method),weights=eq(t`(d_k)=\left(${spec.optimalTex.join(',')}\right)`);
 if(method==='mp5')return candidateFormulas(method)+eq(t`\alpha=4,\quad q^{\rm MP}=\bar q_i+\operatorname{minmod}(\bar q_{i+1}-\bar q_i,\alpha(\bar q_i-\bar q_{i-1}))`)
  +small('If the following quick test passes, MP5 accepts the unlimited face value:')
  +eq(t`(v_0-\bar q_i)(v_0-q^{\rm MP})\le10^{-10}`)
  +eq(t`D_j=\bar q_{j-1}-2\bar q_j+\bar q_{j+1}`)
  +eq(t`D^{\rm M}_{j+1/2}=\operatorname{minmod}(4D_j-D_{j+1},4D_{j+1}-D_j,D_j,D_{j+1})`)
  +eq(t`\begin{aligned}q^{\rm UL}&=\bar q_i+4(\bar q_i-\bar q_{i-1}),\\q^{\rm MD}&=\tfrac12(\bar q_i+\bar q_{i+1})-\tfrac12D^{\rm M}_{i+1/2},\\q^{\rm LC}&=\bar q_i+\tfrac12(\bar q_i-\bar q_{i-1})+\tfrac43D^{\rm M}_{i-1/2}.\end{aligned}`)
  +eq(t`\begin{aligned}q_{\min}&=\max[\min(\bar q_i,\bar q_{i+1},q^{\rm MD}),\min(\bar q_i,q^{\rm UL},q^{\rm LC})],\\q_{\max}&=\min[\max(\bar q_i,\bar q_{i+1},q^{\rm MD}),\max(\bar q_i,q^{\rm UL},q^{\rm LC})].\end{aligned}`)
  +eq(t`q_i^{\rm right}=v_0+\operatorname{minmod}(q_{\min}-v_0,q_{\max}-v_0)`)
  +small('The final formula is applied when the quick test fails. Minmod returns the smallest magnitude with the shared sign, or zero when signs differ. The curve remains the unlimited quartic; only the face value is limited. Common CFL ≤ 0.2 follows 1/(1+α).')
  +momentDefinition(method)+small('Formulas: <a href="https://ntrs.nasa.gov/api/citations/19970010128/downloads/19970010128.pdf#page=23">Suresh &amp; Huynh (1997), §2 and Appendix A</a>.');
 if(method==='linear5')return candidateFormulas(method)+eq(t`q_i^{\rm right}=P_0(1/2),\qquad q_i^{\rm left}=P_0(-1/2)`)+momentDefinition(method)
  +small('This is the unlimited degree-four polynomial matching five cell averages. It now supplies solver face values, so ringing is allowed. Available for scalar advection only.');
 if(method==='cweno5')return candidateFormulas(method)+momentDefinition(method)+weights
  +eq(t`P_0=\frac{P_{\rm opt}-\sum_{k=1}^3d_kP_k}{d_0},\qquad P_{\rm opt}\in\mathbb P_4,\quad P_{1,2,3}\in\mathbb P_2`)
  +indicators()+eq(t`\alpha_k=\frac{d_k}{(\beta[P_k]+\varepsilon)^2},\qquad\omega_k=\frac{\alpha_k}{\sum_m\alpha_m},\quad\varepsilon=\Delta x^2`)
  +eq(t`P_i(z)=\sum_{k=0}^3\omega_kP_k(z),\qquad q_i^{\rm left/right}=P_i(\mp1/2)`)
  +small('One set of weights defines the whole donor-cell polynomial. The corrected quartic and all quadratics retain the donor mean. The plotted blue curve is this combined polynomial within the donor cell.')
  +small('Construction and parameter choice: <a href="https://arxiv.org/pdf/1607.07319">Cravero et al., §3, Eq. (8)–(10), and §5</a>.');
 const head=candidateFormulas(method)+momentDefinition(method)+weights+indicators()+eq(t`q_i^{\rm right}=\sum_k\omega_kP_k(1/2)`);
 if(method==='teno6')return head
  +eq(t`P_{\rm full}\in\mathbb P_5,\qquad\tau_6=\left|\beta[P_{\rm full}]-\frac{\beta_0+4\beta_1+\beta_2}{6}\right|`)
  +eq(t`\gamma_k=\left(1+\frac{\tau_6}{\beta_k+10^{-40}}\right)^6,\qquad\chi_k=\frac{\gamma_k}{\sum_m\gamma_m}`)
  +eq(t`\delta_k=\begin{cases}0,&\chi_k<10^{-7},\\1,&\chi_k\ge10^{-7},\end{cases}\qquad\omega_k=\frac{d_k\delta_k}{\sum_m d_m\delta_m}`)
  +small('Three quadratic candidates and one right-biased cubic use six input means. The full degree-five polynomial is used only for τ6. Stencils are ordered left, central, right, wide-right here; the published weights are reordered to match.')
  +small('Original fixed-cutoff TENO6, not TENO6-opt: <a href="https://mediatum.ub.tum.de/doc/1370877/996147.pdf#page=73">Fu, Hu &amp; Adams (2016), Eq. (18)–(19), §3.3, Tables 1 and 5</a>.');
 return head+eq(t`\alpha_k=\frac{d_k}{(\beta_k+\varepsilon)^2},\qquad\omega_k=\frac{\alpha_k}{\sum_m\alpha_m},\qquad\varepsilon=10^{-6}`)
  +small(`WENO-JS${2*spec.degree+1} uses ${spec.candidates.length} candidates of degree ${spec.degree} on ${spec.offsets.length} cell averages. The left face reflects the stencil and recomputes the weights. Order refers to smooth scalar face reconstruction; critical points can reduce the observed order.`)
  +small('Jiang–Shu weights and arbitrary-order finite-volume construction: <a href="https://ntrs.nasa.gov/api/citations/19980007543/downloads/19980007543.pdf">Shu, ICASE Report 97-65, §2.2–2.3</a>.');
}
