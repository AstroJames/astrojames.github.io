// Full-time cross-check of the seven additions at 16 and 64 cells, all four RK methods.
import {writeFileSync,mkdirSync} from 'node:fs';
import {Experiment,PROBLEMS,TIME_METHODS,totals,admissible,ReconstructionError} from '../static/outreach/riemann-lab/core.mjs';
import {HIGH_METHODS} from '../static/outreach/riemann-lab/higher-order.mjs';
const rows=[];
for(const method of Object.keys(HIGH_METHODS))for(const integrator of Object.keys(TIME_METHODS)){
 for(const problem of Object.keys(PROBLEMS))for(const n of [16,64]){
  if(HIGH_METHODS[method].scalarOnly&&PROBLEMS[problem].equation==='euler')continue;
  const e=new Experiment({problem,n,methods:[method,method],integrator});let status='complete',reason=null;
  try{while(e.time<PROBLEMS[problem].end-1e-14){if(!e.step(PROBLEMS[problem].end-e.time))throw new Error('No time advance');if(e.steps>20000)throw new Error('Step budget exceeded');}}
  catch(err){status=err instanceof ReconstructionError?'physical-stop':'failure';reason=err.message;}
  let balance=0;e.states.forEach((u,r)=>totals(u,n,e.cfg.nv).forEach((v,k)=>{balance=Math.max(balance,Math.abs(v-e.initial[k]-e.boundaries[r][k])/Math.max(1,Math.abs(e.initial[k])));}));
  if(!e.states.every(u=>admissible(u,e.cfg.nv))||balance>2e-11){status='failure';reason='Invalid stored state or conservation residual';}
  rows.push({method,integrator,problem,n,status,reason,time:e.time,steps:e.steps,retries:e.retries,balance});
 }
 console.log(`${method}/${integrator}: ${rows.length} cases checked`);
}
const report={cases:rows.length,complete:rows.filter(r=>r.status==='complete').length,stops:rows.filter(r=>r.status==='physical-stop'),failures:rows.filter(r=>r.status==='failure'),maxBalance:Math.max(...rows.map(r=>r.balance)),rows};
mkdirSync('output/riemann-audit',{recursive:true});writeFileSync('output/riemann-audit/new-methods.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,rows:undefined}));if(report.failures.length)process.exitCode=1;
