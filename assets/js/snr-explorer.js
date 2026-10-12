const sequential = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const diverging = ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'];
const notes = {
  density: 'Density variations across the fixed shell.',
  temperature: 'P/ρ is a temperature proxy. No conversion to kelvin is assumed.',
  pressure: 'Pressure variations across the fixed shell.',
  omega_mag: 'The magnitude of the local rotation vector ω = ∇ × u.',
  baro_mag: 'Magnitude of the baroclinic vorticity source, sampled on the smoothed source shell.',
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
      const array = name => {
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
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(array('positions'),3));
      geometry.setIndex(new THREE.BufferAttribute(array('triangles'),1));
      const colorBuffer = new Float32Array(array('positions').length);
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
      const arrowPositions = array('arrowPositions');
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
        const count = Number(q('count').value);
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
        q('pdf-note').textContent=`${region==='shell'?'Whole shell, approximate area weighting':'Remnant mask, equal-volume cell weighting'}. 80 bins over the full range; integral = 1. Camera and cutaway do not change the PDF. ${selected.legend.startsWith('log')?'Density is per unit log₁₀. ':''}${pdf.excluded_weight_fraction>1e-12?`${(100*pdf.excluded_weight_fraction).toPrecision(3)}% of weight excluded (undefined values). `:''}${logarithmic?'Empty bins sit at the lower plot boundary.':''}`;
      };
      for(const name of ['pdf-quantity','pdf-region','pdf-log']) listen(q(name),'change',updatePDF);
      listen(q('pdf-download'),'click',()=>{
        const selected=selectedPDF(),region=q('pdf-region').value,pdf=manifest.distributions[selected.key][region];
        const rows=[`# ${manifest.title}`,`# ${selected.legend}`,`# region=${region}; excluded_weight_fraction=${pdf.excluded_weight_fraction}`, 'bin_left,bin_right,probability_density'];
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
        updateVectors();
      };
      const updateCut = () => {
        const axis=q('cut').value;
        q('cut-position').disabled=axis==='none';
        const fraction=Number(q('cut-position').value)/100;
        q('cut-output').textContent=`${Math.round(fraction*100)}%`;
        plane.normal.set(axis==='x'?-1:0,axis==='y'?-1:0,axis==='z'?-1:0);
        plane.constant=fraction-.5;
        material.clippingPlanes=arrowMaterial.clippingPlanes=axis==='none'?[]:[plane];
        material.needsUpdate=arrowMaterial.needsUpdate=true;
        describe();render();
      };
      const setView = view => {
        const center=geometry.boundingSphere.center;
        orbit.target.copy(center);
        const distance=geometry.boundingSphere.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.15;
        const directions={x:[1,0,0],y:[0,1,0],z:[0,0,1],reset:[1.15,-1.45,.95]};
        direction.fromArray(directions[view]).normalize();
        camera.up.set(0,view==='z'?1:0,view==='z'?0:1);
        camera.position.copy(center).addScaledVector(direction,distance);
        orbit.update();render();
      };
      q('scalar').replaceChildren();q('vector').replaceChildren(new Option('None','none'));
      for (const field of manifest.scalars) q('scalar').add(new Option(field.label,field.key));
      for (const field of manifest.vectors) q('vector').add(new Option(field.label,field.key));
      q('scalar').value=previousScalar;q('vector').value=previousVector;
      listen(q('scalar'),'change',updateScalar);
      for(const name of ['vector','count','length','magnitude']) listen(q(name),'input',updateVectors);
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
        events.abort();observer.disconnect();orbit.dispose();
        geometry.dispose();material.dispose();shaftGeometry.dispose();tipGeometry.dispose();arrowMaterial.dispose();
        shafts.dispose();tips.dispose();renderer.dispose();renderer.domElement.remove();axes.remove();
      };
      renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();status.textContent='The graphics session was interrupted. Reload this page to reopen the explorer.';});
      q('settings').disabled=false;q('legend').hidden=false;q('launch').hidden=true;
      q('opacity').value='1';q('opacity-output').textContent='100%';q('cut').value='none';
      q('title').textContent=manifest.title;q('metadata').href=manifestURL;q('distributions').hidden=false;
      updateScalar();updateCut();resize();setView('reset');opened=true;
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
