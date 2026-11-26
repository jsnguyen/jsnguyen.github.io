import { DEFAULT_CONFIG, createStarfieldEngine } from "./starfieldEngine.js?v=2";
import { PERF_CONFIG, FRAME_MS } from "./perf.js?v=2";

let engine = null;
let running = false;
let lastTime = 0;
let paused = false;
let generation = 0;

self.addEventListener("message", event => {
  const data = event.data || {};
  switch (data.type) {
    case "init":
      handleInit(data);
      break;
    case "resize":
      handleResize(data);
      break;
    case "pause":
      handlePause(data.paused);
      break;
    default:
      break;
  }
});

function handleInit({ canvas, config }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  engine = createStarfieldEngine(ctx, { ...DEFAULT_CONFIG, ...PERF_CONFIG, ...(config || {}) });
}

function handleResize({ width, height, dpr = 1 }) {
  if (!engine) {
    return;
  }
  engine.resize(width, height, dpr);
  if (!running && !paused) {
    start();
  }
}

function handlePause(value) {
  paused = value;
  if (paused) {
    running = false;
  } else if (engine && !running) {
    start();
  }
}

function start() {
  running = true;
  generation++;
  lastTime = performance.now();
  loop(lastTime, generation);
}

function loop(now, id) {
  if (!running || !engine || id !== generation) {
    return;
  }
  if (now - lastTime >= FRAME_MS) {
    const dt = Math.min(now - lastTime, 60);
    lastTime = now;
    engine.frame(dt);
  }
  scheduleNextFrame(id);
}

function scheduleNextFrame(id) {
  if (typeof self.requestAnimationFrame === "function") {
    self.requestAnimationFrame(now => loop(now, id));
  } else {
    setTimeout(() => loop(performance.now(), id), 16);
  }
}
