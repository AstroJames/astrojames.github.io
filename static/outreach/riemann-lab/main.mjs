import { METHODS, TIME_METHODS, PROBLEMS, primitiveFields, profileValue, exactPoint, exactEuler, exactReferenceAvailable, exactValueRange, rangeExcess, stableDt, inspectSubstep, trialStep } from './core.mjs';
import { updateReconstructionMath } from './reconstruction-math.mjs';
import { drawFaceStencils } from './stencil-view.mjs';
import { math, equation, setMath, texNumber } from './typeset.mjs';

const $ = id => document.getElementById(id);
const C = { cell: '#8cccf4', left: '#efbc68', right: '#baacf7', muted: '#acbbcd', gray: '#718399', rule: '#304156', ink: '#edf2f7', exact: '#d5e3ed' };
let worker, frame = null, revision = 0, n = 64, selected = 21, face = 1;
let problem = 'gaussian', methods = ['pcm', 'mc'], speed = 1, integrator = 'ssprk3', fofc = false, historyKey = '';
let solverFault = false, solutionZoom = false;
let solutionDomain = [0, 1];
const methodGroups = {'Basic & limited':['pcm','minmod','mc','ppm','linear5','mp5'],'Weighted ENO':['wenojs5','wenoz','wenojs7','wenojs9','cweno5'],'Targeted ENO':['teno5','teno6']};
for(const id of ['method-a','method-b'])$(id).innerHTML=Object.entries(methodGroups).map(([label,keys])=>`<optgroup label="${label}">${keys.map(key=>`<option value="${key}">${METHODS[key].name}</option>`).join('')}</optgroup>`).join('');
$('method-a').value=methods[0];$('method-b').value=methods[1];
const stencilSources = ['L', 'L'], activeCandidates = [-1, -1];
const t = String.raw;
$('fofc-formula').innerHTML = equation(t`\widehat{\mathbf F}^{\mathrm{LLF}}_{i+1/2}=\frac{\mathbf F(\bar{\mathbf U}_i)+\mathbf F(\bar{\mathbf U}_{i+1})}{2}-\frac{\alpha_{i+1/2}}{2}(\bar{\mathbf U}_{i+1}-\bar{\mathbf U}_i)`)
  + equation(t`\alpha_{i+1/2}=\max(|u_i|+c_i,|u_{i+1}|+c_{i+1}),\quad c_i=\sqrt{\gamma p_i/\rho_i}`)
  + equation(t`\rho_i^{\mathrm{trial}}>0,\quad p_i^{\mathrm{trial}}=(\gamma-1)\left(E_i^{\mathrm{trial}}-\frac{(m_i^{\mathrm{trial}})^2}{2\rho_i^{\mathrm{trial}}}\right)>0`);
let operation = 0;
const operations = ['storage', 'reconstruction', 'riemann', 'update'];
function showOperation(next, focus = false) {
  operation = Math.max(0, Math.min(3, next));
  document.querySelectorAll('[data-step]').forEach(button => {
    const active = +button.dataset.step === operation;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  operations.forEach((name, i) => { $(`${name}-operation`).hidden = solverFault || i !== operation; });
  $('previous-operation').disabled = operation === 0;
  $('next-operation').disabled = operation === 3;
  $('next-operation').textContent = ['Next: reconstruction →', 'Next: face flux →', 'Next: update →', 'Next →'][operation];
  $('step-progress').textContent = `${operation + 1} of 4`;
  paint();
}
const sampledCell = i => PROBLEMS[problem].periodic ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = v => Math.abs(v) < 5e-14 ? '0.0000' : Math.abs(v) < 0.0001 ? v.toExponential(2) : v.toFixed(4);
const signed = v => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;
const send = (type, data = {}) => worker?.postMessage({ type, revision, ...data });
function feedback(message, error = false) {
  $('feedback').textContent = message;
  $('feedback').classList.toggle('error', error);
}
function restart(message = 'Restarted from the initial cell averages.') {
  revision++; frame = null; historyKey = ''; solverFault = false; solutionZoom = false;
  $('inspection-error').hidden = true;
  $('freeze').disabled = false;
  operations.forEach((name,i)=>{$(`${name}-operation`).hidden=i!==operation;});
  for (const id of ['run', 'step', 'apply-step']) $(id).disabled = true;
  $('status').textContent = 'Preparing';
  send('init', { config: { problem, n, methods, speed, integrator, fofc } });
  feedback(message);
}
function svgStart(w, h, label, extra = '') {
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(label)}" ${extra} xmlns="http://www.w3.org/2000/svg">`;
}
function line(x1, y1, x2, y2, color, width = 1, dash = '') {
  return `<line class="plot-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
}
function text(x, y, label, color = C.muted, anchor = 'start', size = 9) {
  return `<text x="${x}" y="${y}" fill="${color}" text-anchor="${anchor}" font-size="${size}">${escape(label)}</text>`;
}
function path(points, color, width = 1.8, dash = '') {
  return `<path class="plot-line" d="${points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
}
function bounds(el, local = false) {
  const w = Math.max(220, el.clientWidth - (local ? 0 : 12));
  const h = local ? 156 : Math.max(230, Math.min(300, w * 0.57));
  return { w, h, l: 43, r: w - 12, t: 22, b: h - 28 };
}
function scales(b, low, high, xmin = 0, xmax = 1) {
  return { X: x => b.l + (x - xmin) / (xmax - xmin) * (b.r - b.l),
    Y: y => b.b - (y - low) / (high - low) * (b.b - b.t) };
}
function limits(values, minSpan = 0.03) {
  const lo = Math.min(...values), hi = Math.max(...values), span = Math.max(hi - lo, minSpan);
  return [lo - 0.12 * span, hi + 0.36 * span];
}
function axes(b, X, Y, low, high, xmin = 0, xmax = 1, local = false, quantitative = true) {
  let out = line(b.l, b.b, b.r, b.b, C.rule);
  if (quantitative) {
    out += line(b.l, b.t, b.l, b.b, C.rule);
    for (let j = 0; j <= 3; j++) {
      const y = low + (high - low) * j / 3;
      out += line(b.l - 3, Y(y), b.l, Y(y), C.rule);
      out += text(b.l - 7, Y(y) + 3, y.toFixed(high-low < 0.008 ? 6 : high - low < 0.08 ? 3 : 2), C.muted, 'end', 8);
    }
  }
  for (let j = 0; j <= (local ? 2 : 4); j++) {
    const x = xmin + (xmax - xmin) * j / (local ? 2 : 4);
    out += line(X(x), b.b, X(x), b.b + 3, C.rule);
    out += text(X(x), b.b + 15, x.toFixed(xmax-xmin < 0.02 ? 4 : local || xmax-xmin < 0.2 ? 3 : 2), C.muted, 'middle', 8);
  }
  return out;
}
function selection(b, X, flux = false) {
  const l = X(selected / n), r = X((selected + 1) / n), top = flux ? 45 : b.t;
  const bottom = flux ? b.b - 14 : b.b;
  return `<rect data-selected-cell="${selected}" x="${l}" y="${top}" width="${r - l}" height="${bottom - top}" fill="${C.cell}" opacity=".09"/>`
    + line(l, top, l, bottom, C.left, face === 0 ? 1.6 : 0.8, '3 4')
    + line(r, top, r, bottom, C.right, face === 1 ? 1.6 : 0.8, '3 4');
}
function exactPoints(xmin = 0, xmax = 1) {
  const xs = Array.from({ length: 501 }, (_, i) => xmin + (xmax-xmin)*i / 500);
  let cuts = [];
  if (problem === 'square') cuts = [0.2, 0.45].map(x => ((x + frame.displacement) % 1 + 1) % 1);
  if (frame.cfg.nv === 3) cuts = frame.time > 0 ? exactEuler(problem).speeds.map(s => 0.5 + s * frame.time) : [0.5];
  for (const x of cuts) if (x > xmin && x < xmax) xs.push(Math.max(xmin,x - 1e-10), Math.min(xmax,x + 1e-10));
  return xs.sort((a, b) => a - b).map(x => [x, exactPoint(problem, x, frame.time, frame.displacement)[0]]);
}
function localWindow() {
  const count = 7;
  const start = selected - Math.floor(count / 2);
  return { start, end: start + count, count };
}
function drawSolution() {
  const el = $('solution-plot'), b = bounds(el), nv = frame.cfg.nv;
  const qs = frame.states.map(u => primitiveFields(u, n, nv));
  const hasReference = exactReferenceAvailable(problem, frame.time);
  const visibleCount = solutionZoom ? Math.min(n, 16) : n;
  const first = solutionZoom ? Math.max(0,Math.min(n-visibleCount,selected-Math.floor(visibleCount/2))) : 0;
  const last = first+visibleCount, xmin = first/n, xmax = last/n;
  solutionDomain = [xmin,xmax];
  $('full-domain').hidden = !solutionZoom;
  $('plot-view-note').textContent = solutionZoom ? `${visibleCount} cells around cell ${selected}` : '';
  const exact = hasReference ? exactPoints(xmin,xmax) : [], values = exact.map(p => p[1]), compare = $('compare').checked;
  const referenceRange = hasReference ? exactValueRange(problem, frame.time) : null;
  const excursions = hasReference ? frame.states.map(u => rangeExcess(u, nv, referenceRange)) : [];
  for (let run = 0; run < (compare ? 2 : 1); run++) for (let i = first; i < last; i++) values.push(qs[run][i * nv]);
  const [low, high] = limits(values, solutionZoom ? 1e-6 : 0.03), { X, Y } = scales(b, low, high, xmin, xmax);
  const { start, end } = localWindow();
  let out = svgStart(b.w, b.h, `Live ${nv === 1 ? 'signal' : 'density'} at t=${frame.time.toFixed(4)}. Selected cell ${selected}.`);
  out += axes(b, X, Y, low, high, xmin, xmax);
  out += `<defs><clipPath id="solution-clip"><rect x="${b.l}" y="${b.t}" width="${b.r-b.l}" height="${b.b-b.t}"/></clipPath></defs><g clip-path="url(#solution-clip)">`;
  out += `<rect x="${X(Math.max(0,start) / n)}" y="${b.t}" width="${X(Math.min(n,end) / n) - X(Math.max(0,start) / n)}" height="${b.b - b.t}" fill="${C.cell}" opacity=".035"/>`;
  if (hasReference) {
    if (high > referenceRange.max) out += `<rect x="${b.l}" y="${b.t}" width="${b.r-b.l}" height="${Math.max(0,Y(referenceRange.max)-b.t)}" fill="#f49e9e" opacity=".025"/>`;
    if (low < referenceRange.min) out += `<rect x="${b.l}" y="${Y(referenceRange.min)}" width="${b.r-b.l}" height="${Math.max(0,b.b-Y(referenceRange.min))}" fill="#f49e9e" opacity=".025"/>`;
    out += line(b.l,Y(referenceRange.min),b.r,Y(referenceRange.min),'#ac8a8a',0.8,'2 5');
    out += line(b.l,Y(referenceRange.max),b.r,Y(referenceRange.max),'#ac8a8a',0.8,'2 5');
  }
  out += selection(b, X);
  if (hasReference && $('show-exact').checked) out += path(exact.map(([x, y]) => [X(x), Y(y)]), C.exact, 1.2, '4 4');
  for (let run = compare ? 1 : 0; run >= 0; run--) {
    out += path(Array.from({ length: Math.min(n,last+1)-Math.max(0,first-1) }, (_, j) => { const i=j+Math.max(0,first-1); return [X((i + 0.5) / n), Y(qs[run][i * nv])]; }), run ? C.right : C.cell, 1.9);
    for (let i=first;i<last;i++) {
      const v=qs[run][i*nv];
      if(solutionZoom)out+=`<circle cx="${X((i+.5)/n)}" cy="${Y(v)}" r="2" fill="${run?C.right:C.cell}"/>`;
      if(hasReference && (v<referenceRange.min-1e-10||v>referenceRange.max+1e-10))
        out+=`<circle data-range-excess="${run}" cx="${X((i+.5)/n)}" cy="${Y(v)}" r="2.6" fill="#ffaaaa"/>`;
    }
  }
  const correctedFaces = frame.corrections?.[0]?.last?.faces;
  if (nv===3 && correctedFaces) for (let j=first;j<=last;j++) if(correctedFaces[j])
    out += `<path data-corrected-face="${j}" d="M${X(j/n)-3},${b.b-5} l3,-6 l3,6 Z" fill="${C.left}"/>`;
  out += '</g>';
  out += text(b.l + 9, b.t + 13, nv === 1 ? 'Signal q' : 'Density ρ', C.ink, 'start', 10);
  let lx = b.r - 5;
  const legend = [['Main', C.cell], ...(compare ? [['B', C.right]] : []), ...(hasReference && $('show-exact').checked ? [['Exact', C.exact]] : [])];
  for (const [name, color] of legend.reverse()) {
    out += text(lx, b.t + 13, name, color, 'end', 9);
    const label = name.length * 5.5;
    out += line(lx - label - 16, b.t + 9, lx - label - 4, b.t + 9, color, 1.5, name === 'Exact' ? '3 3' : '');
    lx -= label + 28;
  }
  el.innerHTML = out + '</svg>';
  $('show-exact').disabled = !hasReference;
  $('inspect-overshoot').disabled = !hasReference || excursions[0].overshoot <= 1e-10;
  if (!hasReference) {
    $('overshoot').textContent = $('undershoot').textContent = '—';
    $('range-note').textContent = 'Waves have reached an outflow boundary. Evolution continues; exact-reference errors and overshoot are no longer shown.';
    return;
  }
  $('overshoot').textContent = compare ? `A ${signed(excursions[0].overshoot)} · B ${signed(excursions[1].overshoot)}` : `+${fmt(excursions[0].overshoot)}`;
  $('undershoot').textContent = compare ? `A −${fmt(excursions[0].undershoot)} · B −${fmt(excursions[1].undershoot)}` : `−${fmt(excursions[0].undershoot)}`;
  $('range-note').textContent = `Exact ${nv===1?'signal':'density'} range: ${fmt(referenceRange.min)}–${fmt(referenceRange.max)}. Red points mark excess in cell averages.`;
}
function localContext(trace) {
  const { start, end } = localWindow(), nv = frame.cfg.nv;
  const values = [];
  for (let i = start; i < end; i++) { const index=sampledCell(i)*nv; values.push(trace.q[index], trace.left[index], trace.right[index], trace.first[index]); }
  return { start, end, lowHigh: limits(values), nv };
}
function arrow(x1, y1, x2, y2, color, width = 1.5) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 1) return '';
  const dx = (x2 - x1) / length, dy = (y2 - y1) / length;
  return line(x1, y1, x2, y2, color, width)
    + `<path d="M${x2 - 5 * dx + 3 * dy},${y2 - 5 * dy - 3 * dx} L${x2},${y2} L${x2 - 5 * dx - 3 * dy},${y2 - 5 * dy + 3 * dx}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
}
function drawCellPlot(id, kind, trace, ctx) {
  const el = $(id), b = bounds(el, true), { start, end, lowHigh: [low, high], nv } = ctx;
  const { X, Y } = scales(b, low, high, start / n, end / n);
  let out = svgStart(b.w, b.h, `${kind} for cell ${selected}`, `data-cell="${selected}" data-face="${selected + face}"`);
  out += axes(b, X, Y, low, high, start / n, end / n, true) + selection(b, X);
  for (let i = start; i < end; i++) {
    const index = sampledCell(i) * nv, value = trace.q[index], x0 = X(i / n), x1 = X((i + 1) / n), mid = (x0 + x1) / 2;
    const storedColor = kind === 'averages' && i === selected ? C.cell : C.gray;
    out += line(x0 + 1, Y(value), x1 - 1, Y(value), storedColor, kind === 'averages' ? 2.5 : 1.3, kind === 'update' ? '3 3' : '');
    if (kind === 'averages') out += `<circle cx="${mid}" cy="${Y(value)}" r="${i === selected ? 3 : 2}" fill="${storedColor}"/>`;
    if (kind === 'reconstruction') {
      const method = frame.methods[0];
      if (!METHODS[method].faceBased) {
        const points = Array.from({ length: 17 }, (_, j) => [x0 + (x1 - x0) * j / 16,
          Y(profileValue(value, trace.left[index], trace.right[index], j / 16, method))]);
        out += path(points, C.cell, i === selected ? 2.6 : 1.4);
      }
    }
    if (kind === 'update') {
      const next = trace.first[index];
      out += line(x0 + 1, Y(next), x1 - 1, Y(next), C.cell, i === selected ? 2.5 : 1.2);
      if (i === selected) out += arrow(mid, Y(value), mid, Y(next), C.cell, 1.2);
    }
  }
  if (kind === 'reconstruction') for (const side of METHODS[frame.methods[0]].faceBased ? [face] : [0, 1]) {
    const j = selected + side, x = X(j / n), color = side ? C.right : C.left;
    const ql = trace.right[(j - 1) * nv], qr = trace.left[j * nv];
    out += `<circle cx="${x}" cy="${Y(ql)}" r="3" fill="${color}"/><circle cx="${x}" cy="${Y(qr)}" r="5" fill="none" stroke="${color}" stroke-width="1.2"/>`;
  }
  const label = kind === 'averages' ? 'Stored means' : kind === 'reconstruction' ? METHODS[frame.methods[0]].short
    : frame.cfg.integrator==='rk4' ? 'Dashed: now · blue: RK4 midpoint' : frame.cfg.integrator==='euler' ? 'Dashed: now · blue: Euler update' : 'Dashed: now · blue: first predictor';
  out += text(b.l + 8, b.t + 12, label, kind === 'reconstruction' ? C.cell : C.muted, 'start', 9);
  if (kind !== 'update') out += text(b.r - 4, b.t + 12, kind === 'reconstruction' ? '● qL  ○ qR' : `Cell ${selected}`, C.muted, 'end', 8);
  el.innerHTML = out + '</svg>';
}
function drawFluxes(trace, ctx) {
  const el = $('flux-plot'), b = bounds(el, true), { start, end, nv, lowHigh: [low, high] } = ctx;
  const { X, Y } = scales(b, low, high, start / n, end / n);
  let out = svgStart(b.w, b.h, `Fluxes through the two faces of cell ${selected}`, `data-cell="${selected}" data-face="${selected + face}"`);
  out += axes(b, X, Y, low, high, start / n, end / n, true, false) + selection(b, X, true);
  const dx = X((selected + 1) / n) - X(selected / n);
  for (let i = start; i < end; i++) out += text(X((i + 0.5) / n), b.b - 19, i === selected ? `Cell ${i}` : String(i), i === selected ? C.cell : C.gray, 'middle', 9);
  for (const side of [0, 1]) {
    const j = selected + side, x = X(j / n), f = trace.flux[j * nv], color = trace.corrected?.[j] ? '#f3a45c' : side ? C.right : C.left;
    const sign = Math.sign(f), y = 76;
    if (sign) out += arrow(x - sign * dx * 0.3, y, x + sign * dx * 0.3, y, color, 2);
    else out += `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`;
    out += text(x, 24, side ? 'Right flux' : 'Left flux', color, 'middle', 9);
    out += text(x, 41, fmt(f), color, 'middle', 10);
    if(trace.corrected?.[j])out += text(x, 57, 'FOFC · LLF', color, 'middle', 9);
  }
  el.innerHTML = out + '</svg>';
}
let traceFrame = null, cachedTrace = null;
function drawTrace() {
  let dt = Math.min(...frame.states.map(u => stableDt(u, frame.cfg)));
  let trace;
  try {
    if(traceFrame===frame) trace=cachedTrace;
    else {
      trace=frame.cfg.fofc && frame.cfg.nv===3
        ? trialStep(frame.states,frame.cfg,frame.methods).results[0].firstTrace
        : inspectSubstep(frame.states[0], frame.cfg, frame.methods[0], dt);
      traceFrame=frame;cachedTrace=trace;
    }
    dt=trace.dt;
  }
  catch(error) { solverError(error.message); return; }
  const nv = frame.cfg.nv;
  const ctx = localContext(trace);
  $('selected-cell').textContent = `Following cell ${selected}`;
  $('stored-label').innerHTML = `Stored mean ${math(nv===1?t`\bar q_i`:t`\bar\rho_i`)}`;
  setMath($('average-definition'), nv===1?t`\bar q_i=\frac1{\Delta x}\int_{x_{i-1/2}}^{x_{i+1/2}}q(x)\,\mathrm dx`:t`\bar\rho_i=\frac1{\Delta x}\int_{x_{i-1/2}}^{x_{i+1/2}}\rho(x)\,\mathrm dx`,true);
  $('stored-value').textContent = fmt(trace.q[selected * nv]);
  $('cell-width').textContent = `Cell width Δx = ${(1 / n).toFixed(5)}. One stored mean per cell.`;
  if(operation===0)drawCellPlot('averages-plot', 'averages', trace, ctx);
  const nonlinear=METHODS[frame.methods[0]].faceBased;
  $('reconstruction-plot').hidden=nonlinear;
  if(operation===1){
    if(!nonlinear)drawCellPlot('reconstruction-plot', 'reconstruction', trace, ctx);
    drawFaceStencils($('face-stencils'),frame,trace,selected,face,stencilSources,activeCandidates,$('show-quartic').checked&&!['linear5','mp5','wenojs7','wenojs9','teno6'].includes(frame.methods[0]));
  }
  $('quartic-control').hidden=!nonlinear||['linear5','mp5','wenojs7','wenojs9','teno6'].includes(frame.methods[0]);
  if(operation===2)drawFluxes(trace, ctx);
  if(operation===3)drawCellPlot('update-plot', 'update', trace, ctx);
  $('reconstruction-explanation').textContent = METHODS[frame.methods[0]].faceBased
    ? frame.methods[0]==='mp5' ? 'The five-cell quartic supplies an unlimited face value. MP5 limits that value using neighboring slopes and curvatures.' : frame.methods[0]==='cweno5' ? 'CWENO combines a corrected quartic with three quadratic candidates into one polynomial per cell. Both faces use that same polynomial.' : 'Select a side of the face to inspect its input means. Each candidate polynomial matches the cell averages on its highlighted stencil. The diamond is the value sent to the Riemann solve.'
    : 'Use neighboring averages to estimate the shape inside each cell. The profile keeps the same mean and supplies values at both faces.';
  $('profile-note').textContent = METHODS[frame.methods[0]].faceBased
    ? frame.methods[0]==='mp5' ? 'Gold interval: limiter bounds. Hollow dot: unlimited value. Blue diamond: final value. The quartic curve is shown before limiting.' : 'Colored dots: candidate face values. Blue diamond: the value sent to the solver. Select a stencil band to isolate its curve. Rejected TENO candidates are dashed.'
    : 'The faint horizontal bars are the stored averages. The blue curve is the reconstruction used by the solver.';
  if(operation===1&&$('reconstruction-math').open)updateReconstructionMath(frame, trace, selected, face);
  const j = selected + face, corrected = !!trace.corrected?.[j];
  const il=sampledCell(j-1),ir=sampledCell(j);
  const ql = corrected || (j===0&&!PROBLEMS[problem].periodic) ? trace.q[il*nv] : trace.right[il*nv];
  const qr = corrected || (j===n&&!PROBLEMS[problem].periodic) ? trace.q[ir*nv] : trace.left[ir*nv];
  const f = trace.flux[j * nv];
  $('fofc-face-note').hidden = !frame.cfg.fofc || nv===1;
  $('fofc-face-note').dataset.corrected = String(corrected);
  $('fofc-face-note').textContent = corrected
    ? `This face uses first-order LLF from the two stored cell states in the next first substep. ${trace.corrected[j]&1?'The reconstructed density or pressure was nonphysical.':'A predicted RK update failed the positivity check.'} Step 2 retains the proposed high-order reconstruction for comparison.`
    : 'This face keeps its reconstructed HLLE flux in the next first substep. Later RK stages can make different corrections.';
  $('fofc-math').hidden = nv===1;
  if(corrected) {
    $('reconstruction-explanation').textContent = $('reconstruction-explanation').textContent.replace('The diamond is the value sent to the Riemann solve.', 'The diamond is the proposed face value.') + ' FOFC replaces the flux at this face; these curves show the attempted reconstruction.';
    $('profile-note').textContent = 'The curves, candidate dots and blue diamond show the proposed reconstruction. FOFC uses donor-cell states instead at this face; step 3 shows the actual flux inputs.';
    if(trace.corrected[j]&1) {
      const pl = j===0&&!PROBLEMS[problem].periodic ? trace.q[il*nv+2] : trace.right[il*nv+2];
      const pr = j===n&&!PROBLEMS[problem].periodic ? trace.q[ir*nv+2] : trace.left[ir*nv+2];
      $('fofc-face-note').textContent += ` Proposed face pressures: left ${fmt(pl)}, right ${fmt(pr)}.`;
    }
  }
  setMath($('left-state'),t`q_L=${texNumber(ql)}`); setMath($('right-state'),t`q_R=${texNumber(qr)}`);
  $('left-state').parentElement.classList.toggle('upwind', nv === 1 && frame.cfg.speed > 0);
  $('right-state').parentElement.classList.toggle('upwind', nv === 1 && frame.cfg.speed < 0);
  $('flux-formula').style.color = face ? C.right : C.left;
  if (nv === 1) {
    const a = frame.cfg.speed, up = a >= 0 ? ql : qr, state = a >= 0 ? 'L' : 'R';
    $('riemann-explanation').textContent = a === 0 ? 'At zero speed neither side is transported, so the face flux is zero.'
      : `Each face receives two reconstructed values. ${a > 0 ? 'Rightward transport uses the value arriving from the left.' : 'Leftward transport uses the value arriving from the right.'}`;
    setMath($('flux-formula'),a===0?'F=0':t`F=a\,q_${state}=${a}\times ${texNumber(up)}\simeq ${texNumber(f)}`,true);
  } else {
    $('riemann-explanation').textContent = corrected ? 'The positivity check flagged this face. Donor-cell LLF now uses the stored states on either side.' : 'Gas dynamics has several wave speeds. The HLLE solver uses both reconstructed states to compute the mass flux.';
    setMath($('flux-formula'),t`F_\rho^{\mathrm{${corrected?'LLF':'HLLE'}}}=${texNumber(f)}`,true);
  }
  const fl = trace.flux[selected * nv], fr = trace.flux[(selected + 1) * nv], net = fl - fr;
  $('flux-left').textContent = `${fmt(fl)} left`;
  $('flux-right').textContent = `${fmt(fr)} right`;
  $('net-flux').textContent = `= ${signed(net)}`;
  $('balance-explanation').textContent = Math.abs(net) < 1e-12 ? 'The two fluxes balance, so the average is unchanged in this substep.'
    : net > 0 ? 'Net inflow raises the average. Both fluxes come directly from step 3.' : 'Net outflow lowers the average. Both fluxes come directly from step 3.';
  const old = trace.q[selected * nv], next = trace.first[selected * nv];
  setMath($('update-formula'),t`${texNumber(old)}+${texNumber(trace.stageDt*n)}\,\bigl(${texNumber(fl)}-${texNumber(fr)}\bigr)\simeq ${texNumber(next)}`,true);
  $('update-formula').setAttribute('aria-label', `${frame.cfg.integrator==='rk4'?'RK4 midpoint: initial average plus delta t over twice delta x':frame.cfg.integrator==='euler'?'Euler update: initial average plus delta t over delta x':'First predictor: initial average plus delta t over delta x'} times left flux minus right flux equals ${fmt(next)}`);
  // Readouts expose exactly what the diagram shows for accessibility and verification.
  $('update-plot').dataset.oldValue = old;
  $('update-plot').dataset.nextValue = next;
  $('update-plot').dataset.dt = dt;
  $('update-plot').dataset.stageDt = trace.stageDt;
  updateTimeDescription(frame.cfg.integrator);
  for (const side of ['left', 'right']) $(`face-${side}`).setAttribute('aria-pressed', String(face === (side === 'left' ? 0 : 1)));
}
let lastTimeFormula = '';
function updateTimeDescription(key) {
  const descriptions = {
    euler: 'This is the complete Forward Euler step. Its single flux evaluation advances the solution.',
    ssprk2: 'This is the first forward-Euler predictor. SSPRK2 evaluates the flux a second time and averages the two predictors.',
    ssprk3: 'This is the first forward-Euler predictor. SSPRK3 repeats the flux evaluation at two more stage states and combines the results.',
    rk4: 'This is the first midpoint state, U + (Δt/2)L(U). RK4 uses four flux evaluations and weights (1, 2, 2, 1)/6 for the full step.',
  };
  $('time-stage-note').textContent = descriptions[key];
  const symbol=frame.cfg.nv===1?t`\bar q_i`:t`\bar\rho_i`;
  setMath($('update-rule'),t`${symbol}^{${key==='euler'?'n+1':'*'}}=${symbol}^{n}+\frac{\Delta t}{${key==='rk4'?'2':''}\Delta x}\left(F_{i-1/2}-F_{i+1/2}\right)`,true);
  if (lastTimeFormula === key) return;
  const equations = {
    euler: [t`U^{n+1}=U^n+\Delta t\,L(U^n)`],
    ssprk2: [t`Y_1=U^n+\Delta t\,L(U^n)`,t`U^{n+1}=\frac12U^n+\frac12\bigl[Y_1+\Delta t\,L(Y_1)\bigr]`],
    ssprk3: [t`Y_1=U^n+\Delta t\,L(U^n)`,t`Y_2=\frac34U^n+\frac14\bigl[Y_1+\Delta t\,L(Y_1)\bigr]`,t`U^{n+1}=\frac13U^n+\frac23\bigl[Y_2+\Delta t\,L(Y_2)\bigr]`],
    rk4: [t`k_1=L(U^n)`,t`k_2=L\!\left(U^n+\frac{\Delta t}2 k_1\right)`,t`k_3=L\!\left(U^n+\frac{\Delta t}2 k_2\right)`,t`k_4=L(U^n+\Delta t\,k_3)`,t`U^{n+1}=U^n+\frac{\Delta t}6(k_1+2k_2+2k_3+k_4)`],
  };
  $('time-formula').innerHTML = `<p class="math-note">${TIME_METHODS[key].name}: order ${TIME_METHODS[key].order}, ${TIME_METHODS[key].b.length} flux evaluation${TIME_METHODS[key].b.length===1?'':'s'} per step. L is the finite-volume flux-difference operator.</p>`
    + equations[key].map(equation).join('');
  lastTimeFormula = key;
}
function paint() {
  if (!frame) return;
  n = frame.cfg.n;
  drawSolution();
  $('time').textContent = frame.time.toFixed(4);
  $('step-count').textContent = `${frame.steps.toLocaleString()} steps`;
  if(solverFault)return;
  drawTrace();
  if(solverFault)return;
  $('resolution').value = n;
  $('integrator').value = frame.cfg.integrator;
  $('status').textContent = frame.running ? 'Solving' : frame.steps ? 'Paused' : 'Ready';
  if (frame.retries) $('status').textContent += ` · ${frame.retries} retries`;
  $('status-dot').classList.toggle('running', frame.running);
  $('run').textContent = frame.running ? 'Ⅱ Pause' : '▶ Run';
  for (const id of ['run', 'step', 'apply-step']) $(id).disabled = false;
  const scalar = frame.cfg.nv === 1;
  $('fofc').disabled=scalar;$('fofc').checked=!!frame.cfg.fofc;
  $('fofc-scope').textContent=scalar?'Gas dynamics only · scalar overshoots are unchanged':frame.cfg.fofc?'On for both solves · conservative donor-cell LLF fallback':'Off · nonphysical states can stop the solve';
  const correction=frame.corrections?.[0],last=correction?.last;
  $('fofc-readout').hidden=scalar||(!frame.cfg.fofc&&!correction?.total);
  $('fofc-readout').textContent=`FOFC · main: ${last?.faceStages??0} face-stage replacements in the last step · ${correction?.total??0} total. Amber markers show faces corrected in that accepted step.`
    + ($('compare').checked?` Comparison: ${frame.corrections?.[1]?.last?.faceStages??0} last · ${frame.corrections?.[1]?.total??0} total.`:'');
  document.querySelector('.cfl-tag').textContent=`CFL ≤ ${frame.cfg.cfl??0.35}`;
  const note=frame.methods.includes('linear5')?'Unlimited 5 is an advection-only diagnostic: its polynomial is not limited near jumps.'
    :frame.methods.includes('mp5')?'MP5 uses a common CFL ≤ 0.2 with α = 4. Its monotonicity guarantee requires an appropriate SSP time integrator.'
    :frame.cfg.integrator==='euler'&&frame.methods.some(m=>METHODS[m].faceBased)?'Forward Euler can amplify high-order oscillations. FOFC checks positivity, not oscillation amplitude. SSPRK3 is the default.':'';
  $('method-note').hidden=!note;$('method-note').textContent=note;
  for(const id of ['method-a','method-b'])for(const option of $(id).options)option.disabled=!scalar&&!!METHODS[option.value].scalarOnly;
  $('direction-row').hidden = !scalar;
  setMath($('equation'),scalar?t`\partial_tq+a\,\partial_xq=0`:t`\partial_t\mathbf U+\partial_x\mathbf F(\mathbf U)=0`);
  $('error-label').textContent = scalar ? 'Mean absolute error in q' : 'Mean absolute error in density';
  $('error-a').textContent = frame.diagnostics[0].l1 === null ? '—' : fmt(frame.diagnostics[0].l1);
  $('error-b').textContent = frame.diagnostics[1].l1 === null ? '—' : fmt(frame.diagnostics[1].l1);
  $('error-b').hidden = !$('compare').checked;
  $('mass-error').textContent = Math.max(...frame.diagnostics.slice(0, $('compare').checked ? 2 : 1).map(d => d.balance)).toExponential(1);
  document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === frame.cfg.speed)));
  const key = JSON.stringify(frame.history);
  if (key !== historyKey) {
    historyKey = key;
    $('history').innerHTML = frame.history.slice(-5).map(h => `<li><time>t=${h.time.toFixed(4)}</time>${escape(h.text)}</li>`).join('');
  }
}
function selectCell(value) {
  selected = Math.max(1, Math.min(n - 2, Math.floor(value))); paint();
}
document.querySelectorAll('[data-step]').forEach(button=>{
  button.addEventListener('click',()=>showOperation(+button.dataset.step));
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?3:(operation+(event.key==='ArrowRight'?1:3))%4;
    showOperation(next,true);
  });
});
$('previous-operation').addEventListener('click',()=>showOperation(operation-1));
$('next-operation').addEventListener('click',()=>showOperation(operation+1));
function pointInPlot(el, event, local) {
  const svg = el.querySelector('svg');
  if (!svg) return null;
  const rect = svg.getBoundingClientRect(), b = bounds(el, local);
  return { b, x: (event.clientX - rect.left) / rect.width * b.w };
}
$('solution-plot').addEventListener('click', event => {
  if (!frame) return;
  const p = pointInPlot($('solution-plot'), event, false);
  if (p) selectCell(n * (solutionDomain[0] + (solutionDomain[1]-solutionDomain[0]) * (p.x - p.b.l) / (p.b.r - p.b.l)));
});
$('inspect-overshoot').addEventListener('click', () => {
  if (!frame) return;
  const u=frame.states[0], nv=frame.cfg.nv;
  let peak=0;
  for(let i=1;i<n;i++)if(u[i*nv]>u[peak*nv])peak=i;
  send('run',{running:false}); solutionZoom=true; selectCell(peak);
  feedback('Paused at the largest overshoot in the main solution. Use the cell arrows to pan, or Full domain to zoom out.');
});
$('full-domain').addEventListener('click',()=>{solutionZoom=false;paint();});
$('solution-plot').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault(); selectCell(selected + (e.key === 'ArrowRight' ? 1 : -1));
});
for (const el of document.querySelectorAll('[data-local-plot]')) el.addEventListener('click', event => {
  if (!frame) return;
  const p = pointInPlot(el, event, true);
  if (!p) return;
  const { start, count } = localWindow();
  const cell = start + count * (p.x - p.b.l) / (p.b.r - p.b.l);
  // Click close to a face of the current cell to follow that face through the map.
  if (el.id === 'reconstruction-plot' || el.id === 'flux-plot') {
    const nearest = Math.round(cell);
    if (Math.abs(nearest - cell) < 0.22 && [selected, selected + 1].includes(nearest)) {
      face = nearest - selected; paint(); return;
    }
  }
  selectCell(cell);
});
$('cell-back').addEventListener('click', () => selectCell(selected - 1));
$('cell-next').addEventListener('click', () => selectCell(selected + 1));
$('face-left').addEventListener('click', () => { face = 0; paint(); });
$('face-right').addEventListener('click', () => { face = 1; paint(); });
$('freeze').addEventListener('click', () => { send('run', { running: false }); feedback('Paused. Follow the same blue cell down the four diagrams.'); });
$('run').addEventListener('click', () => {
  if (frame) { send('run', { running: !frame.running }); feedback(frame.running ? 'Paused. The diagrams now hold the current state.' : 'Solving live. Reconstruction can change while the signal moves.'); }
});
for (const id of ['step', 'apply-step']) $(id).addEventListener('click', () => { send('step'); feedback('Advanced one full time step. The diagrams show the next first substep.'); });
$('reset').addEventListener('click', () => restart());
$('example').addEventListener('change', () => {
  problem = $('example').value;
  if(PROBLEMS[problem].equation==='euler')methods=methods.map(m=>METHODS[m].scalarOnly?'pcm':m);
  selected = Math.max(1, Math.min(n - 2, Math.floor(n * (PROBLEMS[problem].equation === 'euler' ? 0.5 : 0.335))));
  restart();
});
$('resolution').addEventListener('change', () => {
  const old = n; n = +$('resolution').value;
  selected = Math.max(1, Math.min(n - 2, Math.round((selected + 0.5) * n / old - 0.5)));
  restart('Changed the grid and restarted the solves.');
});
for (const b of document.querySelectorAll('[data-speed]')) b.addEventListener('click', () => {
  speed = +b.dataset.speed; send('speed', { speed });
  stencilSources[0]=stencilSources[1]=speed<0?'R':'L';
  feedback(speed ? `Transport now moves ${speed > 0 ? 'right' : 'left'}. The current cell averages are preserved.` : 'Transport stopped. Every advective flux is zero.');
});
for (const [run, id] of ['method-a', 'method-b'].entries()) $(id).addEventListener('change', () => {
  methods[run] = $(id).value;
  if(run===0)activeCandidates[0]=activeCandidates[1]=-1;
  if(solverFault){restart('Restarted with the new reconstruction after the stopped solve.');return;}
  send('method', { run, method: methods[run] });
  feedback(`${run ? 'Comparison' : 'Main solution'} now uses ${METHODS[methods[run]].name}. Current averages are preserved.`);
});
$('playback').addEventListener('change', () => send('playback', { value: +$('playback').value }));
$('integrator').addEventListener('change',()=>{
  integrator=$('integrator').value;
  if(solverFault){restart('Restarted with the new time integrator after the stopped solve.');return;}
  send('integrator',{integrator});
  feedback(`Both solves now use ${TIME_METHODS[integrator].name}. Current cell averages and time are preserved.`);
});
$('fofc').addEventListener('change',()=>{
  fofc=$('fofc').checked;
  if(solverFault){restart('Restarted with the new flux-correction setting after the stopped solve.');return;}
  send('fofc',{enabled:fofc});
  feedback(`First-order flux correction ${fofc?'enabled':'disabled'} for both solves. Current averages and time are preserved.`);
});
$('fofc-demo').addEventListener('click',()=>{
  problem='sod';n=64;methods=['teno6','pcm'];integrator='euler';fofc=true;selected=37;face=1;
  $('example').value=problem;$('method-a').value=methods[0];$('resolution').value=n;
  restart('TENO6 + Forward Euler on Sod, with FOFC enabled. Run to see corrections; switch FOFC off and restart to compare the failure.');
  showOperation(2);
});
$('show-quartic').addEventListener('change',paint);
$('reconstruction-math').addEventListener('toggle',()=>{if($('reconstruction-math').open)paint();});
$('face-stencils').addEventListener('click',event=>{
  const source=event.target.closest('[data-source]'),candidate=event.target.closest('[data-candidate]'),all=event.target.closest('[data-show-all]');
  if(source){const side=+source.dataset.faceSide;face=side;stencilSources[side]=source.dataset.source;}
  else if(candidate){face=+candidate.dataset.faceSide;activeCandidates[face]=+candidate.dataset.candidate;}
  else if(all){face=+all.dataset.showAll;activeCandidates[face]=-1;}
  else return;
  paint();
});
$('overshoot-demo').addEventListener('click',()=>{
  problem='square';n=16;methods[0]='teno5';selected=7;face=1;speed=1;
  stencilSources[0]=stencilSources[1]='L';activeCandidates[0]=activeCandidates[1]=-1;
  $('example').value=problem;$('method-a').value=methods[0];$('resolution').value=n;
  restart('16-cell square pulse with TENO5. Press Run to see the measured overshoot; the selected RK method is retained.');
  showOperation(1);
});
$('show-exact').addEventListener('change', paint);
$('compare').addEventListener('change', () => { $('comparison-controls').hidden = !$('compare').checked; paint(); });
$('fork').addEventListener('click', () => { send('fork'); feedback('The comparison now starts from the main solution’s current state.'); });
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(paint, 100); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && frame?.running) { send('run', { running: false }); feedback('Paused while this tab is in the background.'); }
});
function solverError(message) {
  if(!solverFault)send('run',{running:false});
  solverFault=true;
  $('inspection-error').textContent=message;$('inspection-error').hidden=false;
  operations.forEach(name=>{$(`${name}-operation`).hidden=true;});
  $('freeze').disabled=true;
  $('status').textContent = 'Stopped'; $('status-dot').classList.remove('running');
  for (const id of ['run', 'step', 'apply-step']) $(id).disabled = true;
  feedback(message, true);
}
try {
  worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'error') { solverError(data.message); return; }
    if (data.type !== 'frame' || data.revision !== revision) return;
    if (solverFault) return;
    frame = data; methods = [...frame.methods]; integrator=frame.cfg.integrator;
    $('method-a').value = methods[0]; $('method-b').value = methods[1];
    paint();
  };
  worker.onerror = () => solverError('The solver could not load. Serve this page over HTTP with module workers enabled.');
  restart('Press Run, or advance one time step at a time.');
} catch (error) { solverError(error.message); }
