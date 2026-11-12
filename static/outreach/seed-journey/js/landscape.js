// 3D landscape of log10 M(k,t) from the reviewed model frames. three.js r187 (vendored). Renders on demand only.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const YMIN = -12, YMAX = 28;           // same energy range as the 2D view
const SX = 10, SZ = 8, SY = 4.5;       // world extents: size (x), time (z), height (y)

function label(text, size = 0.32) {
  const c = document.createElement('canvas'), ctx = c.getContext('2d'), fs = 48;
  ctx.font = `${fs}px system-ui, sans-serif`;
  c.width = Math.ceil(ctx.measureText(text).width) + 16; c.height = fs + 16;
  ctx.font = `${fs}px system-ui, sans-serif`; ctx.fillStyle = '#e8e6e1'; ctx.textBaseline = 'middle'; ctx.fillText(text, 8, c.height / 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(size * c.width / c.height, size, 1); s.renderOrder = 10;
  return s;
}

export function createLandscape(canvas, D, lut, reduceMotion) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x161a22);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const HOME = new THREE.Vector3(-1.5, 8.5, 13);
  camera.position.copy(HOME);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.2, 0); controls.enableDamping = false; controls.minDistance = 5; controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.listenToKeyEvents(canvas);         // arrow keys pan when the canvas has focus
  canvas.tabIndex = 0;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-4, 8, 6); scene.add(sun);

  const lk = D.log10k, NK = lk.length, NT = D.gt.length;
  const xOf = (n) => -SX / 2 + SX * n / (NK - 1);
  const zOf = (i) => -SZ / 2 + SZ * i / (NT - 1);              // time runs toward the viewer (+z)
  const yOf = (v) => SY * ((v === null ? YMIN : Math.max(YMIN, Math.min(YMAX, v))) - YMIN) / (YMAX - YMIN);

  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(NK * NT * 3), col = new Float32Array(NK * NT * 3), idx = [];
  for (let i = 0; i < NT - 1; i++) for (let n = 0; n < NK - 1; n++) {
    const a = i * NK + n, b = a + 1, c = a + NK, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  geom.setIndex(idx);
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  scene.add(mesh);

  const ribbonGeom = new THREE.BufferGeometry();
  const rpos = new Float32Array(NK * 3); ribbonGeom.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
  const ribbon = new THREE.Line(ribbonGeom, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
  ribbon.renderOrder = 5; scene.add(ribbon);

  // frame: base box edges and reference line at k = k_eta (log10 k = 0)
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SX, 0.001, SZ)),
    new THREE.LineBasicMaterial({ color: 0x777777 }));
  scene.add(edges);
  const n0 = lk.findIndex((v) => v >= 0);
  const kEta = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xOf(n0), 0.01, -SZ / 2), new THREE.Vector3(xOf(n0), 0.01, SZ / 2)]),
    new THREE.LineDashedMaterial({ color: 0xbbbbbb, dashSize: 0.15, gapSize: 0.1 }));
  kEta.computeLineDistances(); scene.add(kEta);

  const L = [
    [label('larger  ←  size  →  smaller'), 0, -0.05, SZ / 2 + 0.7],
    [label('resistive scale', 0.36), xOf(n0), 0.05, -SZ / 2 - 0.45],
    [label('time runs toward you', 0.36), SX / 2 + 1.0, 0, 0],
    [label('start', 0.36), -SX / 2 - 0.7, 0, -SZ / 2],
    [label('60 stretching times', 0.36), -SX / 2 - 1.8, 0, SZ / 2],
    [label('↑ magnetic energy (log)', 0.4), -SX / 2 - 0.2, SY + 0.5, -SZ / 2],
  ];
  for (const [s, x, y, z] of L) { s.position.set(x, y, z); scene.add(s); }

  let seed = 'A', frame = 0;
  function setSeed(s) {
    seed = s; const R = D[seed].log10M;
    for (let i = 0; i < NT; i++) for (let n = 0; n < NK; n++) {
      const p = 3 * (i * NK + n), v = R[i][n], y = yOf(v);
      pos[p] = xOf(n); pos[p + 1] = y; pos[p + 2] = zOf(i);
      const c = lut[Math.max(0, Math.min(255, Math.round(255 * y / SY)))], k = v === null ? 0.35 : 1;
      col[p] = k * c[0] / 255; col[p + 1] = k * c[1] / 255; col[p + 2] = k * c[2] / 255;
    }
    geom.attributes.position.needsUpdate = true; geom.attributes.color.needsUpdate = true;
    geom.computeVertexNormals(); geom.computeBoundingSphere();
    setFrame(frame);
  }
  function setFrame(f) {
    frame = f; const R = D[seed].log10M, i = Math.floor(f), j = Math.min(i + 1, NT - 1), s = f - i;
    for (let n = 0; n < NK; n++) {
      const a = R[i][n], b = R[j][n], v = a === null || b === null ? (s < 0.5 ? a : b) : a + s * (b - a);
      rpos[3 * n] = xOf(n); rpos[3 * n + 1] = yOf(v) + 0.02; rpos[3 * n + 2] = zOf(f);
    }
    ribbonGeom.attributes.position.needsUpdate = true; ribbonGeom.computeBoundingSphere();
    render();
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
  }
  let pending = false;
  function render() {
    if (pending) return; pending = true;
    requestAnimationFrame(() => { pending = false; renderer.render(scene, camera); });
  }
  function reset() { camera.position.copy(HOME); controls.target.set(0, 1.2, 0); controls.update(); render(); }
  controls.addEventListener('change', render);
  window.addEventListener('resize', () => { resize(); render(); });
  resize(); setSeed('A'); controls.update();
  void reduceMotion;   // no autonomous camera motion in any mode; the view moves only on user input or with the player
  return { setFrame, setSeed, reset };
}
