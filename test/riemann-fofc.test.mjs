import test from 'node:test';
import assert from 'node:assert/strict';
import {Experiment,GAMMA,METHODS,TIME_METHODS,PROBLEMS,primitiveToConserved,physicalFlux,llf,totals,stableDt,rkStep,admissible,trialStep} from '../static/outreach/riemann-lab/core.mjs';
const close=(a,b,tol=5e-12)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
function fixture(){
  // Fixed positive but strongly varying gas; the high-order trial loses pressure.
  let seed=193,U;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(let sample=0;sample<3;sample++)U=Float64Array.from(Array.from({length:16},()=>primitiveToConserved([10**(-2+3*rand()),6*(rand()-.5),10**(-3+3*rand())])).flat());
  return U;
}
const cfgFor=integrator=>({n:16,nv:3,problem:'sod',integrator,fofc:true});

test('LLF equals the independent conservative formula and reflects correctly',()=>{
 for(const [l,r] of [[[1,.4,1],[.125,-.3,.1]],[[2,-4,3],[.7,3,.5]]]){
  const alpha=Math.max(Math.abs(l[1])+Math.sqrt(GAMMA*l[2]/l[0]),Math.abs(r[1])+Math.sqrt(GAMMA*r[2]/r[0]));
  const ul=primitiveToConserved(l),ur=primitiveToConserved(r),fl=physicalFlux(l),fr=physicalFlux(r),f=llf(l,r);
  f.forEach((v,k)=>close(v,(fl[k]+fr[k]-alpha*(ur[k]-ul[k]))/2));
  llf(l,l).forEach((v,k)=>close(v,fl[k]));
  llf([r[0],-r[1],r[2]],[l[0],-l[1],l[2]]).forEach((v,k)=>close(v,(k===1?1:-1)*f[k]));
 }
});

test('FOFC is bitwise inactive on smooth gas and all scalar reconstructions',()=>{
 for(const integrator of Object.keys(TIME_METHODS))for(const [method,meta] of Object.entries(METHODS)){
  const scalar=new Experiment({problem:'square',n:16,methods:[method,'pcm'],integrator,fofc:true});
  const a=rkStep(scalar.states[0],scalar.cfg,method,stableDt(scalar.states[0],scalar.cfg));
  const b=rkStep(scalar.states[0],{...scalar.cfg,fofc:false},method,stableDt(scalar.states[0],scalar.cfg));assert.deepEqual(a,b);
  if(meta.scalarOnly)continue;
  const cfg=cfgFor(integrator),U=Float64Array.from(Array.from({length:16},(_,i)=>primitiveToConserved([1+.03*Math.sin(i/16*2*Math.PI),.1,.9+.02*Math.cos(i/16*2*Math.PI)])).flat());
  const dt=stableDt(U,cfg),on=rkStep(U,cfg,method,dt),off=rkStep(U,{...cfg,fofc:false},method,dt);
  assert.ok(on&&off);assert.equal(on.correction.faceStages,0);assert.deepEqual(on.U,off.U);assert.deepEqual(on.boundary,off.boundary);
 }
});

test('bad trial cells correct both shared faces, recheck, and conserve all components for every RK',()=>{
 for(const integrator of Object.keys(TIME_METHODS)){
  const cfg=cfgFor(integrator),U=fixture(),saved=U.slice(),dt=stableDt(U,cfg),r=rkStep(U,cfg,'wenojs5',dt);
  assert.ok(r&&admissible(r.U,3));assert.deepEqual(U,saved);
  assert.ok(r.correction.cells.length>0);assert.ok(r.correction.passes>1);
  for(const i of r.correction.cells){assert.ok(r.correction.faces[i]&2);assert.ok(r.correction.faces[i+1]&2);}
  const before=totals(U,16,3),after=totals(r.U,16,3);after.forEach((v,k)=>close(v-before[k],r.boundary[k]));
  const trace=r.firstTrace;
  for(let j=0;j<=16;j++)if(trace.corrected[j]){
   const l=Math.max(0,j-1),rr=Math.min(15,j);
   llf(trace.q.subarray(3*l,3*l+3),trace.q.subarray(3*rr,3*rr+3)).forEach((v,k)=>close(trace.flux[3*j+k],v));
  }
  if(integrator==='euler')assert.deepEqual(r.U,trace.first);
 }
});

test('periodic FOFC shares its endpoint flux and counts that face only once',()=>{
 const raw=fixture(),U=Float64Array.from([...raw.subarray(6),...raw.subarray(0,6)]),cfg={...cfgFor('ssprk3'),problem:'sine'},r=rkStep(U,cfg,'wenojs5',stableDt(U,cfg));
 assert.ok(r&&r.correction.faceStages>0);assert.ok(admissible(r.U,3));
 assert.ok(r.firstTrace.corrected[0]>0);assert.equal(r.firstTrace.corrected[0],r.firstTrace.corrected[16]);
 for(let k=0;k<3;k++){assert.equal(r.firstTrace.flux[k],r.firstTrace.flux[48+k]);close(r.boundary[k],0);close(totals(r.U,16,3)[k],totals(U,16,3)[k]);}
});

test('known TENO5/6 Forward Euler Sod failures complete with FOFC and exact boundary accounting',()=>{
 for(const method of ['teno5','teno6']){
  const e=new Experiment({problem:'sod',n:64,methods:[method,'pcm'],integrator:'euler',fofc:true});
  while(e.time<PROBLEMS.sod.end-1e-14)e.step(PROBLEMS.sod.end-e.time);
  assert.ok(e.corrections[0].total>0);assert.equal(e.retries,0);assert.equal(e.corrections[1].total,0);
  for(let run=0;run<2;run++){assert.ok(admissible(e.states[run],3));totals(e.states[run],64,3).forEach((v,k)=>close(v-e.initial[k],e.boundaries[run][k]));}
 }
});

test('preview and solver share retries and only accepted corrections enter counters',()=>{
 const e=new Experiment({problem:'sod',n:16,methods:['wenojs5','pcm'],integrator:'rk4',fofc:true});
 e.states=[fixture(),fixture()];e.cfg.cfl=8;
 const before=e.states.map(u=>u.slice()),preview=trialStep(e.states,e.cfg,e.methods);
 assert.ok(preview.retries>0);assert.deepEqual(e.states,before);assert.equal(e.corrections[0].total,0);
 const dt=e.step();assert.equal(dt,preview.dt);assert.equal(e.retries,preview.retries);
 for(let run=0;run<2;run++){assert.deepEqual(e.states[run],preview.results[run].U);assert.equal(e.corrections[run].total,preview.results[run].correction.faceStages);}
});

test('live FOFC toggles preserve state, time, budgets and totals; restart clears counters',()=>{
 const e=new Experiment({problem:'sod',n:64,methods:['teno6','pcm'],integrator:'euler',fofc:true});
 for(let k=0;k<45;k++)e.step();assert.ok(e.corrections[0].total>0);
 const before=structuredClone({states:e.states,time:e.time,boundaries:e.boundaries,corrections:e.corrections});
 e.setFOFC(false);e.setFOFC(true);
 assert.deepEqual({states:e.states,time:e.time,boundaries:e.boundaries,corrections:e.corrections},before);
 e.fork();assert.deepEqual(e.corrections[1],e.corrections[0]);assert.deepEqual(e.states[1],e.states[0]);
 assert.equal(new Experiment({fofc:true}).corrections[0].total,0);assert.throws(()=>e.setFOFC('on'),/Invalid/);
});
