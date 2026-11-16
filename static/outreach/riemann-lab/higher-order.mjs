import { TABLES } from './reconstruction-tables.mjs';
export const HIGH_METHODS = {
  linear5: {name:'Unlimited polynomial · order 5',short:'Unlimited 5',stencil:2,faceBased:true,scalarOnly:true},
  mp5: {name:'MP5 · monotonicity preserving',short:'MP5',stencil:2,faceBased:true},
  wenojs5: {name:'WENO-JS5',short:'WENO-JS5',stencil:2,faceBased:true},
  wenojs7: {name:'WENO-JS7',short:'WENO-JS7',stencil:3,faceBased:true},
  wenojs9: {name:'WENO-JS9',short:'WENO-JS9',stencil:4,faceBased:true},
  cweno5: {name:'CWENO5 · cell polynomial',short:'CWENO5',stencil:2,faceBased:true,cellPolynomial:true},
  teno6: {name:'TENO6 · fixed cutoff',short:'TENO6',stencil:3,faceBased:true},
};
const five=[-2,-1,0,1,2], quadratics=[[-2,-1,0],[-1,0,1],[0,1,2]];
export function reconstructionSpec(method) {
  if(TABLES.schemes[method])return TABLES.schemes[method];
  if(method==='cweno5')return {offsets:five,candidates:[five,...quadratics],optimal:[.75,.0625,.125,.0625],optimalTex:['3/4','1/16','1/8','1/16']};
  return {offsets:five,candidates:[five],optimal:[1],optimalTex:['1']};
}
export const evaluatePolynomial=(c,z)=>c.reduceRight((s,a)=>s*z+a,0);
// Subtract the donor mean before applying moment matrices: constants remain exact.
export function polynomialFromMeans(values,offsets) {
  const B=TABLES.kernels[offsets.join(',')].matrix,mean=values[offsets.indexOf(0)];
  const c=B.map(row=>row.reduce((s,a,j)=>s+a*(values[j]-mean),0));c[0]+=mean;return c;
}
export function smoothness(c) {
  const {L,D}=TABLES.indicators[c.length-1];let sum=0;
  for(let i=0;i<D.length;i++){let v=0;for(let j=i;j<D.length;j++)v+=L[j][i]*c[j+1];sum+=D[i]*v*v;}
  return sum;
}
const normalizedLogs=logs=>{const m=Math.max(...logs),a=logs.map(l=>Math.exp(l-m)),s=a.reduce((x,y)=>x+y,0);return a.map(x=>x/s);};
const minmod=(...v)=>v.every(x=>x>0)?Math.min(...v):v.every(x=>x<0)?Math.max(...v):0;
export function mpLimit(v,raw) {
  const [a,b,c,d,e]=v,alpha=4,mp=c+minmod(d-c,alpha*(c-b));
  const dm=a-2*b+c,dc=b-2*c+d,dp=c-2*d+e;
  const mr=minmod(4*dc-dp,4*dp-dc,dc,dp),ml=minmod(4*dc-dm,4*dm-dc,dc,dm);
  const ul=c+alpha*(c-b),md=(c+d)/2-mr/2,lc=c+(c-b)/2+4*ml/3;
  const lower=Math.max(Math.min(c,d,md),Math.min(c,ul,lc)),upper=Math.min(Math.max(c,d,md),Math.max(c,ul,lc));
  const bypass=(raw-c)*(raw-mp)<=1e-10;
  return {raw,lower,upper,bypass,value:bypass?raw:raw+minmod(lower-raw,upper-raw)};
}
export function higherFace(v,method,dx=1) {
  const spec=reconstructionSpec(method),offsets=spec.offsets,mean=v[offsets.indexOf(0)];
  let polys=spec.candidates.map(sub=>polynomialFromMeans(sub.map(i=>v[offsets.indexOf(i)]),sub));
  if(method==='cweno5'){
    const original=polys[0];
    polys[0]=original.map((a,j)=>(a-polys.slice(1).reduce((sum,p,k)=>sum+spec.optimal[k+1]*(p[j]??0),0))/spec.optimal[0]);
  }
  const beta=polys.map(smoothness),optimal=spec.optimal;
  let weights=optimal.slice(),tau=null,chi=null,keep=null,cutoff=null;
  const epsilon=method==='teno6'?1e-40:method==='cweno5'?dx*dx:1e-6;
  if(method.startsWith('wenojs')||method==='cweno5')weights=normalizedLogs(beta.map((b,k)=>Math.log(optimal[k])-2*Math.log(b+epsilon)));
  if(method==='teno6'){
    const full=polynomialFromMeans(v,offsets);
    tau=Math.abs(smoothness(full)-(beta[0]+4*beta[1]+beta[2])/6);
    chi=normalizedLogs(beta.map(b=>6*Math.log1p(tau/(b+epsilon))));cutoff=1e-7;
    keep=chi.map(x=>x>=cutoff?1:0);const sum=optimal.reduce((s,d,k)=>s+d*keep[k],0);
    weights=optimal.map((d,k)=>d*keep[k]/sum);
  }
  const candidates=polys.map(p=>evaluatePolynomial(p,.5));
  // Combine deviations from the donor mean to retain constant states exactly.
  const degree=Math.max(...polys.map(p=>p.length));
  const coefficients=Array.from({length:degree},(_,j)=>j===0?mean+polys.reduce((s,p,k)=>s+weights[k]*(p[0]-mean),0):polys.reduce((s,p,k)=>s+weights[k]*(p[j]??0),0));
  let value=mean+candidates.reduce((s,x,k)=>s+weights[k]*(x-mean),0),limiter=null;
  if(method==='mp5'){limiter=mpLimit(v,value);value=limiter.value;}
  return {value,mean,candidates,beta,weights,optimal,tau,chi,keep,epsilon,cutoff,coefficients,candidateCoefficients:polys,candidateOffsets:spec.candidates,offsets,limiter};
}
