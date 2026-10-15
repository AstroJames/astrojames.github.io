import assert from 'node:assert/strict';
import {sample,smooth,mesh,histogram,anchors,range} from '../static/js/snr/volume-core.js';
const n=17,a=Float32Array.from({length:n**3},(_,i)=>2*Math.floor(i/n**2)+3*(Math.floor(i/n)%n)-(i%n));
assert.ok(Math.abs(sample(a,2.3,4.7,6.2,n)-(2*2.3+3*4.7-6.2))<1e-12);
const plane=mesh(a,20,n,n);
assert.ok(plane.triangles.length>0);
for(let i=0;i<plane.positions.length;i+=3){const [x,y,z]=plane.positions.subarray(i,i+3).map(v=>(v+.5)*n);assert.ok(Math.abs(2*x+3*y-z-20)<1e-5);}
assert.equal(Math.min(...plane.positions),-.5);
assert.ok(Math.abs(Math.max(...plane.positions)-(n-1)/n+.5)<1e-7);
const sphere=Float32Array.from({length:n**3},(_,i)=>(Math.floor(i/n**2)-8)**2+(Math.floor(i/n)%n-8)**2+(i%n-8)**2);
const surface=mesh(sphere,25,n,n),area=surface.weights.reduce((s,x)=>s+x,0);
assert.ok(Math.abs(area/(4*Math.PI*25/n**2)-1)<.04);
const h=histogram([0,1,2,NaN],[1,2,3,4],2);
assert.ok(Math.abs(h.density[0]-1/6)<1e-14&&Math.abs(h.density[1]-5/6)<1e-14);assert.equal(h.excluded_weight_fraction,.4);
assert.equal(histogram([NaN],[1]),null);
const limits=range([1,1+1e-7,1-1e-7]);assert.ok(limits[1]-limits[0]>.019); // Do not amplify contour roundoff into a false color contrast.
const constant=smooth(new Float32Array(n**3).fill(7),n);assert.ok(constant.every(v=>Math.abs(v-7)<1e-6));
const ids=anchors(surface.positions);assert.equal(new Set(ids).size,ids.length);
assert.ok(mesh(a,999,n,n).triangles.length===0);
console.log('PASS: physical-axis interpolation, level geometry, full extent, sphere area, PDFs, smoothing, anchors, empty contour');
