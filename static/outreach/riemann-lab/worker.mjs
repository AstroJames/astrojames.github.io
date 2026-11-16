import { Experiment, stableDt } from './core.mjs';

let experiment, running = false, playback = 1, lastTick = 0, lastFrame = 0, revision = 0, targetTime = 0, fault = false;
function frame() {
  postMessage({ type: 'frame', revision, running, cfg: experiment.cfg, time: experiment.time,
    displacement: experiment.displacement, steps: experiment.steps, retries: experiment.retries,
    methods: experiment.methods, states: experiment.states, diagnostics: experiment.diagnostics(),
    corrections: experiment.corrections, history: experiment.history.slice(-12) });
  lastFrame = performance.now();
}
function guard(fn) {
  try { fn(); } catch (error) {
    running = false; fault = true;
    if (experiment) frame();
    postMessage({ type: 'error', message: error.message });
  }
}
self.onmessage = ({ data: m }) => guard(() => {
  if (m.type === 'init') {
    running = false; fault = false; revision = m.revision;
    experiment = new Experiment(m.config); targetTime = 0; frame();
  } else if (experiment) {
    if (m.revision !== revision || fault) return;
    if (m.type === 'run') { running = m.running; targetTime = experiment.time; lastTick = performance.now(); }
    if (m.type === 'method') experiment.setMethod(m.run, m.method);
    if (m.type === 'speed') experiment.setSpeed(m.speed);
    if (m.type === 'fofc') experiment.setFOFC(m.enabled);
    if (m.type === 'integrator') experiment.setIntegrator(m.integrator);
    if (m.type === 'playback') playback = m.value;
    if (m.type === 'fork') experiment.fork();
    if (m.type === 'step') { running = false; experiment.step(); targetTime = experiment.time; }
    frame();
  }
});
function tick() {
  guard(() => {
    if (!running || !experiment) return;
    const now = performance.now(), elapsed = Math.min((now - lastTick) / 1000, 0.05);
    lastTick = now;
    const rate = experiment.cfg.nv === 1 ? 0.12 : 0.025;
    // Wall time schedules complete CFL steps. It must never set the numerical dt.
    targetTime += elapsed * rate * playback;
    const deadline = performance.now() + 9;
    while (performance.now() < deadline) {
      const dt = Math.min(...experiment.states.map(u => stableDt(u, experiment.cfg)));
      if (experiment.time + dt > targetTime + 1e-14) break;
      if (!experiment.step()) break;
    }
    if (!running || now - lastFrame >= 40) frame();
  });
  setTimeout(tick, 16);
}
tick();
