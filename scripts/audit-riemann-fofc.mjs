import {writeFileSync,mkdirSync} from 'node:fs';
import {Experiment,METHODS,TIME_METHODS,PROBLEMS,admissible,totals} from '../static/outreach/riemann-lab/core.mjs';
const cases=[];
for(const [method,meta] of Object.entries(METHODS))if(!meta.scalarOnly)
 for(const problem of ['sod','lax'])for(const integrator of Object.keys(TIME_METHODS))for(const n of [16,64])cases.push({method,problem,integrator,n});
for(const method of ['teno5','teno6'])for(const problem of ['sod','lax'])for(const n of [128,256,512])cases.push({method,problem,integrator:'euler',n});
const results=[];
for(const config of cases){
 const e=new Experiment({...config,methods:[config.method,'pcm'],fofc:true});let error=null;
 try{while(e.time<PROBLEMS[config.problem].end-1e-14)e.step(PROBLEMS[config.problem].end-e.time);}catch(err){error=err.message;}
 const balance=Math.max(...e.states.flatMap((u,run)=>Array.from(totals(u,config.n,3),(v,k)=>Math.abs(v-e.initial[k]-e.boundaries[run][k])/Math.max(1,Math.abs(e.initial[k])))));
 results.push({...config,time:e.time,steps:e.steps,retries:e.retries,correctedFaceStages:e.corrections[0].total,balance,physical:e.states.every(u=>admissible(u,3)),error});
}
const failed=results.filter(r=>r.error||!r.physical||r.balance>1e-10);
const report={scope:'FOFC on: 192 gas presets (12 methods x 2 examples x 4 RK x 16/64 cells), plus 12 TENO5/6 Forward Euler cases at 128/256/512 cells. Zero positivity threshold; no floors.',cases:results.length,failed:failed.length,maxBalance:Math.max(...results.map(r=>r.balance)),correctedCases:results.filter(r=>r.correctedFaceStages>0).length,results};
mkdirSync('output/riemann-audit',{recursive:true});writeFileSync('output/riemann-audit/fofc.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:report.cases,failed:report.failed,maxBalance:report.maxBalance,correctedCases:report.correctedCases,failures:failed},null,2));
if(failed.length)process.exitCode=1;
