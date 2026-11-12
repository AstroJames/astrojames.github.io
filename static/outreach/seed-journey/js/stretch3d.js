// Step 3: "Stretch, twist, fold". A closed magnetic loop carried by the random multi-scale flow of flow.js, drawn with three.js
// (vendored r187), plus a 2D chart of the loop's length and magnetic energy against the Kazantsev-model growth rates.
// The camera moves only on user input. Simulation speed is set by wall-clock time, not by frame rate.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createLoop, gammaBar, GAMMA_ALL, BANDS } from './flow.js';

const CAP = 160000;                  // most points on the line (memory ~ 12 MB)
const T_END = 8;                     // run length, in stretching times 1/gammabar (gammabar of all four eddy sizes)
const SPEED = 0.75;                  // stretching times per second of playback
const H = BANDS[BANDS.length - 1].tau / 4;      // integration step (flow units); every sub-map is exact
const TWO_PI = 2 * Math.PI;
const BAND_NAMES = ['largest eddies only', 'down to ½ size', 'down to ¼ size', 'all four sizes (down to ⅛)'];

export function createStretch({ canvas, chart, lut, reduceMotion, onUpdate }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0f14);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const HOME = new THREE.Vector3(7.5, 5.2, 11.5);
  camera.position.copy(HOME);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.minDistance = 4; controls.maxDistance = 30; controls.enablePan = false;

  // the periodic box (one wavelength of the largest eddies on each side)
  scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(TWO_PI, TWO_PI, TWO_PI)),
    new THREE.LineBasicMaterial({ color: 0x4a5160 })));

  const pos = new Float32Array(CAP * 3), col = new Float32Array(CAP * 3), idx = new Uint32Array(CAP * 2);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geom.setIndex(new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage));
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
  const line = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  line.frustumCulled = false; scene.add(line);

  let loop, nb = 4, playing = false, last = 0, acc = 0, raf = 0, visible = true, finished = false;
  const runs = [];                  // chart history: { nb, pts: [[t, log10 L, log10 E]] }

  const wrap = (v) => v - TWO_PI * Math.floor(v / TWO_PI) - Math.PI;
  function upload() {
    const N = loop.N, X = loop.X, Y = loop.Y, Z = loop.Z, S = loop.S, L0 = loop.L0;
    let m = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const xi = wrap(X[i]), yi = wrap(Y[i]), zi = wrap(Z[i]);
      pos[3 * i] = xi; pos[3 * i + 1] = zi; pos[3 * i + 2] = yi;          // z up on screen
      // field strength at the segment start: stretch of the segment, |dx| / ds (Cauchy solution)
      const dx = X[j] - X[i], dy = Y[j] - Y[i], dz = Z[j] - Z[i], ds = (j === 0 ? S[0] + L0 : S[j]) - S[i];
      const B = Math.sqrt(dx * dx + dy * dy + dz * dz) / ds;
      const u = Math.max(0, Math.min(1, (Math.log10(Math.max(B, 1e-3)) + 0.5) / 4));   // log10 B from -0.5 to 3.5
      const c = lut[Math.round(60 + 195 * u)];
      col[3 * i] = c[0] / 255; col[3 * i + 1] = c[1] / 255; col[3 * i + 2] = c[2] / 255;
      // skip segments that cross the box boundary after wrapping
      if (Math.abs(wrap(X[j]) - xi) < Math.PI && Math.abs(wrap(Y[j]) - yi) < Math.PI && Math.abs(wrap(Z[j]) - zi) < Math.PI) {
        idx[m++] = i; idx[m++] = j;
      }
    }
    geom.setDrawRange(0, m);
    geom.attributes.position.needsUpdate = true; geom.attributes.color.needsUpdate = true; geom.index.needsUpdate = true;
  }
  const tNow = () => loop.st.t * GAMMA_ALL;
  function record() {
    const d = loop.diagnostics(), r = runs[runs.length - 1];
    r.pts.push([tNow(), Math.log10(d.length), Math.log10(d.energy)]);
    return d;
  }
  function report(d) {
    onUpdate({ t: tNow(), length: d.length, energy: d.energy, N: loop.N, finished, playing, nb });
  }
  function restart(newNb = nb) {
    nb = newNb; finished = false; acc = 0;
    loop = createLoop({ nbands: nb, cap: CAP, seed: 7 });
    runs.push({ nb, pts: [] }); while (runs.length > 4) runs.shift();
    const d = record(); upload(); render(); drawChart(); report(d);
  }
  function advance(steps) {
    let d;
    for (let s = 0; s < steps && !finished; s++) {
      loop.step(H);
      if (tNow() >= T_END - 1e-9 || loop.st.full) finished = true;
    }
    const r = runs[runs.length - 1], tl = r.pts[r.pts.length - 1][0];
    if (finished || tNow() - tl > 0.04) d = record(); else d = loop.diagnostics();
    return d;
  }
  function frame(now) {
    raf = 0;
    if (!playing) return;
    acc += Math.min(0.1, (now - last) / 1000) * SPEED / GAMMA_ALL / H; last = now;
    const steps = Math.min(6, Math.floor(acc)); acc -= steps;
    const d = advance(steps);
    upload(); renderer.render(scene, camera); drawChart(); report(d);
    if (finished) { setPlaying(false); return; }
    if (visible) raf = requestAnimationFrame(frame);
  }
  function setPlaying(p) {
    if (p && finished) restart();
    playing = p;
    if (p && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    report(loop.diagnostics());
  }
  function skipToEnd() {
    setPlaying(false);
    while (!finished) advance(50);
    record(); upload(); render(); drawChart(); report(loop.diagnostics());
  }

  // ---- 2D chart: log10 of length and energy relative to the start, with the Kazantsev-model rates
  function drawChart() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = chart.getBoundingClientRect();
    const w = r.width, h = r.height;
    if (chart.width !== Math.round(w * dpr) || chart.height !== Math.round(h * dpr)) { chart.width = Math.round(w * dpr); chart.height = Math.round(h * dpr); }
    const ctx = chart.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const box = { x: 44, y: 28, w: w - 56, h: h - 78 }, yr = [0, 7];
    const X = (t) => box.x + t / T_END * box.w, Y = (v) => box.y + box.h - (v - yr[0]) / (yr[1] - yr[0]) * box.h;
    ctx.strokeStyle = '#1a1d23'; ctx.lineWidth = 1; ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#1a1d23';
    for (let t = 0; t <= T_END; t += 2) { ctx.beginPath(); ctx.moveTo(X(t), box.y + box.h); ctx.lineTo(X(t), box.y + box.h - 5); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(String(t), X(t), box.y + box.h + 16); }
    for (let v = 0; v <= 6; v += 2) { ctx.beginPath(); ctx.moveTo(box.x, Y(v)); ctx.lineTo(box.x + 5, Y(v)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v === 0 ? '1' : v === 2 ? '100' : `10`, box.x - (v > 2 ? 9 : 6), Y(v) + 4);
      if (v > 2) { ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(String(v), box.x - 9, Y(v) - 2); ctx.font = '12px system-ui, sans-serif'; } }
    ctx.textAlign = 'center'; ctx.fillText('time (stretching times)', box.x + box.w / 2, box.y + box.h + 34);
    ctx.textAlign = 'left'; ctx.fillText('growth since the start', box.x, box.y - 10);
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    // model rates for the current eddy selection: energy 2 gammabar, length 0.8 gammabar (white-noise limit)
    const g = gammaBar(nb) / GAMMA_ALL, LOG10E = Math.LOG10E;
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#b5430f'; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(T_END), Y(2 * g * T_END * LOG10E)); ctx.stroke();
    ctx.strokeStyle = '#555c68'; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(T_END), Y(0.8 * g * T_END * LOG10E)); ctx.stroke();
    ctx.setLineDash([]);
    runs.forEach((run, ri) => {
      const cur = ri === runs.length - 1;
      for (const [q, color] of [[2, '#b5430f'], [1, '#1a1d23']]) {
        if (!cur && q === 1) continue;
        ctx.strokeStyle = color; ctx.globalAlpha = cur ? 1 : 0.3; ctx.lineWidth = cur ? 2.2 : 1.6; ctx.beginPath();
        run.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[q])) : ctx.moveTo(X(p[0]), Y(p[q]))));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    ctx.restore();
    ctx.fillStyle = '#b5430f'; ctx.textAlign = 'left';
    ctx.fillText('magnetic energy', box.x + 8, box.y + 16);
    ctx.fillStyle = '#1a1d23'; ctx.fillText('length of the loop', box.x + 8, box.y + 32);
    ctx.fillStyle = '#555c68'; ctx.fillText('dashed: dynamo-model rates', box.x + 8, box.y + 48);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
    render(); drawChart();
  }
  let pending = false;
  function render() {
    if (pending) return; pending = true;
    requestAnimationFrame(() => { pending = false; renderer.render(scene, camera); });
  }
  function reset() { camera.position.copy(HOME); controls.target.set(0, 0, 0); controls.update(); render(); }
  // keyboard orbit: arrows rotate, + and - zoom (OrbitControls itself handles mouse and touch)
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
    if (e.key === 'ArrowLeft') sph.theta -= 0.15; else if (e.key === 'ArrowRight') sph.theta += 0.15;
    else if (e.key === 'ArrowUp') sph.phi = Math.max(0.1, sph.phi - 0.12); else if (e.key === 'ArrowDown') sph.phi = Math.min(Math.PI - 0.1, sph.phi + 0.12);
    else if (e.key === '+' || e.key === '=') sph.radius = Math.max(4, sph.radius * 0.9); else if (e.key === '-') sph.radius = Math.min(30, sph.radius * 1.1);
    else return;
    e.preventDefault(); off.setFromSpherical(sph); camera.position.copy(controls.target).add(off); camera.lookAt(controls.target); render();
  });
  controls.addEventListener('change', render);
  window.addEventListener('resize', resize);
  resize(); restart(4); void reduceMotion;
  return {
    play: () => setPlaying(true), pause: () => setPlaying(false), toggle: () => setPlaying(!playing),
    restart: (n) => { const wasPlaying = playing; setPlaying(false); restart(n); if (wasPlaying) setPlaying(true); },
    skipToEnd, reset,
    setVisible(v) { visible = v; if (v && playing && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
    get playing() { return playing; }, get finished() { return finished; }, bandName: (n) => BAND_NAMES[n - 1],
  };
}
