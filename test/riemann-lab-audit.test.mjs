import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { GAMMA, CFL, METHODS, TIME_METHODS, PROBLEMS, NONLINEAR, Experiment, primitiveToConserved, conservedToPrimitive, physicalFlux, hlle, exactAverages, exactEuler, exactReferenceAvailable, totals, nonlinearFace, inspectSubstep, stableDt } from '../static/outreach/riemann-lab/core.mjs';
import { reconstructionMarkup } from '../static/outreach/riemann-lab/reconstruction-math.mjs';

const close=(actual,expected,tol=3e-12)=>assert.ok(Math.abs(actual-expected)<=tol*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);

test('independent analytic cell integrals agree with all scalar initial/reference averages',()=>{
  for(const n of [16,32,64,128,256,512])for(const displacement of [-1.13,-0.33,0,0.17,0.91,2.1]){
    const sine=exactAverages('sine',n,0.7,displacement),square=exactAverages('square',n,0.7,displacement);
    for(let i=0;i<n;i++){
      const l=i/n,r=(i+1)/n;
      const sineMean=0.55+0.35*n/(2*Math.PI)*(Math.cos(2*Math.PI*(l-displacement-0.15))-Math.cos(2*Math.PI*(r-displacement-0.15)));
      close(sine[i],sineMean);
      let length=0;
      for(let shift=-4;shift<=4;shift++)length+=Math.max(0,Math.min(r,0.45+displacement+shift)-Math.max(l,0.2+displacement+shift));
      close(square[i],0.2+0.8*n*length);
    }
    close(totals(sine,n,1)[0],0.55);close(totals(square,n,1)[0],0.4);
    close(totals(exactAverages('gaussian',n,0.7,displacement),n,1)[0],0.2+0.8*0.075*Math.sqrt(Math.PI));
  }
});

test('Euler conversion, physical flux and supersonic HLLE branches agree with analytic identities',()=>{
  for(const rho of [0.125,0.445,1,8])for(const u of [-4,-0.1,0,3])for(const p of [0.1,1,3.528]){
    const q=[rho,u,p],U=primitiveToConserved(q),back=conservedToPrimitive(U),f=physicalFlux(q);
    back.forEach((v,k)=>close(v,q[k]));
    close(U[2],p/(GAMMA-1)+rho*u*u/2);
    [rho*u,rho*u*u+p,u*(GAMMA*p/(GAMMA-1)+rho*u*u/2)].forEach((v,k)=>close(f[k],v));
    hlle(q,q).forEach((v,k)=>close(v,f[k]));
  }
  for(const sign of [-1,1]){
    const l=[1,10*sign,1],r=[0.4,9*sign,0.4];
    hlle(l,r).forEach((v,k)=>close(v,physicalFlux(sign>0?l:r)[k]));
  }
});

test('HLLE satisfies both jump relations of its intermediate state and reflects correctly',()=>{
  for(const [l,r] of [[PROBLEMS.sod.left,PROBLEMS.sod.right],[PROBLEMS.lax.left,PROBLEMS.lax.right],[[2,-0.3,0.5],[0.3,0.4,2]]]){
    const Ul=primitiveToConserved(l),Ur=primitiveToConserved(r),Fl=physicalFlux(l),Fr=physicalFlux(r);
    const rootL=Math.sqrt(l[0]),rootR=Math.sqrt(r[0]);
    const u=(rootL*l[1]+rootR*r[1])/(rootL+rootR);
    const h=(rootL*(Ul[2]+l[2])/l[0]+rootR*(Ur[2]+r[2])/r[0])/(rootL+rootR);
    const c=Math.sqrt((GAMMA-1)*(h-u*u/2));
    const sl=Math.min(l[1]-Math.sqrt(GAMMA*l[2]/l[0]),r[1]-Math.sqrt(GAMMA*r[2]/r[0]),u-c);
    const sr=Math.max(l[1]+Math.sqrt(GAMMA*l[2]/l[0]),r[1]+Math.sqrt(GAMMA*r[2]/r[0]),u+c);
    const flux=hlle(l,r);
    for(let k=0;k<3;k++){
      const star=(sr*Ur[k]-sl*Ul[k]+Fl[k]-Fr[k])/(sr-sl);
      close(flux[k],Fl[k]+sl*(star-Ul[k]));close(flux[k],Fr[k]+sr*(star-Ur[k]));
    }
    const reflected=hlle([r[0],-r[1],r[2]],[l[0],-l[1],l[2]]);
    reflected.forEach((v,k)=>close(v,(k===1?1:-1)*flux[k]));
  }
});

test('finite-volume flux signs, periodic endpoints and all conserved derivatives telescope',()=>{
  const n=16,U=Float64Array.from({length:n},(_,i)=>0.7+0.1*Math.sin(2*Math.PI*i/n));
  for(const speed of [-1,0,1]){
    const cfg={n,nv:1,speed,problem:'sine'},view=inspectSubstep(U,cfg,'pcm',0);
    for(let i=0;i<n;i++){
      const expected=speed>=0?-speed*n*(U[i]-U[(i+n-1)%n]):-speed*n*(U[(i+1)%n]-U[i]);
      close(view.d[i],expected);
    }
    close(view.flux[0],view.flux[n]);
    close(stableDt(U,cfg),CFL/(n*Math.max(Math.abs(speed),1e-12)));
  }
  const gas=Float64Array.from({length:3*n},(_,j)=>{
    const i=Math.floor(j/3),q=[1+0.1*Math.sin(2*Math.PI*i/n),0.1*Math.cos(2*Math.PI*i/n),1+0.05*Math.sin(4*Math.PI*i/n)];
    return primitiveToConserved(q)[j%3];
  });
  for(const method of Object.keys(METHODS))for(const problem of ['sine','sod']){
    if(problem==='sod'&&METHODS[method].scalarOnly)continue;
    const cfg={n,nv:3,speed:1,problem},view=inspectSubstep(gas,cfg,method,0);
    totals(view.d,n,3).forEach((v,k)=>close(v,view.boundary[k]));
    if(problem==='sine')for(let k=0;k<3;k++)close(view.flux[k],view.flux[n*3+k]);
  }
});

test('both exact shock-tube references satisfy shock jumps, fan invariants and global conservation',()=>{
  for(const problem of ['sod','lax']){
    const {left:l,right:r,end:T}=PROBLEMS[problem],model=exactEuler(problem);
    for(const speed of model.speeds){
      const a=model.sample(speed-1e-7),b=model.sample(speed+1e-7);
      if(Math.abs(a[0]-b[0])<1e-5)continue;
      const Ua=primitiveToConserved(a),Ub=primitiveToConserved(b),Fa=physicalFlux(a),Fb=physicalFlux(b);
      for(let k=0;k<3;k++)close(Fb[k]-Fa[k],speed*(Ub[k]-Ua[k]),2e-7);
    }
    const head=l[1]-Math.sqrt(GAMMA*l[2]/l[0]),tail=model.speeds[1];
    for(const fraction of [0.2,0.5,0.8]){
      const q=model.sample(head+(tail-head)*fraction),c=Math.sqrt(GAMMA*q[2]/q[0]);
      close(q[2]/q[0]**GAMMA,l[2]/l[0]**GAMMA);
      close(q[1]+2*c/(GAMMA-1),l[1]+2*Math.sqrt(GAMMA*l[2]/l[0])/(GAMMA-1));
    }
    const initial=totals(exactAverages(problem,64),64,3),reference=totals(exactAverages(problem,64,T),64,3);
    const Fl=physicalFlux(l),Fr=physicalFlux(r);
    reference.forEach((v,k)=>close(v,initial[k]+T*(Fl[k]-Fr[k])));
  }
});

test('nonlinear face values and weights match independent expanded formulas',()=>{
  for(const method of ['wenoz','teno5'])for(let sample=0;sample<80;sample++){
    const v=Array.from({length:5},(_,k)=>Math.sin(sample*1.7+k*0.8)*(1+sample%7)+0.1*k),[a,b,c,d,e]=v;
    const candidate=[(2*a-7*b+11*c)/6,(-b+5*c+2*d)/6,(2*c+5*d-e)/6];
    const beta=[13/12*(a-2*b+c)**2+(a-4*b+3*c)**2/4,13/12*(b-2*c+d)**2+(b-d)**2/4,13/12*(c-2*d+e)**2+(3*c-4*d+e)**2/4];
    const tau=Math.abs(beta[0]-beta[2]),optimal=[0.1,0.6,0.3],data=nonlinearFace(v,method);
    let alpha;
    if(method==='wenoz')alpha=beta.map((x,k)=>optimal[k]*(1+(tau/(x+NONLINEAR.epsilon))**2));
    else{
      const g=beta.map(x=>(1+tau/(x+NONLINEAR.epsilon))**6),sum=g.reduce((a,b)=>a+b,0);
      alpha=g.map((x,k)=>x/sum>=1e-5?optimal[k]:0);
    }
    const norm=alpha.reduce((a,b)=>a+b,0),weights=alpha.map(x=>x/norm);
    candidate.forEach((v,k)=>close(v,data.candidates[k]));beta.forEach((v,k)=>close(v,data.beta[k]));
    weights.forEach((v,k)=>close(v,data.weights[k]));
    close(data.value,weights.reduce((s,w,k)=>s+w*candidate[k],0));close(data.weights.reduce((a,b)=>a+b,0),1);
  }
});

test('explicit RK tableaus satisfy all rooted-tree order conditions through their claimed order',()=>{
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),mul=(A,v)=>A.map(row=>dot(row,v)),powers=(v,p)=>v.map(x=>x**p);
  for(const rk of Object.values(TIME_METHODS)){
    const s=rk.b.length,A=rk.a.map((row,i)=>Array.from({length:s},(_,j)=>row[j]??0)),one=Array(s).fill(1),c=mul(A,one),Ac=mul(A,c);
    close(dot(rk.b,one),1);
    A.forEach((row,i)=>row.forEach((v,j)=>{if(j>=i)assert.equal(v,0);}));
    if(rk.order>=2)close(dot(rk.b,c),1/2);
    if(rk.order>=3){close(dot(rk.b,powers(c,2)),1/3);close(dot(rk.b,Ac),1/6);}
    if(rk.order>=4){
      close(dot(rk.b,powers(c,3)),1/4);close(dot(rk.b,c.map((v,i)=>v*Ac[i])),1/8);
      close(dot(rk.b,mul(A,powers(c,2))),1/12);close(dot(rk.b,mul(A,Ac)),1/24);
    }
  }
});

function workerHarness(){
  let now=0,tick;
  const frames=[],context={Experiment,PROBLEMS,stableDt,self:{},performance:{now:()=>now},postMessage:frame=>frames.push(structuredClone(frame)),setTimeout:fn=>{tick=fn;}};
  const source=readFileSync(new URL('../static/outreach/riemann-lab/worker.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
  runInNewContext(source,context);
  return {send:data=>context.self.onmessage({data}),tick:ms=>{now+=ms;tick();},frames};
}
test('continuous worker playback is identical across speeds beyond the former end time',()=>{
  const results=[];
  for(const playback of [0.5,1,4]){
    const worker=workerHarness();
    worker.send({type:'init',revision:1,config:{problem:'square',n:16,methods:['wenoz','teno5'],integrator:'ssprk3'}});
    worker.send({type:'playback',revision:1,value:playback});worker.send({type:'run',revision:1,running:true});
    for(let i=0;i<6000&&worker.frames.at(-1).steps<100;i++){
      worker.tick([10,23,40,16,8][i%5]);
      worker.send({type:'playback',revision:1,value:playback});
    }
    const result=worker.frames.at(-1);
    assert.equal(result.type,'frame');assert.equal(result.running,true);close(result.time,100*CFL/16);assert.equal(result.steps,100);
    results.push(result);
  }
  for(const result of results.slice(1)){assert.deepEqual(result.states,results[0].states);assert.equal(result.steps,results[0].steps);}
});

test('worker rejects stale revisions and preserves state on paused method/RK changes',()=>{
  const worker=workerHarness();
  worker.send({type:'init',revision:7,config:{problem:'sod',n:16}});
  worker.send({type:'step',revision:7});const before=worker.frames.at(-1);
  worker.send({type:'integrator',revision:6,integrator:'rk4'});assert.equal(worker.frames.at(-1).cfg.integrator,'ssprk3');
  worker.send({type:'integrator',revision:7,integrator:'rk4'});
  worker.send({type:'method',revision:7,run:0,method:'teno5'});const after=worker.frames.at(-1);
  assert.deepEqual(after.states,before.states);assert.equal(after.time,before.time);assert.equal(after.cfg.integrator,'rk4');
});

test('every scalar and Euler reconstruction equation compiles as strict LaTeX with MathML',()=>{
  for(const method of Object.keys(METHODS))for(const nv of [1,3]){
    const html=reconstructionMarkup(method,nv);
    assert.match(html,/<math/);assert.doesNotMatch(html,/katex-error/);
  }
});

test('an invalid initial face state stops before a Riemann flux without changing the stored state',()=>{
  const e=new Experiment({problem:'sod',n:64,methods:['teno5','teno5'],integrator:'euler'});
  let stopped=false;
  for(let i=0;i<100&&!stopped;i++){
    const before=e.states.map(u=>u.slice()),time=e.time;
    try{e.step();}catch(error){
      assert.match(error.message,/Nonpositive density or pressure at reconstructed face/);
      assert.deepEqual(e.states,before);assert.equal(e.time,time);assert.ok(e.states.every(u=>u.every(Number.isFinite)));
      stopped=true;
    }
  }
  assert.equal(stopped,true);
});

test('the worker latches a numerical stop, preserves its last state and recovers through initialization',()=>{
  const worker=workerHarness();
  worker.send({type:'init',revision:1,config:{problem:'sod',n:64,methods:['teno5','teno5'],integrator:'euler'}});
  for(let i=0;i<100&&worker.frames.at(-1).type!=='error';i++)worker.send({type:'step',revision:1});
  assert.equal(worker.frames.at(-1).type,'error');
  assert.match(worker.frames.at(-1).message,/reconstructed face/);
  const count=worker.frames.length;
  worker.send({type:'step',revision:1});assert.equal(worker.frames.length,count);
  worker.send({type:'init',revision:2,config:{problem:'sod',n:64,methods:['teno5','teno5'],integrator:'ssprk3'}});
  worker.send({type:'step',revision:2});
  assert.equal(worker.frames.at(-1).type,'frame');assert.ok(worker.frames.at(-1).time>0);
});

test('a comparison reconstruction failure identifies its solve and cannot partially advance the main solve',()=>{
  const e=new Experiment({problem:'sod',n:64,methods:['pcm','teno5'],integrator:'euler'});
  let stopped=false;
  for(let i=0;i<150&&!stopped;i++){
    const before=e.states.map(u=>u.slice()),time=e.time;
    try{e.step();}catch(error){
      assert.match(error.message,/Comparison solve \(TENO5\)/);
      assert.deepEqual(e.states,before);assert.equal(e.time,time);stopped=true;
    }
  }
  assert.equal(stopped,true);
});


test('continuous playback pauses, resumes, and single-steps without resetting at the former horizon',()=>{
  const worker=workerHarness();
  worker.send({type:'init',revision:1,config:{problem:'sine',n:16}});
  for(let i=0;i<60;i++)worker.send({type:'step',revision:1});
  const before=worker.frames.at(-1);assert.ok(before.time>1);
  worker.send({type:'run',revision:1,running:true});
  for(let i=0;i<100;i++)worker.tick(50);
  worker.send({type:'run',revision:1,running:false});
  const paused=worker.frames.at(-1);assert.ok(paused.time>before.time);
  for(let i=0;i<100;i++)worker.tick(50);
  assert.deepEqual(worker.frames.at(-1),paused);
  worker.send({type:'step',revision:1});
  const stepped=worker.frames.at(-1);assert.equal(stepped.steps,paused.steps+1);assert.equal(stepped.running,false);
  worker.send({type:'run',revision:1,running:true});
  for(let i=0;i<100;i++)worker.tick(50);
  assert.ok(worker.frames.at(-1).time>stepped.time);assert.equal(worker.frames.at(-1).running,true);
});

test('all examples evolve beyond their audit horizons with conserved boundary budgets',()=>{
  for(const problem of Object.keys(PROBLEMS)){
    const e=new Experiment({problem,n:16,methods:['pcm','mc']});
    const target=3*PROBLEMS[problem].end;
    while(e.time<target-1e-14)assert.ok(e.step(target-e.time)>0);
    close(e.time,target);
    for(let run=0;run<2;run++){
      assert.ok(e.states[run].every(Number.isFinite));
      const sum=totals(e.states[run],e.cfg.n,e.cfg.nv);
      sum.forEach((v,k)=>close(v,e.initial[k]+e.boundaries[run][k],1e-11));
    }
    assert.ok(e.step()>0);
  }
});

test('shock-tube reference diagnostics stop at first boundary interaction; scalar references remain available',()=>{
  for(const problem of ['sod','lax']){
    const boundaryTime=0.5/Math.max(...exactEuler(problem).speeds.map(Math.abs));
    assert.ok(exactReferenceAvailable(problem,boundaryTime-1e-8));
    assert.equal(exactReferenceAvailable(problem,boundaryTime+1e-8),false);
    const e=new Experiment({problem,n:16});
    while(e.time<=boundaryTime)e.step();
    for(const d of e.diagnostics()){assert.equal(d.l1,null);assert.ok(Number.isFinite(d.balance));}
  }
  assert.ok(exactReferenceAvailable('square',10000));
});
