import test from 'node:test';
import assert from 'node:assert/strict';
import { Experiment, METHODS, PROBLEMS, exactEuler, exactAverages, reconstruct, profileValue,
  primitiveToConserved, physicalFlux, hlle, admissible, rkStep, stableDt, inspectSubstep,
  nonlinearFace, facePolynomial, faceProfileValue, exactPoint, GRID_SIZES, TIME_METHODS,
  faceStencil, candidateProfileValue, quarticFromAverages, polynomialValue, exactValueRange, rangeExcess, totals } from '../static/outreach/riemann-lab/core.mjs';

function advance(e, t = PROBLEMS[e.cfg.problem].end) {
  while (e.time < t - 1e-14) assert.ok(e.step(t - e.time) > 0);
}
const supported = problem => Object.keys(METHODS).filter(m=>PROBLEMS[problem].equation!=='euler'||!METHODS[m].scalarOnly);
const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

test('square-pulse initialization uses cell averages, including partly filled cells', () => {
  for (const n of [64, 128, 256, 512]) {
    const U = exactAverages('square', n);
    close(U.reduce((a, b) => a + b, 0) / n, 0.4);
    assert.ok(U.some(v => v > 0.2 + 1e-9 && v < 1 - 1e-9));
    const shifted = exactAverages('square', n, 0, 0.713);
    close(shifted.reduce((a, b) => a + b, 0) / n, 0.4);
  }
});

test('TVD linear and monotone parabolic profiles retain their cell mean and neighbor envelope', () => {
  const n = 64, U = exactAverages('gaussian', n);
  for (const method of Object.keys(METHODS).filter(m => !METHODS[m].faceBased)) {
    const rec = reconstruct(U, n, 1, method, true);
    for (let i = 0; i < n; i++) {
      const l = rec.left[i], r = rec.right[i], v = U[i];
      // Simpson integration is exact for a quadratic, independent of the edge algorithm.
      close((profileValue(v, l, r, 0, method) + 4 * profileValue(v, l, r, 0.5, method)
        + profileValue(v, l, r, 1, method)) / 6, v);
      const neighbors = [U[(i + n - 1) % n], v, U[(i + 1) % n]];
      for (let j = 0; j <= 20; j++) {
        const y = profileValue(v, l, r, j / 20, method);
        assert.ok(y >= Math.min(...neighbors) - 1e-12 && y <= Math.max(...neighbors) + 1e-12);
      }
    }
  }
});

test('Euler numerical flux is consistent and uniform gas remains uniform', () => {
  const q = [0.9, -0.3, 1.2], u = primitiveToConserved(q), cfg = { problem: 'sod', n: 64, nv: 3, speed: 0 };
  const f = physicalFlux(q), numerical = hlle(q, q);
  f.forEach((v, k) => close(v, numerical[k]));
  const U = Float64Array.from({ length: 64 * 3 }, (_, j) => u[j % 3]);
  for (const method of Object.keys(METHODS)) {
    const next = rkStep(U, cfg, method, 0.001);
    assert.ok(next); next.U.forEach((v, k) => close(v, U[k]));
  }
});

test('Sod exact reference has the correct star state and satisfies the shock jump conditions', () => {
  const model = exactEuler('sod');
  close(model.p, 0.3031301780506468);
  close(model.u, 0.9274526200489499);
  const s = model.speeds.at(-1), left = model.sample(s - 1e-6), right = model.sample(s + 1e-6);
  const ul = primitiveToConserved(left), ur = primitiveToConserved(right);
  const fl = physicalFlux(left), fr = physicalFlux(right);
  for (let k = 0; k < 3; k++) close(s * (ur[k] - ul[k]), fr[k] - fl[k]);
  close(model.sample(-10)[0], 1); close(model.sample(10)[0], 0.125);
});

test('all reconstructions finish advection and shock tubes with conservation and positive gas states', () => {
  for (const problem of ['gaussian', 'square', 'sod', 'lax']) {
    for (const n of [64, 256]) for (const method of supported(problem)) {
      const e = new Experiment({ problem, n, methods: [method, method] });
      advance(e);
      assert.ok(e.states.every(u => admissible(u, e.cfg.nv)), `${problem}/${n}/${method}`);
      assert.ok(e.diagnostics().every(d => d.balance < 2e-12), `${problem}/${n}/${method} conservation`);
      assert.equal(e.retries, 0, `${problem}/${n}/${method} time-step retries`);
    }
  }
});

test('smooth advection converges with refinement and higher-order reconstruction reduces error', () => {
  const errors = [];
  for (const n of [64, 128, 256]) {
    const e = new Experiment({ problem: 'sine', n, methods: ['mc', 'ppm'] });
    advance(e, 0.3); errors.push(e.diagnostics().map(d => d.l1));
  }
  for (let j = 1; j < errors.length; j++) {
    assert.ok(errors[j - 1][0] / errors[j][0] > 3.5, 'PLM MC convergence near second order');
    assert.ok(errors[j - 1][1] / errors[j][1] > 4, 'PPM error converges despite limiting at extrema');
  }
  const e = new Experiment({ methods: ['pcm', 'ppm'] });
  advance(e);
  assert.ok(e.diagnostics()[1].l1 < e.diagnostics()[0].l1 / 10);
});

test('live method switching retains the current conserved states and time, then changes future fluxes', () => {
  const e = new Experiment({ methods: ['pcm', 'pcm'] });
  advance(e, 0.1);
  const before = e.states.map(u => u.slice()), time = e.time;
  e.setMethod(1, 'ppm');
  assert.deepEqual(e.states, before);
  assert.equal(e.time, time);
  assert.equal(e.history[0].time, time);
  e.step();
  assert.notDeepEqual(e.states[0], e.states[1]);
  e.fork();
  assert.deepEqual(e.states[0], e.states[1]);
  assert.deepEqual(e.methods, ['pcm', 'ppm']);
  assert.ok(e.diagnostics().every(d => d.balance < 1e-12));
});

test('reversing transport tracks accumulated displacement and zero speed leaves the signal unchanged', () => {
  const e = new Experiment({ problem: 'sine', methods: ['mc', 'ppm'] });
  advance(e, 0.1); e.setSpeed(-1); advance(e, 0.2);
  close(e.displacement, 0);
  assert.ok(e.diagnostics().every(d => d.l1 < 0.001));
  e.setSpeed(0);
  const before = e.states.map(u => u.slice());
  e.step(0.01);
  e.states.forEach((u, run) => u.forEach((v, i) => close(v, before[run][i])));
  close(e.displacement, 0);
});

test('512-cell grid supports a mixed-method Euler solve', () => {
  const e = new Experiment({ problem: 'sod', n: 512, methods: ['minmod', 'ppm'] });
  advance(e);
  assert.ok(e.diagnostics().every(d => d.l1 < 0.003 && d.balance < 2e-12));
});

test('walkthrough data use the actual conservative flux balance and preserve the current state', () => {
  for (const problem of ['gaussian', 'square', 'sod', 'lax']) for (const method of supported(problem)) {
    const e = new Experiment({ problem, n: 64, methods: [method, method], speed: -1 });
    const before = e.states[0].slice(), { n, nv } = e.cfg;
    const dt = stableDt(before, e.cfg), view = inspectSubstep(before, e.cfg, method, dt);
    assert.deepEqual(e.states[0], before, 'inspecting does not advance or mutate the solve');
    for (let k = 0; k < nv; k++) {
      let totalChange = 0;
      for (let i = 0; i < n; i++) {
        close(view.first[i * nv + k] - before[i * nv + k],
          dt * n * (view.flux[i * nv + k] - view.flux[(i + 1) * nv + k]));
        totalChange += (view.first[i * nv + k] - before[i * nv + k]) / n;
      }
      close(totalChange, dt * (view.flux[k] - view.flux[n * nv + k]));
    }
    if (nv === 1) for (let j = 1; j < n; j++)
      close(view.flux[j], -view.left[j], 1e-12); // negative advection picks the right cell's left face
  }
});

test('16- and 32-cell grids support every reconstruction and every offered problem', () => {
  assert.deepEqual(GRID_SIZES, [16, 32, 64, 128, 256, 512, 1024, 2048, 4096]);
  for (const problem of Object.keys(PROBLEMS)) for (const n of [16, 32])
    for (const method of supported(problem)) {
      const e = new Experiment({ problem, n, methods: [method, method] });
      advance(e);
      assert.ok(e.states.every(u => admissible(u, e.cfg.nv)), `${problem}/${n}/${method}`);
      assert.ok(e.diagnostics().every(d => d.balance < 2e-12), `${problem}/${n}/${method} mass balance`);
    }
});

test('WENO-Z and TENO5 weights recover optimal smooth weights and exclude a discontinuous stencil', () => {
  for (const method of ['wenoz', 'teno5']) {
    const smooth = nonlinearFace([4, 1, 0, 1, 4], method);
    smooth.weights.forEach((w, k) => close(w, [0.1, 0.6, 0.3][k]));
    close(smooth.value, 1 / 6);
    const jump = nonlinearFace([1, 1, 1, 0, 0], method);
    close(jump.weights.reduce((s, w) => s + w, 0), 1);
    assert.ok(jump.weights.every(w => w >= 0 && w <= 1));
    assert.ok(jump.weights[0] > 1 - 1e-12);
    if (method === 'teno5') assert.deepEqual(jump.keep, [1, 0, 0]);
    else assert.ok(jump.weights[1] > 0 && jump.weights[2] > 0);
    const flat = nonlinearFace([0.2, 0.2, 0.2, 0.2, 0.2], method);
    assert.deepEqual(flat.beta, [0, 0, 0]);
    flat.weights.forEach((w, k) => close(w, [0.1, 0.6, 0.3][k]));
  }
});

test('face-oriented WENO/TENO plots have the stored mean and match actual face states in both directions', () => {
  const n = 32, q = exactAverages('gaussian', n);
  for (const method of ['wenoz', 'teno5']) {
    const rec = reconstruct(q, n, 1, method, true);
    const reversed = reconstruct(q.slice().reverse(), n, 1, method, true);
    for (let i = 0; i < n; i++) for (const side of ['left', 'right']) {
      const p = facePolynomial(q, n, 1, method, i, side, 0, true);
      close((faceProfileValue(p, 0) + 4 * faceProfileValue(p, 0.5) + faceProfileValue(p, 1)) / 6, q[i]);
      close(faceProfileValue(p, side === 'left' ? 0 : 1), rec[side][i]);
      close(rec[side][i], reversed[side === 'left' ? 'right' : 'left'][n - 1 - i]);
    }
    assert.throws(() => profileValue(1, 0.9, 1.1, 0.5, method), /face-specific/);
  }
});

test('WENO-Z5 and TENO5 scalar face reconstructions converge at fifth order, including reflected faces', () => {
  for (const method of ['wenoz', 'teno5']) {
    let previous;
    for (const n of [16, 32, 64, 128]) {
      const q = exactAverages('sine', n), rec = reconstruct(q, n, 1, method, true);
      const errors = [0, 0];
      for (let i = 0; i < n; i++) {
        errors[0] += Math.abs(rec.left[i] - exactPoint('sine', i / n, 0, 0)[0]) / n;
        errors[1] += Math.abs(rec.right[i] - exactPoint('sine', (i + 1) / n, 0, 0)[0]) / n;
      }
      if (previous) errors.forEach((error, side) => assert.ok(previous[side] / error > 25, `${method}/${n}/${side}`));
      previous = errors;
    }
  }
});

test('all four RK methods attain their temporal order against an exact semidiscrete Fourier mode', () => {
  const n=16,T=0.16,theta=2*Math.PI/n;
  for(const integrator of Object.keys(TIME_METHODS)) {
    const errors=[];
    for(const count of [8,16,32]) {
      let U=exactAverages('sine',n);
      const cfg={n,nv:1,speed:1,problem:'sine',integrator};
      for(let k=0;k<count;k++) U=rkStep(U,cfg,'pcm',T/count).U;
      let error=0;
      for(let i=0;i<n;i++) {
        const expected=0.55+0.35*Math.sin(Math.PI/n)/(Math.PI/n)*Math.exp(-n*(1-Math.cos(theta))*T)
          *Math.sin(2*Math.PI*((i+0.5)/n-0.15)-n*Math.sin(theta)*T);
        error+=Math.abs(U[i]-expected)/n;
      }
      errors.push(error);
    }
    const ratio=2**TIME_METHODS[integrator].order;
    for(let j=1;j<errors.length;j++) assert.ok(errors[j-1]/errors[j]>0.94*ratio,integrator);
  }
});

test('every RK method preserves mass, momentum and energy balance on coarse Euler cases', () => {
  for(const integrator of Object.keys(TIME_METHODS)) for(const problem of ['sod','lax'])
    for(const method of supported(problem)) {
      const e=new Experiment({problem,n:16,methods:[method,method],integrator});
      advance(e);
      assert.ok(e.states.every(u=>admissible(u,3)),`${integrator}/${problem}/${method}`);
      assert.ok(e.diagnostics().every(d=>d.balance<2e-12));
      e.states.forEach((U,run)=>totals(U,16,3).forEach((v,k)=>
        close(v-e.initial[k],e.boundaries[run][k],2e-11)));
    }
});

test('RK switches preserve the current state and RK4 preview is the actual midpoint state', () => {
  const e=new Experiment({n:16,methods:['wenoz','teno5']});
  advance(e,0.1);
  const before=e.states.map(u=>u.slice()),time=e.time;
  e.setIntegrator('rk4');
  assert.deepEqual(e.states,before);assert.equal(e.time,time);
  assert.match(e.history.at(-1).text,/RK4/);
  const dt=stableDt(before[0],e.cfg),view=inspectSubstep(before[0],e.cfg,'wenoz',dt);
  close(view.stageDt,dt/2);
  view.first.forEach((v,i)=>close(v,before[0][i]+dt*view.d[i]/2));
  e.step();assert.ok(e.time>time);
});

test('whole-stencil candidate curves match all three cell averages, including reflected and ghost stencils', () => {
  const n=16,q=exactAverages('gaussian',n);
  for(const method of ['wenoz','teno5']) for(const cell of [0,5,15]) for(const side of ['left','right']) {
    const data=faceStencil(q,n,1,method,cell,side,0,true);
    assert.equal(data.cells.length,5);
    for(let k=0;k<3;k++) for(let m=0;m<3;m++) {
      const offset=k+m-2;
      const avg=(candidateProfileValue(data.polynomial,k,offset-0.5)
        +4*candidateProfileValue(data.polynomial,k,offset)
        +candidateProfileValue(data.polynomial,k,offset+0.5))/6;
      close(avg,q[data.candidates[k].indices[m]]);
    }
    close(candidateProfileValue(data.polynomial,0,0.5),data.polynomial.candidates[0]);
  }
  const donor=faceStencil(q,n,1,'teno5',0,'left',0,true);
  assert.deepEqual(donor.cells,[2,1,0,-1,-2]);
  assert.deepEqual(donor.indices,[2,1,0,15,14]);
});

test('the optional unlimited quartic matches all five cell averages', () => {
  const values=[0.2,0.3,1,0.7,0.2],coeff=quarticFromAverages(values);
  for(let i=0;i<5;i++) {
    const center=i-2,t=Math.sqrt(3/5)/2;
    const integral=(5*polynomialValue(coeff,center-t)+8*polynomialValue(coeff,center)+5*polynomialValue(coeff,center+t))/18;
    close(integral,values[i]);
  }
});

test('overshoot metrics detect TENO ringing and allow physical shock compression', () => {
  const e=new Experiment({problem:'square',n:16,methods:['teno5','ppm']});
  advance(e,0.2);
  const a=rangeExcess(e.states[0],1,exactValueRange('square',e.time));
  const b=rangeExcess(e.states[1],1,exactValueRange('square',e.time));
  assert.ok(a.overshoot>0.06&&a.overshoot<0.07);
  assert.ok(b.overshoot<1e-12);
  const physical=exactValueRange('lax',0.14);
  assert.ok(physical.max>1.3);
  assert.equal(rangeExcess(Float64Array.of(1.2),1,physical).overshoot,0);
});

test('fine grids support every reconstruction and RK method with conserved scalar means', () => {
  for(const n of [1024,2048,4096])for(const method of Object.keys(METHODS))for(const integrator of Object.keys(TIME_METHODS)){
    const e=new Experiment({problem:'square',n,methods:[method,'mc'],integrator});
    for(let step=0;step<4;step++)assert.ok(e.step()>0);
    for(const u of e.states){assert.ok(u.every(Number.isFinite));close(totals(u,n,1)[0],e.initial[0],2e-12);}
  }
});

test('fine-grid Euler steps preserve all component boundary budgets', () => {
  for(const n of [1024,2048,4096])for(const problem of ['sod','lax']){
    const e=new Experiment({problem,n,methods:['wenoz','teno5'],integrator:'ssprk3'});
    for(let step=0;step<4;step++)assert.ok(e.step()>0);
    e.states.forEach((u,run)=>{
      assert.ok(admissible(u,3));
      totals(u,n,3).forEach((v,k)=>close(v,e.initial[k]+e.boundaries[run][k],2e-11));
    });
  }
});
