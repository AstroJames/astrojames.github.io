import {triangles as table} from './marching-table.js';
const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
export function sample(a,x,y,z,n=128) {
  x=Math.max(0,Math.min(n-1,x));y=Math.max(0,Math.min(n-1,y));z=Math.max(0,Math.min(n-1,z));
  const i=Math.min(n-2,Math.floor(x)),j=Math.min(n-2,Math.floor(y)),k=Math.min(n-2,Math.floor(z));
  const u=x-i,v=y-j,w=z-k;let result=0;
  for(let dx=0;dx<2;dx++)for(let dy=0;dy<2;dy++)for(let dz=0;dz<2;dz++)
    result+=a[((i+dx)*n+j+dy)*n+k+dz]*(dx?u:1-u)*(dy?v:1-v)*(dz?w:1-w);
  return result;
}
export function smooth(a,n=128,sigma=.8) {
  if(!sigma)return a;
  const radius=Math.round(4*sigma),weights=[];let total=0;
  for(let k=-radius;k<=radius;k++){const w=Math.exp(-k*k/(2*sigma*sigma));weights.push(w);total+=w;}
  for(let i=0;i<weights.length;i++)weights[i]/=total;
  let input=a;
  for(let axis=0;axis<3;axis++) {
    const out=new Float32Array(a.length),stride=[n*n,n,1][axis];
    for(let i=0;i<a.length;i++) {const c=Math.floor(i/stride)%n;let sum=0;
      for(let k=-radius;k<=radius;k++)sum+=weights[k+radius]*input[i+(Math.max(0,Math.min(n-1,c+k))-c)*stride];
      out[i]=sum;
    } input=out;
  }return input;
}
export function mesh(volume,level,n=128,sourceN=128) {
  const grid=n===sourceN?volume:Float32Array.from({length:n**3},(_,i)=>sample(volume,Math.floor(i/n**2)*(sourceN-1)/(n-1),Math.floor(i/n)%n*(sourceN-1)/(n-1),i%n*(sourceN-1)/(n-1),sourceN));
  const cache=new Int32Array(n**3*3);cache.fill(-1);
  const positions=[],indices=[],values=new Float64Array(8),vertices=new Int32Array(12);
  for(let x=0;x<n-1;x++)for(let y=0;y<n-1;y++)for(let z=0;z<n-1;z++) {
    let code=0;
    for(let c=0;c<8;c++){const [dx,dy,dz]=corners[c];values[c]=grid[((x+dx)*n+y+dy)*n+z+dz];if(values[c]>level)code|=1<<c;}
    if(!code||code===255)continue;
    vertices.fill(-1);
    for(let t=code*16;table[t]!==-1&&t<code*16+16;t++) {
      const e=table[t];let id=vertices[e];
      if(id<0) {
        const [a,b]=edges[e],ca=corners[a],cb=corners[b],axis=ca.findIndex((v,k)=>v!==cb[k]);
        const key=(((x+Math.min(ca[0],cb[0]))*n+y+Math.min(ca[1],cb[1]))*n+z+Math.min(ca[2],cb[2]))*3+axis;
        id=cache[key];
        if(id<0){id=positions.length/3;const fraction=(level-values[a])/(values[b]-values[a]);
          for(let k=0;k<3;k++)positions.push((([x,y,z][k]+ca[k]+fraction*(cb[k]-ca[k]))*(sourceN-1)/(n-1))/sourceN-.5);
          cache[key]=id;
        }vertices[e]=id;
      }indices.push(id);
    }
    if(indices.length>3600000)throw new Error('This contour is too dense. Choose fast geometry or a different level.');
  }
  const p=new Float32Array(positions),faces=new Uint32Array(indices),weights=new Float64Array(p.length/3);
  for(let t=0;t<faces.length;t+=3){const a=faces[t]*3,b=faces[t+1]*3,c=faces[t+2]*3;
    const u=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],v=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];
    const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/6;
    for(let k=0;k<3;k++)weights[faces[t+k]]+=area;
  }
  return {positions:p,triangles:faces,weights};
}
export function histogram(values,weights,bins=80) {
  let low=Infinity,high=-Infinity,total=0,included=0;
  for(let i=0;i<values.length;i++){const w=weights?weights[i]:1;total+=w;if(Number.isFinite(values[i])&&w>0){low=Math.min(low,values[i]);high=Math.max(high,values[i]);included+=w;}}
  if(!included)return null;
  if(high-low<1e-5*Math.max(1,Math.abs(low),Math.abs(high))){const center=(high+low)/2;low=center-.5;high=center+.5;}
  const width=(high-low)/bins,density=Array(bins).fill(0);
  for(let i=0;i<values.length;i++)if(Number.isFinite(values[i]))density[Math.max(0,Math.min(bins-1,Math.floor((values[i]-low)/width)))]+=(weights?weights[i]:1)/(included*width);
  return {edges:Array.from({length:bins+1},(_,i)=>low+i*width),density,excluded_weight_fraction:Math.max(0,1-included/total)};
}
export function range(values,diverging=false) {
  const sorted=Float32Array.from(values).filter(Number.isFinite).map(v=>diverging?Math.abs(v):v).sort();
  if(!sorted.length)return [-1,1];
  const q=p=>sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))];
  if(diverging){const limit=q(.98)||1;return [-limit,limit];}
  const lo=q(.02),hi=q(.98);return hi-lo>1e-5*Math.max(1,Math.abs(lo),Math.abs(hi))?[lo,hi]:[(lo+hi)/2-.01,(lo+hi)/2+.01];
}
export function anchors(positions,count=800) {
  const total=positions.length/3,n=Math.min(4000,total),ids=Array.from({length:n},(_,i)=>Math.floor(i*total/n)),distance=new Float64Array(n);distance.fill(Infinity);
  const result=[];let index=0;
  for(let j=0;j<Math.min(count,n);j++) {result.push(ids[index]);const p=ids[index]*3;let next=0,best=-1;
    for(let i=0;i<n;i++){const q=ids[i]*3,d=(positions[p]-positions[q])**2+(positions[p+1]-positions[q+1])**2+(positions[p+2]-positions[q+2])**2;distance[i]=Math.min(distance[i],d);if(distance[i]>best){best=distance[i];next=i;}}
    if(best<=1e-20)break;index=next;
  }return result;
}
