import { METHODS, PROBLEMS, faceStencil, candidateProfileValue, quarticFromAverages, polynomialValue } from './core.mjs';

const COLORS = ['#58d1bd', '#edc266', '#ed97c2', '#ae9cf5', '#f39c78'];
const GRAY = '#8494a7', BLUE = '#8cccf4', RULE = '#304156';
const format = x => x === 0 ? '0' : Math.abs(x) < 1e-4 || Math.abs(x) > 1e4 ? x.toExponential(2) : Number(x.toPrecision(4)).toString();
const text = (x,y,s,c=GRAY,anchor='start',size=9) => `<text x="${x}" y="${y}" fill="${c}" text-anchor="${anchor}" font-size="${size}">${s}</text>`;
const line = (x1,y1,x2,y2,c,w=1,dash='') => `<line class="plot-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const path = (points,c,w=1.7,dash='') => `<path class="plot-line" d="${points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(3)},${y.toFixed(3)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const at = (i,n,periodic) => periodic ? ((i%n)+n)%n : Math.max(0,Math.min(n-1,i));

export function candidateExtent(polynomial,k) {
  if(polynomial.candidateCoefficients){
    const offsets=polynomial.candidateOffsets[k],lo=Math.min(...offsets)-.5,hi=Math.max(...offsets)+.5;
    const c=polynomial.candidateCoefficients[k];
    const evalAt=(c,x)=>c.reduceRight((v,a)=>v*x+a,0);
    const roots=(c,a,b)=>{
      while(c.length>1&&c.at(-1)===0)c=c.slice(0,-1);
      if(c.length<2)return [];
      if(c.length===2){const x=-c[0]/c[1];return x>a&&x<b?[x]:[];}
      const cuts=[a,...roots(c.slice(1).map((v,i)=>v*(i+1)),a,b),b],out=[];
      for(let i=0;i<cuts.length-1;i++){
        let l=cuts[i],r=cuts[i+1],fl=evalAt(c,l),fr=evalAt(c,r);
        if(Math.abs(fl)<1e-13)out.push(l);
        if(fl*fr<0){for(let j=0;j<48;j++){const m=(l+r)/2,fm=evalAt(c,m);if(fl*fm<=0)r=m;else{l=m;fl=fm;}}out.push((l+r)/2);}
      }
      return out;
    };
    const points=[lo,hi,...roots(c.slice(1).map((v,i)=>v*(i+1)),lo,hi)];
    const values=points.map(x=>evalAt(c,x));return {min:Math.min(...values),max:Math.max(...values)};
  }
  const lo=k-2.5, hi=k+0.5, points=[lo,hi];
  if(polynomial.curves[k]!==0){
    const vertex=-polynomial.slopes[k]/(2*polynomial.curves[k]);
    if(vertex>lo&&vertex<hi)points.push(vertex);
  }
  const values=points.map(z=>candidateProfileValue(polynomial,k,z));
  return {min:Math.min(...values),max:Math.max(...values)};
}

function stencilMap(data, start, count, nonlinear, active, faceSide, selectedCell) {
  const entries=Array.from({length:count},(_,k)=>start+k);
  let out=`<div class="stencil-grid" style="--cell-count:${count}" aria-label="Cell averages in this reconstruction stencil">`;
  out+=entries.map(i=>{
    const pos=data.cells.indexOf(i), used=pos>=0, index=used?data.indices[pos]:null;
    return `<div class="stencil-cell ${used?'used':''} ${i===data.cell?'donor':''} ${i===selectedCell?'selected-cell':''}" data-virtual-cell="${i}" ${index!==null?`data-sampled-cell="${index}"`:''}><span>${i}${index!==null&&i!==index?`↦${index}`:''}</span><b>${used?format(data.values[pos]):'·'}</b></div>`;
  }).join('');
  if(nonlinear){
    data.candidates.forEach((candidate,k)=>{
      const first=Math.min(...candidate.cells)-start+1, last=Math.max(...candidate.cells)-start+2;
      const keep=data.polynomial.keep?.[k]??1;
      out+=`<button type="button" class="candidate-band ${keep?'':'rejected'} ${active===k?'focused':''}" data-candidate="${k}" data-face-side="${faceSide}" data-cells="${candidate.cells.join(',')}" data-indices="${candidate.indices.join(',')}" aria-pressed="${active===k}" style="grid-column:${first}/${last};color:${COLORS[k]};border-color:${COLORS[k]};background:${COLORS[k]}14">S${k} · ω=${format(data.polynomial.weights[k])}${keep?'':' · rejected'}</button>`;
    });
  }else{
    const first=Math.min(...data.cells)-start+1,last=Math.max(...data.cells)-start+2;
    out+=`<div class="simple-stencil-band" style="grid-column:${first}/${last}">Cells used for this state</div>`;
  }
  return out+'</div>';
}
function chart(data, frame, selected, side, active, quartic, width) {
  const n=frame.cfg.n, periodic=PROBLEMS[frame.cfg.problem].periodic, nv=frame.cfg.nv;
  const start=Math.min(selected-3,...data.cells), end=Math.max(selected+4,...data.cells.map(i=>i+1)), count=end-start, target=(selected+side)/n;
  const w=Math.max(220,width), h=228, b={l:43,r:w-12,t:27,b:194};
  const p=data.polynomial, values=[];
  const curves=data.candidates.map((candidate,k)=>{
    const lo=Math.min(...candidate.offsets)-.5,hi=Math.max(...candidate.offsets)+.5;
    const zs=Array.from({length:101},(_,j)=>lo+(hi-lo)*j/100);
    zs.push(0.5);zs.sort((a,b)=>a-b);
    const points=zs.map(z=>{
      const x=(data.cell+0.5+data.direction*z)/n, y=candidateProfileValue(p,k,z);
      return [x,y];
    });
    points.forEach(point=>values.push(point[1]));
    const ext=candidateExtent(p,k); values.push(ext.min,ext.max);
    return points;
  });
  const means=Array.from({length:count},(_,k)=>frame.q[at(start+k,n,periodic)*nv]);
  values.push(...means,p.value,...p.candidates);
  if(p.limiter)values.push(p.limiter.lower,p.limiter.upper);
  let reference=null;
  if(quartic && data.cells.length===5){
    const physical=Array.from({length:5},(_,k)=>frame.q[at(data.cell+k-2,n,periodic)*nv]);
    const coeff=quarticFromAverages(physical);
    reference=Array.from({length:201},(_,j)=>{
      const z=-2.5+5*j/200;return [(data.cell+0.5+z)/n,polynomialValue(coeff,z)];
    });
    reference.forEach(point=>values.push(point[1]));
  }
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,0.03);
  const lo=min-0.12*span,hi=max+0.3*span;
  const X=x=>b.l+(x-start/n)/(count/n)*(b.r-b.l), Y=y=>b.b-(y-lo)/(hi-lo)*(b.b-b.t);
  const lowMean=Math.min(...data.values),highMean=Math.max(...data.values),faceColor=side?'#baacf7':'#efbc68';
  let out=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Full candidate interpolation over all ${data.cells.length} stencil cells for ${side?'right':'left'} face, ${data.side==='right'?'qL':'qR'}" data-target-face="${selected+side}" data-donor-cell="${data.cell}">`;
  out+=`<rect x="${X((selected)/n)}" y="${b.t}" width="${X((selected+1)/n)-X(selected/n)}" height="${b.b-b.t}" fill="${BLUE}" opacity=".06"/>`;
  out+=`<rect x="${X(Math.min(...data.cells)/n)}" y="${Y(highMean)}" width="${X((Math.max(...data.cells)+1)/n)-X(Math.min(...data.cells)/n)}" height="${Math.max(0,Y(lowMean)-Y(highMean))}" fill="${GRAY}" opacity=".045"/>`;
  out+=line(b.l,b.t,b.l,b.b,RULE)+line(b.l,b.b,b.r,b.b,RULE);
  for(let j=0;j<=3;j++){
    const value=lo+(hi-lo)*j/3;
    out+=text(b.l-7,Y(value)+3,format(value),GRAY,'end',8)+line(b.l-3,Y(value),b.l,Y(value),RULE);
  }
  for(let j=0;j<=2;j++){
    const x=(start+count*j/2)/n;out+=text(X(x),b.b+15,x.toFixed(3),GRAY,'middle',8);
  }
  means.forEach((value,k)=>{out+=line(X((start+k)/n)+1,Y(value),X((start+k+1)/n)-1,Y(value),GRAY,1.5);});
  out+=line(X(target),b.t+20,X(target),b.b,faceColor,1.5,'3 4');
  if(reference)out+=path(reference.map(([x,y])=>[X(x),Y(y)]),'#d5e3ed',1.2,'5 4');
  curves.forEach((points,k)=>{
    const rejected=p.keep?.[k]===0,opacity=active===k?1:active<0?(rejected?.55:1):.2;
    out+=`<g opacity="${opacity}" data-candidate-curve="${k}" data-rejected="${rejected}">`;
    out+=path(points.map(([x,y])=>[X(x),Y(y)]),COLORS[k],active===k?2.6:1.8,rejected?'4 3':'');
    out+=`<circle cx="${X(target)}" cy="${Y(p.candidates[k])}" r="3" fill="${COLORS[k]}"/></g>`;
  });
  if(METHODS[frame.methods[0]].cellPolynomial){
    const combined=Array.from({length:101},(_,j)=>{const z=-.5+j/100;return [X((data.cell+.5+data.direction*z)/n),Y(p.coefficients.reduceRight((s,a)=>s*z+a,0))];});
    out+=path(combined,BLUE,3);
  }
  if(p.limiter){
    out+=line(X(target)+7,Y(p.limiter.lower),X(target)+7,Y(p.limiter.upper),'#edc266',3);
    out+=`<circle cx="${X(target)}" cy="${Y(p.limiter.raw)}" r="4" fill="none" stroke="#edc266"/>`;
  }
  const x=X(target),y=Y(p.value);
  out+=`<path data-weighted-state="${p.value}" d="M${x},${y-6} L${x+5},${y} L${x},${y+6} L${x-5},${y} Z" fill="${BLUE}" stroke="#090e17" stroke-width="1.2"/>`;
  out+=text(b.l+7,b.t+12,`${data.candidates.map((_,k)=>'S'+k).join(' · ')} → ${data.side==='right'?'qL':'qR'}`,BLUE,'start',9);
  out+=text(b.r-4,b.t+12,p.limiter?'◆ limited face value':'◆ solver face value',GRAY,'end',8);
  out+='</svg>';
  const ext=data.candidates.map((_,k)=>candidateExtent(p,k));
  const excess=Math.max(0,...ext.map(e=>e.max-highMean)),deficit=Math.max(0,...ext.map(e=>lowMean-e.min));
  return {svg:out,excess,deficit,lowMean,highMean};
}

export function drawFaceStencils(container, frame, trace, selected, focusedFace, sources, activeCandidates, quartic) {
  const method=frame.methods[0],nonlinear=METHODS[method].faceBased,n=frame.cfg.n,nv=frame.cfg.nv;
  const periodic=PROBLEMS[frame.cfg.problem].periodic;
  const width=container.clientWidth;
  const active=document.activeElement;
  const focus=container.contains(active)?['source','candidate','showAll'].find(key=>active.dataset[key]!==undefined):null;
  const focusValue=focus?active.dataset[focus]:null,focusSide=focus?active.closest('[data-face-side]').dataset.faceSide:null;
  container.innerHTML=[0,1].map(side=>{
    const j=selected+side,source=sources[side],donor=source==='L'?j-1:j;
    const data=faceStencil(trace.q,n,nv,method,donor,source==='L'?'right':'left',0,periodic);
    const start=Math.min(selected-3,...data.cells),end=Math.max(selected+4,...data.cells.map(i=>i+1)),count=end-start;
    const left=trace.right[(j-1)*nv],right=trace.left[j*nv];
    const plot=nonlinear?chart(data,{...frame,q:trace.q},selected,side,activeCandidates[side],quartic,width):null;
    return `<section class="face-stencil ${focusedFace===side?'focused-face':''}" data-face-side="${side}" ${focusedFace===side?'':'hidden'}><header><h4 class="${side?'right':'left'}-color">${side?'Right':'Left'} face · x = ${(j/n).toFixed(4)}</h4><button type="button" class="all-candidates" data-show-all="${side}">${nonlinear?'Show all candidates':'Inspect face'}</button></header>`
      +`<div class="source-picker" role="group" aria-label="${side?'Right':'Left'} face reconstruction state"><button type="button" data-source="L" data-face-side="${side}" aria-pressed="${source==='L'}">qL · cell ${j-1} · ${format(left)}</button><button type="button" data-source="R" data-face-side="${side}" aria-pressed="${source==='R'}">qR · cell ${j} · ${format(right)}</button></div>`
      +`<p class="stencil-caption">${nonlinear?`${data.cells.length} input means; colored bands show each candidate’s support.`:'The highlighted cells supply this reconstruction.'} Blue outline: donor. Blue fill: selected cell. ${data.cells.some((cell,k)=>cell!==data.indices[k])?'A label such as −1↦15 marks a ghost cell and its sampled cell.':''}</p>`
      +stencilMap(data,start,count,nonlinear,activeCandidates[side],side,selected)
      +(plot?`<div class="candidate-plot">${plot.svg}</div><p class="candidate-range">Candidate curves outside their input-mean range: +${format(plot.excess)} / −${format(plot.deficit)}. This is a reconstruction diagnostic, not a physical bound.${method==='cweno5'?' Blue curve inside the donor: the actual CWENO polynomial. S0 is a corrected quartic, not an interpolant of all five means.':method==='mp5'?' Curve and hollow dot: unlimited quartic. Gold interval: limiter bounds. Diamond: final face value.':''}${quartic&&data.cells.length===5?' Gray dashed: unlimited quartic reference.':''}</p>`:'')
      +'</section>';
  }).join('');
  if(focus&&+focusSide===focusedFace){
    const attribute=focus==='showAll'?'show-all':focus;
    container.querySelector(`.face-stencil[data-face-side="${focusSide}"] [data-${attribute}="${focusValue}"]`)?.focus({preventScroll:true});
  }
}
