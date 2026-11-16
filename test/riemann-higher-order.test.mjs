import test from 'node:test';
import assert from 'node:assert/strict';
import { METHODS, Experiment, facePolynomial, faceProfileValue, faceStencil, candidateProfileValue, nonlinearFace, reconstruct, exactAverages, stableDt, totals, inspectSubstep, ReconstructionError } from '../static/outreach/riemann-lab/core.mjs';
import { HIGH_METHODS, reconstructionSpec, smoothness, polynomialFromMeans, mpLimit } from '../static/outreach/riemann-lab/higher-order.mjs';
import { TABLES } from '../static/outreach/riemann-lab/reconstruction-tables.mjs';
const close=(a,b,tol=3e-11)=>assert.ok(Math.abs(a-b)<tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const integral=(c,a,b)=>c.reduce((s,v,k)=>s+v*(b**(k+1)-a**(k+1))/(k+1),0);
const methods=Object.keys(HIGH_METHODS);

test('every new candidate matches its finite-volume means, including reflected and ghost stencils',()=>{
 for(const method of methods)for(const periodic of [true,false])for(const cell of [0,7,15])for(const side of ['left','right']){
  const q=Float64Array.from({length:16},(_,i)=>.8+.2*Math.sin(i*.7));
  const data=faceStencil(q,16,1,method,cell,side,0,periodic),p=data.polynomial;
  for(let k=0;k<data.candidates.length;k++){
   const c=p.candidateCoefficients[k];
   close(integral(c,-.5,.5),q[cell]);
   if(method==='cweno5'&&k===0)continue; // corrected central polynomial, not the full interpolant
   for(const [j,off] of data.candidates[k].offsets.entries())close(integral(c,off-.5,off+.5),q[data.candidates[k].indices[j]]);
   close(candidateProfileValue(p,k,.5),p.candidates[k]);
  }
  if(method!=='mp5')close(faceProfileValue(p,side==='right'?1:0),p.value);
 }
});

test('optimal WENO5/7/9 and TENO6 face weights reproduce all polynomials through the design degree',()=>{
 for(const method of ['wenojs5','wenojs7','wenojs9','teno6']){
  const spec=reconstructionSpec(method),degree=spec.offsets.length-1;
  for(let power=0;power<=degree;power++){
   const v=spec.offsets.map(o=>((o+.5)**(power+1)-(o-.5)**(power+1))/(power+1));
   const p=nonlinearFace(v,method);
   close(p.candidates.reduce((s,x,k)=>s+spec.optimal[k]*x,0),.5**power,1e-9);
  }
 }
 assert.deepEqual(reconstructionSpec('teno6').candidates,[[-2,-1,0],[-1,0,1],[0,1,2],[0,1,2,3]]);
 assert.deepEqual(reconstructionSpec('teno6').optimal,[.05,.45,.3,.2]);
});

test('smoothness factors equal independent derivative-product integration and remain nonnegative',()=>{
 for(let degree=1;degree<=8;degree++){
  const c=Array.from({length:degree+1},(_,i)=>Math.sin(2*i+degree));let beta=0;
  let derivative=c;
  for(let order=1;order<=degree;order++){
   derivative=derivative.slice(1).map((v,i)=>v*(i+1));
   const square=Array(derivative.length*2-1).fill(0);
   derivative.forEach((a,i)=>derivative.forEach((b,j)=>square[i+j]+=a*b));
   beta+=integral(square,-.5,.5);
  }
  close(smoothness(c),beta);assert.ok(smoothness(c)>=0);
 }
});

test('WENO-JS weights and TENO6 cutoff follow independent published definitions',()=>{
 for(const method of ['wenojs5','wenojs7','wenojs9','teno6']){
  const spec=reconstructionSpec(method),v=spec.offsets.map(o=>o<1?.7+.01*o:1.8),p=nonlinearFace(v,method);
  let alpha;
  if(method==='teno6'){
   const tau=Math.abs(smoothness(polynomialFromMeans(v,spec.offsets))-(p.beta[0]+4*p.beta[1]+p.beta[2])/6);close(p.tau,tau);
   const gamma=p.beta.map(b=>(1+tau/(b+1e-40))**6),sum=gamma.reduce((a,b)=>a+b,0);
   const keep=gamma.map(g=>g/sum>=1e-7?1:0);assert.deepEqual(p.keep,keep);
   assert.ok(keep.includes(0)&&keep.includes(1));alpha=spec.optimal.map((d,k)=>d*keep[k]);
  }else alpha=spec.optimal.map((d,k)=>d/(p.beta[k]+1e-6)**2);
  const sum=alpha.reduce((a,b)=>a+b,0);alpha.forEach((a,k)=>close(p.weights[k],a/sum));
 }
});

test('all new methods preserve constant states exactly at both orientations',()=>{
 for(const method of methods){
  const q=new Float64Array(16).fill(1.2),rec=reconstruct(q,16,1,method,true);
  for(const a of [rec.left,rec.right])for(const v of a)assert.equal(v,1.2,method);
 }
});

test('CWENO produces one mean-preserving cell polynomial for both faces and interiors',()=>{
 const q=exactAverages('gaussian',64),rec=reconstruct(q,64,1,'cweno5',true);
 for(let i=0;i<64;i++){
  const r=facePolynomial(q,64,1,'cweno5',i),l=facePolynomial(q,64,1,'cweno5',i,'left');
  close(integral(r.coefficients,-.5,.5),q[i]);
  close(rec.left[i],faceProfileValue(r,0));close(rec.right[i],faceProfileValue(r,1));
  for(const x of [0,.17,.5,.83,1])close(faceProfileValue(l,x),faceProfileValue(r,x));
 }
});

test('new reconstructions attain their smooth face orders with independently integrated exponential data',()=>{
 for(const [method,order] of Object.entries({linear5:5,mp5:5,wenojs5:5,wenojs7:7,wenojs9:9,cweno5:5,teno6:6})){
  const errors=[];
  for(const n of [16,32,64]){
   const dx=1/n,cell=n/2,frequency=3;
   const q=Float64Array.from({length:n},(_,i)=>Math.exp(frequency*i*dx)*Math.expm1(frequency*dx)/(frequency*dx));
   const p=facePolynomial(q,n,1,method,cell);
   errors.push(Math.abs(p.value-Math.exp(frequency*(cell+1)*dx)));
  }
  // Use the first refinement before round-off dominates ninth-order differences.
  const observed=Math.log2(errors[0]/errors[1]);assert.ok(observed>order-.6,`${method}: ${observed}, ${errors}`);
 }
});

test('MP5 accepts smooth extrema, limits a jump and changes the common CFL without resetting state',()=>{
 const smooth=[-4,-1,0,-1,-4],raw=nonlinearFace(smooth,'linear5').value,p=mpLimit(smooth,raw);
 close(p.value,raw);
 const v=[0,0,1,1,1],u=nonlinearFace(v,'linear5'),limited=mpLimit(v,u.value);
 assert.ok(u.value>1);assert.ok(limited.value<=1);assert.ok(limited.value>=limited.lower&&limited.value<=limited.upper);
 const e=new Experiment({n:16});e.step();const state=e.states.map(u=>u.slice()),time=e.time;
 e.setMethod(1,'mp5');assert.equal(e.cfg.cfl,.2);close(stableDt(e.states[0],e.cfg),.2/16);
 assert.equal(e.time,time);assert.deepEqual(e.states,state);e.setMethod(1,'mc');assert.equal(e.cfg.cfl,.35);
});

test('unlimited fifth-order scalar solve exposes ringing but cannot be selected for gas dynamics',()=>{
 const e=new Experiment({problem:'square',n:64,methods:['linear5','mp5']});for(let i=0;i<20;i++)e.step();
 assert.ok(Math.max(...e.states[0])>1.01);e.states.forEach(u=>close(totals(u,64,1)[0],.4));
 assert.throws(()=>new Experiment({problem:'sod',methods:['linear5','pcm']}),/advection-only/);
 const gas=new Experiment({problem:'sod'});assert.throws(()=>gas.setMethod(0,'linear5'),/advection-only/);
});

test('TENO6 with Forward Euler stops atomically on a nonpositive face in the 64-cell Sod case',()=>{
 const e=new Experiment({problem:'sod',n:64,methods:['pcm','teno6'],integrator:'euler'});let stopped=false;
 for(let i=0;i<150&&!stopped;i++){
  const state=e.states.map(u=>u.slice()),time=e.time;
  try{e.step();}catch(error){assert.ok(error instanceof ReconstructionError);assert.match(error.message,/Comparison solve \(TENO6\)/);assert.deepEqual(e.states,state);assert.equal(e.time,time);stopped=true;}
 }
 assert.ok(stopped);
});
