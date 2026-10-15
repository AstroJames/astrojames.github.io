const sequential = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const diverging = ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'];
const notes = {
  density: 'Density variations across the selected surface.',
  temperature: 'P/ρ is a temperature proxy. No conversion to kelvin is assumed.',
  pressure: 'Pressure variations across the selected surface.',
  omega_mag: 'The magnitude of the local rotation vector ω = ∇ × u.',
  baro_mag: 'Magnitude of the baroclinic vorticity source, sampled on the selected surface.',
  production: 'Positive: baroclinic reinforcement of enstrophy. Negative: opposition. This is one term in the budget.',
  alignment: '−1: opposed · 0: perpendicular · +1: aligned. Magnitudes are excluded from this view.',
};
for (const root of document.querySelectorAll('[data-snr-explorer]')) {
  const q = name => root.querySelector(`[data-${name}]`);
  const status = q('status');
  let cleanup = () => {};
  let opened = false;
  const load = async () => {
    const manifestURL = q('remnant').value;
    const previousScalar=q('scalar').value||'omega_mag',previousVector=opened?q('vector').value:'vorticity';
    q('remnant').disabled = true;
    q('load').disabled = true;
    q('load').textContent = 'Loading the remnant…';
    status.textContent = 'Loading the surface and scientific fields…';
    let renderer;
    try {
      const [THREE, { OrbitControls }, response] = await Promise.all([
        import('/vendor/three-0.180.0/three.module.min.js'),
        import('/vendor/three-0.180.0/OrbitControls.js'),
        fetch(manifestURL),
      ]);
      if (!response.ok) throw new Error('The field definitions could not be loaded.');
      const manifest = await response.json();
      const binaryResponse = await fetch(new URL(manifest.binary, new URL(manifestURL, location.href)));
      if (!binaryResponse.ok) throw new Error('The surface data could not be loaded.');
      const binary = await binaryResponse.arrayBuffer();
      if (binary.byteLength !== manifest.bytes) throw new Error('The surface download is incomplete.');
      let dynamicArrays=null;
      const array = name => {
        if(dynamicArrays && name in dynamicArrays)return dynamicArrays[name];
        const a = manifest.arrays[name];
        return a.dtype === '<u4' ? new Uint32Array(binary,a.offset,a.count) : new Float32Array(binary,a.offset,a.count);
      };
      cleanup();
      const events = new AbortController();
      const listen = (node, event, handler) => node.addEventListener(event, handler, {signal:events.signal});
      const stage = q('stage');
      renderer = new THREE.WebGLRenderer({antialias:true,alpha:false});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
      renderer.setClearColor('#080e19');
      renderer.localClippingEnabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      stage.append(renderer.domElement);
      renderer.domElement.setAttribute('aria-label','Interactive SNR shell. Drag to rotate, scroll or pinch to zoom. Camera buttons provide axis views.');
      renderer.domElement.setAttribute('role','img');
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40,1,.01,20);
      camera.up.set(0,0,1);
      const orbit = new OrbitControls(camera,renderer.domElement);
      orbit.enableDamping = false;
      orbit.minDistance=.35;
      orbit.maxDistance=4;
      let geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(array('positions'),3));
      geometry.setIndex(new THREE.BufferAttribute(array('triangles'),1));
      let colorBuffer = new Float32Array(array('positions').length);
      geometry.setAttribute('color',new THREE.BufferAttribute(colorBuffer,3));
      geometry.computeBoundingSphere();
      // Unlit colors keep scalar values independent of camera/light direction.
      const material = new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
      const shell = new THREE.Mesh(geometry,material);
      scene.add(shell);
      const maxArrows = manifest.arrays.arrowPositions.shape[0];
      const arrowMaterial = new THREE.MeshBasicMaterial({color:'#ffffff'});
      const shaftGeometry = new THREE.CylinderGeometry(1,1,1,6);
      const tipGeometry = new THREE.ConeGeometry(1,1,8);
      const shafts = new THREE.InstancedMesh(shaftGeometry,arrowMaterial,maxArrows);
      const tips = new THREE.InstancedMesh(tipGeometry,arrowMaterial,maxArrows);
      shafts.frustumCulled = false; tips.frustumCulled = false;
      shafts.renderOrder = 1; tips.renderOrder = 1;
      scene.add(shafts,tips);
      const plane = new THREE.Plane(new THREE.Vector3(-1,0,0),0);
      const dummy = new THREE.Object3D();
      const position = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const up = new THREE.Vector3(0,1,0);
      let arrowPositions = array('arrowPositions');
      let visibleArrows = 0;
      let activeScalar = manifest.scalars.find(s=>s.key==='omega_mag');
      const axes = document.createElement('div');
      axes.className='snr-axes';
      axes.setAttribute('aria-label','Orientation axes: x red, y green, z blue');
      stage.append(axes);
      const orientation = new THREE.Quaternion();
      const axisVector = new THREE.Vector3();
      const render = () => {
        renderer.render(scene,camera);
        orientation.copy(camera.quaternion).invert();
        const markup=['<svg viewBox="0 0 80 80" aria-hidden="true">'];
        for(const [index,label,color] of [[0,'x','#ff8c8c'],[1,'y','#8ee3aa'],[2,'z','#8cccf4']]) {
          axisVector.set(0,0,0).setComponent(index,1).applyQuaternion(orientation);
          const x=40+axisVector.x*27,y=40-axisVector.y*27;
          markup.push(`<line x1="40" y1="40" x2="${x}" y2="${y}" stroke="${color}" stroke-width="2"/><text x="${x+3}" y="${y-3}" fill="${color}">${label}</text>`);
        }
        axes.innerHTML=markup.join('')+'</svg>';
      };
      const describe = () => {
        const vector = manifest.vectors.find(v=>v.key===q('vector').value);
        const cut = q('cut').value;
        status.textContent = `${manifest.title} · ${activeScalar.label} · ${vector ? `${visibleArrows} ${vector.label.toLowerCase()} arrows` : 'no arrows'} · ${cut==='none' ? 'whole shell' : `${cut} cutaway at ${q('cut-position').value}%`}. Drag to rotate; scroll or pinch to zoom.`;
      };
      const updateVectors = () => {
        const field = manifest.vectors.find(v=>v.key===q('vector').value);
        const count = Math.min(Number(q('count').value),arrowPositions.length/3);
        const gain = Number(q('length').value);
        const mode = q('magnitude').checked;
        const darkArrows = activeScalar.palette==='diverging' && material.opacity>=.65;
        arrowMaterial.color.set(darkArrows ? '#151b24' : '#ffffff');
        q('count-output').textContent = count;
        q('length-output').textContent = `${gain.toFixed(1)}×`;
        for (const name of ['count','length','magnitude']) q(name).disabled = !field;
        visibleArrows = 0;
        if (field) {
          const values = array(field.key);
          for (let i=0;i<count;i++) {
            direction.fromArray(values,i*3);
            const magnitude = direction.length();
            if (!(magnitude>0)) continue;
            direction.divideScalar(magnitude);
            position.fromArray(arrowPositions,i*3);
            const length = .055*gain*(mode ? Math.min(magnitude/field.p95,1) : 1);
            if (length<.0001) continue;
            const radius = Math.min(.0015*gain,length*.08);
            dummy.quaternion.setFromUnitVectors(up,direction);
            dummy.position.copy(position).addScaledVector(direction,length*.36);
            dummy.scale.set(radius,length*.72,radius);
            dummy.updateMatrix(); shafts.setMatrixAt(visibleArrows,dummy.matrix);
            dummy.position.copy(position).addScaledVector(direction,length*.86);
            dummy.scale.set(radius*2.6,length*.28,radius*2.6);
            dummy.updateMatrix(); tips.setMatrixAt(visibleArrows,dummy.matrix);
            visibleArrows++;
          }
        }
        shafts.count=tips.count=visibleArrows;
        shafts.instanceMatrix.needsUpdate=tips.instanceMatrix.needsUpdate=true;
        q('vector-note').textContent = !field ? 'Choose a vector field to show arrows.' : `${darkArrows ? 'Dark' : 'White'} arrows: ${field.label.toLowerCase()}. ${mode ? 'Length ∝ magnitude, capped at the sampled 95th percentile.' : 'Equal lengths show direction only.'}${field.key.includes('velocity') || ['solenoidal','compressive'].includes(field.key) ? ' Simulation frame; no bulk subtraction.' : ''}`;
        describe(); render(); updatePDF();
      };
      const escape = text => String(text).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const selectedPDF = () => {
        const vector = manifest.vectors.find(v=>v.key===q('vector').value);
        q('pdf-quantity').options[1].disabled = !vector;
        if (!vector) q('pdf-quantity').value='scalar';
        const useVector=q('pdf-quantity').value==='vector';
        return {key:useVector?vector.distribution_key:activeScalar.key,
          label:useVector?`${vector.label} magnitude`:activeScalar.label,
          legend:useVector?vector.distribution_legend:activeScalar.legend};
      };
      const updatePDF = () => {
        const selected=selectedPDF(), region=q('pdf-region').value;
        const pdf=manifest.distributions[selected.key][region];
        q('pdf-download').disabled=!pdf;
        if(!pdf){q('pdf-plot').textContent='No defined samples on this surface.';q('pdf-note').textContent='This quantity is undefined at all sampled surface points.';return;}
        const {edges,density}=pdf;
        const logarithmic=q('pdf-log').checked;
        const positive=density.filter(v=>v>0);
        const ymax=Math.max(...density)*1.08;
        const ymin=logarithmic?Math.min(...positive)*.5:0;
        const transform=v=>logarithmic?Math.log10(Math.max(v,ymin)):v;
        const x=v=>90+(v-edges[0])/(edges.at(-1)-edges[0])*644;
        const y=v=>230-(transform(v)-transform(ymin))/(transform(ymax)-transform(ymin))*205;
        const fmt=v=>v!==0&&(Math.abs(v)<.01||Math.abs(v)>=1000)?v.toExponential(1):Number(v.toPrecision(3)).toString();
        const path=density.map((d,i)=>`${i?'L':'M'}${x(edges[i])},${y(d)} L${x(edges[i+1])},${y(d)}`).join(' ');
        let svg=`<svg viewBox="0 0 760 300" role="img" aria-label="${escape(selected.label)} probability density function"><title>${escape(manifest.title+' — '+selected.legend)}</title><path d="M90 25 V230 H734" fill="none" stroke="currentColor"/><path d="${path}" fill="none" stroke="#8cccf4" stroke-width="2"/>`;
        for(let i=0;i<=4;i++) {
          const xv=edges[0]+(edges.at(-1)-edges[0])*i/4;
          const yv=logarithmic?10**(transform(ymin)+(transform(ymax)-transform(ymin))*i/4):ymax*i/4;
          svg+=`<path d="M${x(xv)} 230 v5 M85 ${y(yv)} h5" stroke="currentColor"/><text x="${x(xv)}" y="251" text-anchor="middle">${fmt(xv)}</text><text x="80" y="${y(yv)+4}" text-anchor="end">${fmt(yv)}</text>`;
        }
        svg+=`<text x="412" y="282" text-anchor="middle">${escape(selected.legend)}</text><text transform="translate(16 130) rotate(-90)" text-anchor="middle">Probability density</text></svg>`;
        q('pdf-plot').innerHTML=svg;
        q('pdf-heading').textContent=`${manifest.title} · ${selected.label}`;
        q('pdf-note').textContent=`${region==='shell'?'Current surface, approximate area weighting':'Remnant mask, equal-volume cell weighting'}. 80 bins over the full range; integral = 1. Camera and cutaway do not change the PDF. ${selected.legend.startsWith('log')?'Density is per unit log₁₀. ':''}${pdf.excluded_weight_fraction>1e-12?`${(100*pdf.excluded_weight_fraction).toPrecision(3)}% of weight excluded (undefined values). `:''}${logarithmic?'Empty bins sit at the lower plot boundary.':''}`;
      };
      for(const name of ['pdf-quantity','pdf-region','pdf-log']) listen(q(name),'change',updatePDF);
      listen(q('pdf-download'),'click',()=>{
        const selected=selectedPDF(),region=q('pdf-region').value,pdf=manifest.distributions[selected.key][region];
        if(!pdf)return;
        const rows=[`# ${manifest.title}`,`# surface=${surfaceDescription}`, `# ${selected.legend}`,`# region=${region}; excluded_weight_fraction=${pdf.excluded_weight_fraction}`, 'bin_left,bin_right,probability_density'];
        pdf.density.forEach((value,i)=>rows.push(`${pdf.edges[i]},${pdf.edges[i+1]},${value}`));
        const url=URL.createObjectURL(new Blob([rows.join('\n')+'\n'],{type:'text/csv'}));
        const link=document.createElement('a');link.href=url;link.download=`snr${manifest.cluster_id}-output${manifest.output}-${selected.key}-${region}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      });
      const paletteRGB = palette => palette.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
      const updateScalar = () => {
        activeScalar = manifest.scalars.find(s=>s.key===q('scalar').value);
        const values=array(activeScalar.key), [low,high]=activeScalar.range;
        const palette=activeScalar.palette==='diverging' ? diverging : sequential;
        const rgb=paletteRGB(palette);const color=new THREE.Color();
        for (let i=0;i<values.length;i++) {
          if(!Number.isFinite(values[i])){color.set('#777777');color.toArray(colorBuffer,i*3);continue;}
          const t=Math.max(0,Math.min(1,(values[i]-low)/(high-low)))*(rgb.length-1);
          const j=Math.min(rgb.length-2,Math.floor(t)),f=t-j;
          color.setRGB(...rgb[j].map((v,k)=>v*(1-f)+rgb[j+1][k]*f),THREE.SRGBColorSpace);
          color.toArray(colorBuffer,i*3);
        }
        geometry.attributes.color.needsUpdate=true;
        q('legend-title').textContent=activeScalar.legend;
        q('colorbar').style.background=`linear-gradient(to right, ${palette.join(',')})`;
        const fmt=v=>Math.abs(v)>=100 ? v.toExponential(1) : v.toFixed(2);
        q('low').textContent=fmt(low);q('mid').textContent=fmt((low+high)/2);q('high').textContent=fmt(high);
        q('scale-note').textContent=activeScalar.key==='alignment' ? 'Opposed → perpendicular → aligned. The range is fixed at −1 to +1.' : 'Colors saturate at the displayed limits. Normalization and scale definitions are below.';
        q('field-note').textContent=notes[activeScalar.key];
        colorSlice();updateVectors();
      };
      const updateCut = () => {
        const axis=q('cut').value;
        q('cut-position').disabled=axis==='none';
        const fraction=Number(q('cut-position').value)/100;
        q('cut-output').textContent=`${Math.round(fraction*100)}%`;
        plane.normal.set(axis==='x'?-1:0,axis==='y'?-1:0,axis==='z'?-1:0);
        plane.constant=fraction*127/128-.5;
        material.clippingPlanes=arrowMaterial.clippingPlanes=axis==='none'?[]:[plane];
        material.needsUpdate=arrowMaterial.needsUpdate=true;
        describe();render();
      };
      const setView = view => {
        const bounds=q('surface-mode').value==='custom'?new THREE.Sphere(new THREE.Vector3(-1/256,-1/256,-1/256),Math.sqrt(3)*127/256):geometry.boundingSphere;
        const center=bounds.center;
        orbit.target.copy(center);
        const distance=bounds.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.15;
        const directions={x:[1,0,0],y:[0,1,0],z:[0,0,1],reset:[1.15,-1.45,.95]};
        direction.fromArray(directions[view]).normalize();
        camera.up.set(0,view==='z'?1:0,view==='z'?0:1);
        camera.position.copy(center).addScaledVector(direction,distance);
        orbit.update();render();
      };
      const preset=structuredClone(manifest);
      let surfaceDescription='Original baroclinic shell',worker,definition,requestId=0,appliedState,building=false;
      const pending=new Map();
      const controlNames=['surface-mode','surface-field','level','level-slider','smoothing','resolution','slice','slice-position','scalar','vector'];
      const capture=()=>Object.fromEntries(controlNames.map(name=>[name,q(name).value]));
      const restore=state=>{for(const [name,value] of Object.entries(state))q(name).value=value;q('volume-controls').hidden=state['surface-mode']==='preset';};
      let sliceGeometry=new THREE.BufferGeometry(),lineGeometry=new THREE.BufferGeometry();
      const sliceMaterial=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
      const lineMaterial=new THREE.LineBasicMaterial({color:'#ffffff'});
      const sliceMesh=new THREE.Mesh(sliceGeometry,sliceMaterial),sliceLines=new THREE.LineSegments(lineGeometry,lineMaterial);
      sliceMesh.visible=sliceLines.visible=false;scene.add(sliceMesh,sliceLines);let sliceValues=null;
      const colorSlice=()=>{
        if(!sliceValues)return;
        const palette=(activeScalar.palette==='diverging'?diverging:sequential).map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
        lineMaterial.color.set(activeScalar.palette==='diverging'?'#151b24':'#ffffff');
        const [lo,hi]=activeScalar.range,c=new THREE.Color(),colors=new Float32Array(sliceValues.length*3);
        for(let i=0;i<sliceValues.length;i++){
          if(!Number.isFinite(sliceValues[i]))c.set('#777777');
          else{const t=Math.max(0,Math.min(1,(sliceValues[i]-lo)/(hi-lo)))*(palette.length-1),j=Math.min(palette.length-2,Math.floor(t));const f=t-j;c.setRGB(...palette[j].map((v,k)=>v*(1-f)+palette[j+1][k]*f),THREE.SRGBColorSpace);}
          c.toArray(colors,i*3);
        }
        sliceGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      };
      const replaceGeometry=(positions,triangles)=>{
        geometry.dispose();geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(triangles,1));
        colorBuffer=new Float32Array(positions.length);geometry.setAttribute('color',new THREE.BufferAttribute(colorBuffer,3));geometry.computeBoundingSphere();shell.geometry=geometry;
      };
      const rpc=(type,payload)=>new Promise((resolve,reject)=>{const id=++requestId;pending.set(id,{resolve,reject});worker.postMessage({id,type,...payload});});
      const initVolume=async()=>{
        if(definition)return;
        if(!worker){worker=new Worker('/js/snr/volume-worker.js',{type:'module'});
          worker.onmessage=event=>{const p=pending.get(event.data.id);if(!p)return;pending.delete(event.data.id);event.data.error?p.reject(new Error(event.data.error)):p.resolve(event.data);};
          worker.onerror=()=>{for(const p of pending.values())p.reject(new Error('The volume worker could not start. Reload the page to retry.'));pending.clear();};
        }
        const response=await rpc('init',{manifest:preset,base:new URL('.',new URL(manifestURL,location.href)).href});definition=response.definition;
      };
      const setLevel=(reset=false)=>{
        if(!definition)return;
        const field=manifest.scalars.find(s=>s.key===q('surface-field').value),stats=definition.fields[field.key][q('smoothing').value];
        q('level-slider').min=Math.log10(stats.min);q('level-slider').max=Math.log10(stats.max);
        q('level').min=stats.min;q('level').max=stats.max;
        if(reset||!Number(q('level').value))q('level').value=Number(stats.p95.toPrecision(7));
        q('level-slider').value=Math.log10(Number(q('level').value));
        q('level-unit').textContent=field.legend.slice(6,-1);
      };
      const busy=value=>{
        q('settings').disabled=value;q('pdf-download').disabled=value;
        for(const name of ['pdf-quantity','pdf-region','pdf-log'])q(name).disabled=value;
        stage.setAttribute('aria-busy',String(value));
      };
      const rebuild=async()=>{
        if(building)return;building=true;
        busy(true);status.textContent='Loading the selected volumes and building the surface… You can still rotate the view.';
        try{
          await initVolume();if(events.signal.aborted)return;setLevel();
          const config={field:q('surface-field').value,level:Number(q('level').value),smoothing:Number(q('smoothing').value),resolution:Number(q('resolution').value),color:q('scalar').value,vector:q('vector').value,slice:q('slice').value,slicePosition:Number(q('slice-position').value)};
          if(!Number.isFinite(config.level)||config.level<=0)throw new Error('Enter a positive contour level.');
          const {result}=await rpc('build',{config});if(events.signal.aborted)return;
          dynamicArrays={[config.color]:result.values,[config.vector]:result.vectors};
          arrowPositions=result.arrowPositions;replaceGeometry(result.positions,result.triangles);
          const scalar=manifest.scalars.find(s=>s.key===config.color);scalar.range=result.range;manifest.distributions[config.color].shell=result.scalarPDF;
          if(config.vector!=='none'){const vector=manifest.vectors.find(v=>v.key===config.vector);vector.p95=result.vectorP95;manifest.distributions[vector.distribution_key].shell=result.vectorPDF;}
          sliceGeometry.dispose();lineGeometry.dispose();sliceGeometry=new THREE.BufferGeometry();lineGeometry=new THREE.BufferGeometry();sliceMesh.geometry=sliceGeometry;sliceLines.geometry=lineGeometry;
          sliceMesh.visible=sliceLines.visible=Boolean(result.slice);sliceValues=result.slice?.values||null;
          if(result.slice){sliceGeometry.setAttribute('position',new THREE.BufferAttribute(result.slice.positions,3));sliceGeometry.setIndex(new THREE.BufferAttribute(result.slice.triangles,1));lineGeometry.setAttribute('position',new THREE.BufferAttribute(result.slice.lines,3));q('cut').value=config.slice;q('cut-position').value=config.slicePosition;}
          else if(appliedState?.slice!=='none')q('cut').value='none';
          surfaceDescription=`${manifest.scalars.find(s=>s.key===config.field).label} surface at ${config.level.toPrecision(4)} · ${config.resolution}³ geometry`;
          q('surface-note').textContent=`${surfaceDescription}. ${(result.triangles.length/3).toLocaleString()} triangles · ${(result.elapsed/1000).toFixed(2)} s to load and build. Full 128³ field sampling.`;
          q('slice-output').textContent=`${config.slicePosition}%`;q('slice-position').disabled=config.slice==='none';
          updateScalar();updateCut();if(appliedState?.['surface-mode']==='preset')setView('reset');
          appliedState=capture();stage.dataset.surface=surfaceDescription;stage.dataset.triangles=result.triangles.length/3;
        }catch(error){if(events.signal.aborted)return;restore(appliedState);setLevel();status.textContent=`${error.message} The previous surface is still displayed.`;}
        finally{building=false;if(!events.signal.aborted)busy(false);}
      };
      const restorePreset=()=>{
        dynamicArrays=null;manifest.scalars=structuredClone(preset.scalars);manifest.vectors=structuredClone(preset.vectors);manifest.distributions=structuredClone(preset.distributions);
        arrowPositions=array('arrowPositions');replaceGeometry(array('positions'),array('triangles'));
        sliceMesh.visible=sliceLines.visible=false;sliceValues=null;q('slice').value='none';q('cut').value='none';
        q('volume-controls').hidden=true;surfaceDescription='Original baroclinic shell';q('surface-note').textContent='Original 95th-percentile baroclinic shell · smoothing 0.8 voxels.';
        updateScalar();updateCut();setView('reset');appliedState=capture();stage.dataset.surface=surfaceDescription;stage.dataset.triangles=preset.surface.triangles;
      };
      listen(q('surface-mode'),'change',()=>{q('volume-controls').hidden=q('surface-mode').value==='preset';q('surface-mode').value==='preset'?restorePreset():rebuild();});
      for(const name of ['surface-field','smoothing'])listen(q(name),'change',()=>{setLevel(true);rebuild();});
      for(const name of ['resolution','slice','slice-position'])listen(q(name),'change',rebuild);
      listen(q('level-slider'),'input',()=>{q('level').value=Number((10**Number(q('level-slider').value)).toPrecision(7));});
      listen(q('level-slider'),'change',rebuild);
      listen(q('level'),'change',()=>{setLevel();rebuild();});
      listen(q('apply-level'),'click',rebuild);
      listen(q('level'),'keydown',event=>{if(event.key==='Enter'){event.preventDefault();rebuild();}});
      q('scalar').replaceChildren();q('vector').replaceChildren(new Option('None','none'));
      for (const field of manifest.scalars) q('scalar').add(new Option(field.label,field.key));
      for (const field of manifest.vectors) q('vector').add(new Option(field.label,field.key));
      q('scalar').value=previousScalar;q('vector').value=previousVector;
      listen(q('scalar'),'change',()=>q('surface-mode').value==='custom'?rebuild():updateScalar());
      listen(q('vector'),'input',()=>q('surface-mode').value==='custom'?rebuild():updateVectors());
      for(const name of ['count','length','magnitude']) listen(q(name),'input',updateVectors);
      listen(q('opacity'),'input',()=>{
        material.opacity=Number(q('opacity').value);material.transparent=material.opacity<1;
        material.depthWrite=!material.transparent;material.needsUpdate=true;
        q('opacity-output').textContent=`${Math.round(material.opacity*100)}%`;updateVectors();
      });
      for(const name of ['cut','cut-position']) listen(q(name),'input',updateCut);
      root.querySelectorAll('[data-view]').forEach(button=>{
        button.disabled=false;listen(button,'click',()=>setView(button.dataset.view));
      });
      const full=q('fullscreen'),wrap=stage.parentElement;
      full.disabled=!wrap.requestFullscreen;
      listen(full,'click',async()=>{
        try {if(document.fullscreenElement===wrap) await document.exitFullscreen();else await wrap.requestFullscreen();}
        catch {status.textContent='Full screen is unavailable in this browser. You can still rotate and zoom the shell.';}
      });
      listen(document,'fullscreenchange',()=>{full.textContent=document.fullscreenElement===wrap?'Exit full screen':'Full screen';});
      orbit.addEventListener('change',render);
      const resize=()=>{
        const width=stage.clientWidth,height=stage.clientHeight;
        if (!width||!height) return;
        renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();
      };
      const observer=new ResizeObserver(resize);observer.observe(stage);
      cleanup=()=>{
        events.abort();worker?.terminate();for(const p of pending.values())p.reject(new Error("Cancelled"));pending.clear();sliceGeometry.dispose();sliceMaterial.dispose();lineGeometry.dispose();lineMaterial.dispose();observer.disconnect();orbit.dispose();
        geometry.dispose();material.dispose();shaftGeometry.dispose();tipGeometry.dispose();arrowMaterial.dispose();
        shafts.dispose();tips.dispose();renderer.dispose();renderer.domElement.remove();axes.remove();
      };
      renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();status.textContent='The graphics session was interrupted. Reload this page to reopen the explorer.';});
      q('settings').disabled=false;q('legend').hidden=false;q('launch').hidden=true;
      q('opacity').value='1';q('opacity-output').textContent='100%';q('cut').value='none';
      q('title').textContent=manifest.title;q('metadata').href=manifestURL;q('distributions').hidden=false;
      q('surface-mode').value='preset';q('volume-controls').hidden=true;q('surface-field').value='baro_mag';q('level').value='';q('slice').value='none';q('surface-note').textContent='Original 95th-percentile baroclinic shell · smoothing 0.8 voxels.';stage.dataset.surface='Original baroclinic shell';stage.dataset.triangles=preset.surface.triangles;busy(false);
      updateScalar();updateCut();resize();setView('reset');opened=true;appliedState=capture();
      // Handy non-sensitive state for accessibility and browser verification.
      stage.dataset.loaded='true';
    } catch(error) {
      renderer?.dispose();renderer?.domElement.remove();
      status.textContent=`${error.message || 'The interactive viewer could not start.'} Choose a remnant and try loading again.`;
      cleanup();cleanup=()=>{};opened=false;
      q('launch').hidden=false;q('settings').disabled=true;q('legend').hidden=true;q('distributions').hidden=true;
      root.querySelectorAll('[data-view], [data-fullscreen]').forEach(button=>button.disabled=true);
      q('stage').dataset.loaded='false';
      q('load').disabled=false;q('load').textContent='Try loading again';
    } finally { q('remnant').disabled=false; }
  };
  q('load').addEventListener('click',load);
  q('remnant').addEventListener('change',()=>{
    const option=q('remnant').selectedOptions[0], name=option.textContent.split(' · ')[0];
    q('preview').src=option.dataset.previewSrc;q('preview').hidden=false;
    q('preview').alt=`${name}: vorticity magnitude with vorticity arrows`;
    q('preview-caption').textContent=`${name} · vorticity magnitude and arrows`;
    if(opened) load();
    else {q('title').textContent=option.textContent;q('load').textContent='Open the 3D explorer';}
  });
}
