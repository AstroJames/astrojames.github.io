// Full-time audit through 512 cells; add --all-grids to include finer grids.
// No browser or packages needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Experiment, METHODS, TIME_METHODS, PROBLEMS, GRID_SIZES, totals, admissible, ReconstructionError } from '../static/outreach/riemann-lab/core.mjs';
const grids=process.argv.includes('--all-grids')?GRID_SIZES:GRID_SIZES.filter(n=>n<=512);
const groupSize=Object.keys(PROBLEMS).length*grids.length;
const rows=[];
for(const integrator of Object.keys(TIME_METHODS))for(const method of ['pcm','minmod','mc','ppm','wenoz','teno5']){
  for(const problem of Object.keys(PROBLEMS))for(const n of grids){
    const row={integrator,method,problem,n};
    try{
      const e=new Experiment({integrator,problem,n,methods:[method,method]});
      while(e.time<PROBLEMS[problem].end-1e-14){if(!e.step(PROBLEMS[problem].end-e.time))throw new Error('Time did not advance');}
      if(!e.states.every(u=>admissible(u,e.cfg.nv)))throw new Error('Invalid final state');
      let error=0;
      e.states.forEach((u,run)=>totals(u,n,e.cfg.nv).forEach((v,k)=>{
        error=Math.max(error,Math.abs(v-e.initial[k]-e.boundaries[run][k])/Math.max(1,Math.abs(e.initial[k])));
      }));
      Object.assign(row,{steps:e.steps,retries:e.retries,balance:error,min:Math.min(...e.states[0]),max:Math.max(...e.states[0])});
      if(error>2e-11)throw new Error(`Conservation residual ${error}`);
      row.pass=true;
    }catch(error){
      row.pass=false;row.error=error.message;
      row.expectedStop=error instanceof ReconstructionError&&integrator==='euler'&&method==='teno5'
        &&n<=512&&((problem==='sod'&&n>=64)||(problem==='lax'&&n>=256));
    }
    rows.push(row);
  }
  console.log(`${integrator}/${method}: ${rows.slice(-groupSize).filter(r=>r.pass).length}/${groupSize} presets completed`);
}
const report={cases:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass),maxBalance:Math.max(...rows.map(r=>r.balance??0)),rows};
const path=process.argv.slice(2).find(arg=>!arg.startsWith('--'))??'output/riemann-audit/preset-sweep.json';
mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:report.cases,passed:report.passed,failed:report.failed,maxBalance:report.maxBalance,report:path}));
if(report.failed.some(row=>!row.expectedStop))process.exitCode=1;
