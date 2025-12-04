import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.166.0/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'https://cdn.jsdelivr.net/npm/three@0.166.0/examples/jsm/loaders/PLYLoader.js';

class PlyViewer {
  constructor(root) {
    this.root = root;
    this.models = this.parseModels();
    this.selectEl = root.querySelector('select');
    this.statusEl = root.querySelector('.ply-viewer__status');
    this.canvasHost = root.querySelector('.ply-viewer__canvas');
    this.buttons = root.querySelectorAll('[data-direction]');
    this.currentIndex = 0;
    this.currentMesh = null;

    if (!this.models.length) {
      this.setStatus('No models found in front matter.', true);
      return;
    }

    this.initThree();
    this.bindEvents();
    this.populateSelect();
    this.resizeRenderer();
    this.loadModel(0);
    this.animate();
  }

  parseModels() {
    try {
      return JSON.parse(this.root.dataset.models || '[]');
    } catch (error) {
      console.error('Failed to parse models', error);
      return [];
    }
  }

  initThree() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.canvasHost.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050912);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    this.camera.position.set(4, 3, 5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    this.scene.add(dirLight);

    this.loader = new PLYLoader();
  }

  bindEvents() {
    this.selectEl?.addEventListener('change', event => {
      this.loadModel(Number(event.target.value));
    });

    this.buttons.forEach(button => {
      button.addEventListener('click', () => {
        const dir = Number(button.dataset.direction || 0);
        this.changeModel(dir);
      });
    });

    window.addEventListener('resize', () => this.resizeRenderer());
  }

  populateSelect() {
    if (!this.selectEl) return;
    this.selectEl.innerHTML = '';
    this.models.forEach((model, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = model.label || `Model ${index + 1}`;
      this.selectEl.appendChild(option);
    });
    this.selectEl.value = '0';
  }

  resizeRenderer() {
    const width = this.canvasHost.clientWidth || this.root.clientWidth || 640;
    const height = Math.max(width * 0.6, 320);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setStatus(text, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.style.color = isError ? '#f87171' : 'rgba(255,255,255,0.65)';
  }

  loadModel(index) {
    const model = this.models[index];
    if (!model) {
      this.setStatus('Missing model definition', true);
      return;
    }

    this.currentIndex = index;
    this.setStatus(`Loading ${model.label || model.file}…`);

    this.loader.load(
      model.file,
      geometry => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.center();
        geometry.computeBoundingSphere();

        const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 1;
        const scale = radius > 0 ? 1 / radius : 1;
        geometry.scale(scale, scale, scale);

        const material = new THREE.MeshStandardMaterial({
          color: 0x7dd3fc,
          roughness: 0.5,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });

        if (this.currentMesh) {
          this.currentMesh.geometry.dispose();
          this.currentMesh.material.dispose();
          this.scene.remove(this.currentMesh);
        }

        this.currentMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.currentMesh);

        this.camera.position.set(2.5, 2.5, 2.5);
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.setStatus(`${model.label || model.file} ready. Drag to rotate, scroll to zoom.`);
      },
      xhr => {
        if (xhr.total) {
          const percent = ((xhr.loaded / xhr.total) * 100).toFixed(0);
          this.setStatus(`Loading ${percent}%`);
        }
      },
      error => {
        console.error('PLY load error', error);
        this.setStatus('Failed to load model.', true);
      }
    );
  }

  changeModel(delta) {
    const nextIndex = (this.currentIndex + delta + this.models.length) % this.models.length;
    if (this.selectEl) {
      this.selectEl.value = String(nextIndex);
    }
    this.loadModel(nextIndex);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

function initPlyViewers() {
  const viewers = document.querySelectorAll('.ply-viewer');
  viewers.forEach(root => {
    if (!root.dataset.plyViewerInit) {
      root.dataset.plyViewerInit = 'true';
      new PlyViewer(root);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlyViewers);
} else {
  initPlyViewers();
}
