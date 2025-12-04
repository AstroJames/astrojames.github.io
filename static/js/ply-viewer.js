(function () {
  const READY_STATES = ['complete', 'interactive'];
  const MAX_POINTS = 150000;
  const MIN_POINT_SIZE = 2.0;
  const MAX_POINT_SIZE = 8.0;

  function initWhenReady() {
    console.info('[PLY viewer] initializing…');
    if (!READY_STATES.includes(document.readyState)) {
      document.addEventListener('DOMContentLoaded', initPlyViewers, { once: true });
    } else {
      initPlyViewers();
    }
  }

  function initPlyViewers() {
    const viewers = document.querySelectorAll('.ply-viewer');
    if (!viewers.length) {
      console.warn('[PLY viewer] no viewer blocks found on page');
    }
    viewers.forEach(root => {
      if (root.dataset.plyViewerInit) return;
      root.dataset.plyViewerInit = 'true';
      new PlyViewer(root);
    });
  }

  class PlyViewer {
    constructor(root) {
      this.root = root;
      console.info('[PLY viewer] initializing viewer', { id: root.id });
      this.models = this.extractModels();
      this.selectEl = root.querySelector('select');
      this.statusEl = root.querySelector('.ply-viewer__status');
      this.canvas = root.querySelector('canvas');
      this.buttons = root.querySelectorAll('[data-direction]');
      this.currentIndex = 0;
      this.currentGeometry = null;
      this.isDragging = false;
      this.rotation = { theta: 0, phi: 0 };
      this.distance = 2.5;
      this.loadToken = 0;

      if (!this.canvas) {
        this.setStatus('Canvas element missing.', true);
        console.error('[PLY viewer] canvas missing; aborting');
        return;
      }

      if (!this.models.length) {
        this.setStatus('No models configured.', true);
        console.error('[PLY viewer] models array empty; check front matter');
        return;
      }

      this.gl = this.canvas.getContext('webgl', { antialias: true });
      if (!this.gl) {
        this.setStatus('WebGL not supported in this browser.', true);
        console.error('[PLY viewer] WebGL context unavailable');
        return;
      }

      this.initGL();
      this.bindEvents();
      this.resizeCanvas();
      this.loadModel(0);
      this.renderLoop();
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

    initGL() {
      const gl = this.gl;
      const vertexSrc = `
        attribute vec3 position;
        attribute vec3 color;
        uniform mat4 uMatrix;
        uniform float uPointSize;
        varying vec3 vColor;
        void main() {
          gl_Position = uMatrix * vec4(position, 1.0);
          gl_PointSize = uPointSize;
          vColor = color;
        }
      `;

      const fragmentSrc = `
        precision mediump float;
        varying vec3 vColor;
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = dot(coord, coord);
          if (dist > 0.25) discard;
          gl_FragColor = vec4(vColor, 1.0);
        }
      `;

      this.program = this.createProgram(vertexSrc, fragmentSrc);
      gl.useProgram(this.program);

      this.attributes = {
        position: gl.getAttribLocation(this.program, 'position'),
        color: gl.getAttribLocation(this.program, 'color'),
      };

      this.uniforms = {
        matrix: gl.getUniformLocation(this.program, 'uMatrix'),
        pointSize: gl.getUniformLocation(this.program, 'uPointSize'),
      };

      this.positionBuffer = gl.createBuffer();
      this.colorBuffer = gl.createBuffer();

      gl.enableVertexAttribArray(this.attributes.position);
      gl.enableVertexAttribArray(this.attributes.color);

      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.01, 0.02, 0.05, 1.0);

      this.pointCount = 0;
    }

    createProgram(vertexSrc, fragmentSrc) {
      const gl = this.gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSrc);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSrc);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`WebGL program failed to link: ${info}`);
      }
      return program;
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`WebGL shader compile error: ${info}`);
      }
      return shader;
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

      this.canvas.addEventListener('pointerdown', event => this.startDrag(event));
      window.addEventListener('pointermove', event => this.onPointerMove(event));
      window.addEventListener('pointerup', () => this.endDrag());
      this.canvas.addEventListener('wheel', event => this.onWheel(event), { passive: false });
      window.addEventListener('resize', () => this.resizeCanvas());
    }

    startDrag(event) {
      this.isDragging = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
    }

    onPointerMove(event) {
      if (!this.isDragging || !this.lastPointer) return;
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      const sensitivity = 0.005;
      this.rotation.theta += dx * sensitivity;
      this.rotation.phi = clamp(this.rotation.phi + dy * sensitivity, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    }

    endDrag() {
      this.isDragging = false;
      this.lastPointer = null;
    }

    onWheel(event) {
      event.preventDefault();
      const zoomFactor = 1.0 + Math.abs(event.deltaY) * 0.0015;
      if (event.deltaY < 0) {
        this.distance /= zoomFactor;
      } else {
        this.distance *= zoomFactor;
      }
      this.distance = clamp(this.distance, 0.8, 8.0);
    }

    resizeCanvas() {
      if (!this.canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(rect.width, 200);
      const height = Math.max(rect.height, 200);
      const displayWidth = Math.floor(width * dpr);
      const displayHeight = Math.floor(height * dpr);

      if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
        this.canvas.width = displayWidth;
        this.canvas.height = displayHeight;
      }
    }

    async loadModel(index) {
      const model = this.models[index];
      if (!model) {
        this.setStatus('Model not found.', true);
        return;
      }

      this.currentIndex = index;
      this.setStatus(`Loading ${model.label || model.file}…`);
      const token = ++this.loadToken;

      try {
        const response = await fetch(model.file, { cache: 'force-cache' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        if (this.loadToken !== token) return;
        const parsed = this.parsePLY(text);
        this.applyGeometry(parsed);
        const note = parsed.sampleInfo ? ` (${parsed.sampleInfo})` : '';
        this.setStatus(`${model.label || model.file} ready${note}. Drag to rotate, scroll to zoom.`);
        console.info('[PLY viewer] loaded model', { file: model.file, points: this.pointCount, downsample: parsed.sampleInfo || '1:1' });
      } catch (error) {
        console.error('PLY load error', error);
        if (this.loadToken === token) {
          this.setStatus('Failed to load model.', true);
        }
      }
    }

    parsePLY(text) {
      const lines = text.split(/\r?\n/);
      if (!lines.length || lines[0].trim() !== 'ply') {
        throw new Error('Not a PLY file');
      }

      let lineNo = 1;
      let vertexCount = 0;
      let element = null;
      const properties = [];
      while (lineNo < lines.length) {
        const line = lines[lineNo++].trim();
        if (!line) continue;
        if (line === 'end_header') break;
        const parts = line.split(/\s+/);
        const keyword = parts[0];
        if (keyword === 'element') {
          element = parts[1];
          if (element === 'vertex') {
            vertexCount = parseInt(parts[2], 10) || 0;
          }
        } else if (keyword === 'property' && element === 'vertex') {
          properties.push(parts[parts.length - 1]);
        }
      }

      if (!vertexCount) {
        throw new Error('PLY file missing vertex data');
      }

      const positions = [];
      const colors = [];
      let processed = 0;
      let sampled = 0;
      const step = Math.max(1, Math.floor(vertexCount / MAX_POINTS));

      while (lineNo < lines.length && processed < vertexCount) {
        const line = lines[lineNo++].trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length < properties.length) continue;
        if (processed % step === 0) {
          let x = 0, y = 0, z = 0;
          let r = 200, g = 200, b = 220;
          properties.forEach((prop, idx) => {
            const value = parts[idx];
            switch (prop) {
              case 'x': x = parseFloat(value) || 0; break;
              case 'y': y = parseFloat(value) || 0; break;
              case 'z': z = parseFloat(value) || 0; break;
              case 'red': r = parseFloat(value) || 200; break;
              case 'green': g = parseFloat(value) || 200; break;
              case 'blue': b = parseFloat(value) || 220; break;
              default: break;
            }
          });
          positions.push(x, y, z);
          colors.push(r / 255, g / 255, b / 255);
          sampled++;
        }
        processed++;
      }

      if (!positions.length) {
        throw new Error('No vertices parsed from PLY file');
      }

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const centerZ = (minZ + maxZ) / 2;
      const spanX = maxX - minX;
      const spanY = maxY - minY;
      const spanZ = maxZ - minZ;
      const maxSpan = Math.max(spanX, spanY, spanZ) || 1;
      const scale = 2 / maxSpan;

      const positionArray = new Float32Array(positions.length);
      for (let i = 0; i < positions.length; i += 3) {
        positionArray[i] = (positions[i] - centerX) * scale;
        positionArray[i + 1] = (positions[i + 1] - centerY) * scale;
        positionArray[i + 2] = (positions[i + 2] - centerZ) * scale;
      }

      const colorArray = new Float32Array(colors);
      const sampleInfo = step > 1 ? `down-sampled 1:${step}` : '';

      return {
        positions: positionArray,
        colors: colorArray,
        sampleInfo,
      };
    }

    applyGeometry(parsed) {
      const gl = this.gl;
      this.pointCount = parsed.positions.length / 3;

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, parsed.positions, gl.STATIC_DRAW);
      gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, parsed.colors, gl.STATIC_DRAW);
      gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, 0, 0);

      const density = Math.sqrt(this.pointCount);
      const size = clamp(400 / density, MIN_POINT_SIZE, MAX_POINT_SIZE);
      this.pointSize = size * (window.devicePixelRatio || 1);
    }

    changeModel(delta) {
      if (!this.models.length) return;
      const nextIndex = (this.currentIndex + delta + this.models.length) % this.models.length;
      if (this.selectEl) {
        this.selectEl.value = String(nextIndex);
      }
      this.loadModel(nextIndex);
    }

    renderLoop() {
      requestAnimationFrame(() => this.renderLoop());
      const gl = this.gl;
      if (!gl) return;

      this.resizeCanvas();
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      if (!this.pointCount) {
        return;
      }

      const aspect = this.canvas.width / this.canvas.height;
      const projection = perspectiveMatrix(45 * Math.PI / 180, aspect, 0.1, 50);
      const eye = sphericalToCartesian(this.distance, this.rotation.theta, this.rotation.phi);
      const view = lookAtMatrix(eye, [0, 0, 0], [0, 1, 0]);
      const matrix = multiplyMatrices(projection, view);

      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.uniforms.matrix, false, matrix);
      gl.uniform1f(this.uniforms.pointSize, this.pointSize);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, this.pointCount);
    }

    setStatus(message, isError = false) {
      if (!this.statusEl) return;
      this.statusEl.textContent = message;
      this.statusEl.style.color = isError ? '#f87171' : 'rgba(255,255,255,0.7)';
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function identityMatrix() {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }

  function multiplyMatrices(a, b) {
    const out = new Float32Array(16);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
    const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
    const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
    const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

    out[0] = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
    out[1] = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
    out[2] = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
    out[3] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;
    out[4] = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
    out[5] = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
    out[6] = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
    out[7] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;
    out[8] = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
    out[9] = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
    out[10] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
    out[11] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;
    out[12] = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;
    out[13] = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;
    out[14] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;
    out[15] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;
    return out;
  }

  function perspectiveMatrix(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0,
    ]);
  }

  function sphericalToCartesian(radius, theta, phi) {
    const cosPhi = Math.cos(phi);
    return [
      radius * Math.sin(theta) * cosPhi,
      radius * Math.sin(phi),
      radius * Math.cos(theta) * cosPhi,
    ];
  }

  function lookAtMatrix(eye, target, up) {
    const zAxis = normalizeVector([
      eye[0] - target[0],
      eye[1] - target[1],
      eye[2] - target[2],
    ]);
    const xAxis = normalizeVector(crossProduct(up, zAxis));
    const yAxis = crossProduct(zAxis, xAxis);

    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -dotProduct(xAxis, eye), -dotProduct(yAxis, eye), -dotProduct(zAxis, eye), 1,
    ]);
  }

  function normalizeVector(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  function crossProduct(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function dotProduct(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  initWhenReady();
})();
