import {sample,smooth,mesh,histogram,range,anchors} from './volume-core.js';
let metadata,base,definition;
const groups=new Map(),fields=new Map();let shapeCache=null,smoothedCache=null;
async function group(key) {
  if(!groups.has(key))groups.set(key,(async()=>{
    const spec=definition.groups[key],response=await fetch(new URL(spec.file,base));
    if(!response.ok)throw new Error('Could not download the '+key+' volume. Please retry.');
    const packed=await response.arrayBuffer(),bytes=new Uint8Array(packed);
    const raw=bytes[0]===31&&bytes[1]===139?await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():packed;
    if(raw.byteLength!==spec.raw_bytes)throw new Error('Incomplete volume download.');
    const shuffled=new Uint8Array(raw),restored=new Uint8Array(raw.byteLength),count=raw.byteLength/4;
    for(let b=0;b<4;b++)for(let i=0;i<count;i++)restored[i*4+b]=shuffled[b*count+i];
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',restored)),v=>v.toString(16).padStart(2,'0')).join('');
    if(digest!==spec.sha256)throw new Error('Volume integrity check failed. Please reload.');
    return spec.components.map((_,i)=>new Float32Array(restored.buffer,i*128**3*4,128**3));
  })().catch(error=>{groups.delete(key);throw error;}));
  return groups.get(key);
}
async function field(key) {
  if(fields.has(key))return fields.get(key);
  let a;
  if(['density','pressure','temperature'].includes(key)) {
    const [rho,p]=await group('thermo');a=key==='density'?rho:key==='pressure'?p:Float32Array.from(p,(v,i)=>v/rho[i]);
  } else {
    const v=await group(key==='omega_mag'?'vorticity':'baroclinic');
    a=Float32Array.from(v[0],(_,i)=>Math.hypot(v[0][i],v[1][i],v[2][i]));
  }fields.set(key,a);return a;
}
const scalarMeta=key=>metadata.scalars.find(s=>s.key===key);
async function scalarSampler(key) {
  if(['production','alignment'].includes(key)) {
    const [o,b]=await Promise.all([group('vorticity'),group('baroclinic')]);
    const reference=scalarMeta('omega_mag').reference*scalarMeta('baro_mag').reference;
    return (x,y,z)=>{const ov=o.map(a=>sample(a,x,y,z)),bv=b.map(a=>sample(a,x,y,z)),dot=ov.reduce((s,v,i)=>s+v*bv[i],0);
      const denominator=key==='production'?reference:Math.hypot(...ov)*Math.hypot(...bv);
      return denominator?Math.max(key==='alignment'?-1:-Infinity,Math.min(key==='alignment'?1:Infinity,dot/denominator)):NaN;};
  }
  const a=await field(key),reference=scalarMeta(key).reference;
  return (x,y,z)=>{const v=sample(a,x,y,z)/reference;return v>0?Math.log10(v):NaN;};
}
function samplePositions(positions,sampler) {
  const a=new Float32Array(positions.length/3);
  for(let i=0;i<a.length;i++)a[i]=sampler((positions[i*3]+.5)*128,(positions[i*3+1]+.5)*128,(positions[i*3+2]+.5)*128);
  return a;
}
async function build(config) {
  const started=performance.now(),smoothedKey=config.field+':'+config.smoothing;
  if(smoothedCache?.key!==smoothedKey)smoothedCache={key:smoothedKey,values:smooth(await field(config.field),128,config.smoothing)};
  const surface=smoothedCache.values,level=config.level*scalarMeta(config.field).reference;
  const shapeKey=smoothedKey+':'+config.level+':'+config.resolution;
  if(shapeCache?.key!==shapeKey) {
    const data=mesh(surface,level,config.resolution);
    if(!data.triangles.length)throw new Error('No surface crosses this level. Choose a value inside the field range.');
    shapeCache={key:shapeKey,...data,ids:anchors(data.positions)};
  }
  const shape=shapeCache,colorSample=await scalarSampler(config.color),values=samplePositions(shape.positions,colorSample);
  const output={positions:shape.positions.slice(),triangles:shape.triangles.slice(),values,
    scalarPDF:histogram(values,shape.weights),range:config.color==='alignment'?[-1,1]:range(values,config.color==='production'),
    arrowPositions:new Float32Array(shape.ids.length*3),vectors:new Float32Array(shape.ids.length*3),vectorPDF:null,vectorP95:1};
  shape.ids.forEach((id,i)=>output.arrowPositions.set(shape.positions.subarray(id*3,id*3+3),i*3));
  if(config.vector!=='none') {
    const arrays=await group(config.vector),vmeta=metadata.vectors.find(v=>v.key===config.vector),magnitudes=new Float32Array(values.length),arrowLengths=[];
    // PDFs use all surface vertices, independently of the displayed arrow count.
    for(let i=0;i<magnitudes.length;i++) {const p=shape.positions,x=(p[i*3]+.5)*128,y=(p[i*3+1]+.5)*128,z=(p[i*3+2]+.5)*128;
      const magnitude=Math.hypot(...arrays.map(a=>sample(a,x,y,z)));magnitudes[i]=magnitude>0?Math.log10(magnitude/vmeta.reference):NaN;}
    for(let i=0;i<shape.ids.length;i++){const p=output.arrowPositions,x=(p[i*3]+.5)*128,y=(p[i*3+1]+.5)*128,z=(p[i*3+2]+.5)*128;
      const v=arrays.map(a=>sample(a,x,y,z));output.vectors.set(v,i*3);arrowLengths.push(Math.hypot(...v));}
    arrowLengths.sort((a,b)=>a-b);output.vectorP95=arrowLengths[Math.floor(.95*(arrowLengths.length-1))]||1;
    output.vectorPDF=histogram(magnitudes,shape.weights);
  }
  if(config.slice!=='none') {
    const axis='xyz'.indexOf(config.slice),plane=config.slicePosition*127/100,others=[0,1,2].filter(a=>a!==axis),size=128;
    const positions=new Float32Array(size*size*3),sliceValues=new Float32Array(size*size),contourValues=new Float32Array(size*size),triangles=[],lines=[];
    for(let i=0;i<size;i++)for(let j=0;j<size;j++){const p=[0,0,0];p[axis]=plane;p[others[0]]=i;p[others[1]]=j;const index=i*size+j;
      positions.set(p.map(v=>v/128-.5),index*3);sliceValues[index]=colorSample(...p);contourValues[index]=sample(surface,...p);}
    const contour=ids=>{const points=[];
      for(let e=0;e<3;e++){const a=ids[e],b=ids[(e+1)%3];if((contourValues[a]<level)===(contourValues[b]<level))continue;
        const f=(level-contourValues[a])/(contourValues[b]-contourValues[a]);points.push([0,1,2].map(k=>positions[a*3+k]+f*(positions[b*3+k]-positions[a*3+k])));}
      if(points.length===2)lines.push(...points[0],...points[1]);};
    for(let i=0;i<size-1;i++)for(let j=0;j<size-1;j++){const a=i*size+j,b=a+size;const first=[a,b,b+1],second=[a,b+1,a+1];triangles.push(...first,...second);contour(first);contour(second);}
    output.slice={positions,values:sliceValues,triangles:new Uint32Array(triangles),lines:new Float32Array(lines)};
  }
  output.elapsed=performance.now()-started;return output;
}
let queue=Promise.resolve();
self.onmessage=event=>{
  const {id,type,...payload}=event.data;
  queue=queue.then(async()=>{
    try {
      if(type==='init') {metadata=payload.manifest;base=payload.base;const response=await fetch(new URL('volumes.json',base));if(!response.ok)throw new Error('The volume definitions could not be loaded.');definition=await response.json();self.postMessage({id,definition});return;}
      const result=await build(payload.config),transfer=[result.positions.buffer,result.triangles.buffer,result.values.buffer,result.arrowPositions.buffer,result.vectors.buffer];
      if(result.slice)transfer.push(...Object.values(result.slice).map(a=>a.buffer));
      self.postMessage({id,result},transfer);
    }catch(error){self.postMessage({id,error:error.message||'Volume extraction failed.'});}
  });
};
