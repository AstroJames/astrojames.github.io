(function () {
  const READY_STATES = ['complete', 'interactive'];

  function initWhenReady() {
    if (!READY_STATES.includes(document.readyState)) {
      document.addEventListener('DOMContentLoaded', initPlyViewers, { once: true });
    } else {
      initPlyViewers();
    }
  }

  function initPlyViewers() {
    if (typeof window.THREE === 'undefined' || !THREE.PLYLoader || !THREE.OrbitControls) {
      console.error('PLY viewer dependencies missing.');
      return;
    }

    document.querySelectorAll('.ply-viewer').forEach(root => {
      if (root.dataset.plyViewerInit) return;
      root.dataset.plyViewerInit = 'true';
      new PlyViewer(root);
    });
  }

  class PlyViewer {
    constructor(root) {
      this.root = root;
      this.models = this.extractModels();
      this.selectEl = root.querySelector('select');
      this.statusEl = root.querySelector('.ply-viewer__status');
      this.canvasHost = root.querySelector('.ply-viewer__canvas');
      this.buttons = root.querySelectorAll('[data-direction]');
      this.currentIndex = 0;
      this.currentMesh = null;

      if (!this.models.length) {
        this.setStatus('No models configured.', true);
        return;
      }

      this.initThree();
      this.bindEvents();
      this.resizeRenderer();
      this.loadModel(0);
      this.animate();
    }

    extractModels() {
      const dataAttr = this.root.dataset.models;
      if (dataAttr) {
        try {
          return JSON.parse(dataAttr);
        } catch (error) {
          console.error('Failed to parse data-models JSON', error);
        }
      }

      const options = Array.from(this.root.querySelectorAll('select option'));
      return options.map(option => ({
        label: option.textContent,
        file: option.dataset.file || option.value,
      })).filter(model => !!model.file);
    }

    initThree() {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.canvasHost.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x050912);

      this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
      this.camera.position.set(3, 2.5, 3);

      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 0.7));
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(5, 10, 7);
      this.scene.add(dirLight);

      this.loader = new THREE.PLYLoader();
      this.pointMaterial = new THREE.PointsMaterial({
        size: 0.02,
        sizeAttenuation: true,
        color: 0x7dd3fc,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
      });
    }

    bindEvents() {
      this.selectEl?.addEventListener('change', event => {
        this.loadModel(Number(event.target.value));
      });

      this.buttons.forEach(button => {
        button.addEventListener('click', () => {
          const delta = Number(button.dataset.direction || 0);
          this.changeModel(delta);
        });
      });

      window.addEventListener('resize', () => this.resizeRenderer());
    }

    resizeRenderer() {
      if (!this.renderer) return;
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
        this.setStatus('Model not found.', true);
        return;
      }

      this.currentIndex = index;
      this.setStatus(`Loading ${model.label || model.file}…`);

      this.loader.load(
        model.file,
        geometry => {
          try {
            if (geometry.hasAttribute('color')) {
              const colors = geometry.getAttribute('color');
              for (let i = 0; i < colors.count; i++) {
                colors.setX(i, colors.getX(i) / 255);
                colors.setY(i, colors.getY(i) / 255);
                colors.setZ(i, colors.getZ(i) / 255);
              }
              colors.needsUpdate = true;
            }

            geometry.computeBoundingBox();
            geometry.center();
            geometry.computeBoundingSphere();

            const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 1;
            const scale = radius > 0 ? 1 / radius : 1;
            geometry.scale(scale, scale, scale);

            const points = new THREE.Points(geometry, this.pointMaterial);
            this.replaceObject(points);

            this.camera.position.set(1.8, 1.8, 1.8);
            this.controls.target.set(0, 0, 0);
            this.controls.update();

            this.setStatus(`${model.label || model.file} ready. Drag to rotate, scroll to zoom.`);
          } catch (error) {
            console.error('PLY post-process error', error);
            this.setStatus('Loaded file but could not render geometry.', true);
          }
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

    replaceObject(object) {
      if (!object) return;
      if (this.currentMesh) {
        this.currentMesh.geometry?.dispose?.();
        this.currentMesh.material?.dispose?.();
        this.scene.remove(this.currentMesh);
      }
      this.currentMesh = object;
      this.scene.add(object);
    }

    changeModel(delta) {
      if (!this.models.length) return;
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

  initWhenReady();
})();
