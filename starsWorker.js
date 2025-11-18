import { DEFAULT_CONFIG, createStarfieldEngine } from "./starfieldEngine.js";

let engine = null;
let running = false;
let lastTime = 0;

self.addEventListener("message", event => {
  const data = event.data || {};
  switch (data.type) {
    case "init":
      handleInit(data);
      break;
    case "resize":
      handleResize(data);
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
  engine = createStarfieldEngine(ctx, { ...DEFAULT_CONFIG, ...(config || {}) });
}

function handleResize({ width, height, dpr = 1 }) {
  if (!engine) {
    return;
  }
  engine.resize(width, height, dpr);
  if (!running) {
    running = true;
    lastTime = performance.now();
    loop(lastTime);
  }
}

function loop(now = performance.now()) {
  if (!running || !engine) {
    return;
  }
  const dt = Math.min(now - lastTime, 60);
  lastTime = now;
  engine.frame(dt);
  scheduleNextFrame();
}

function scheduleNextFrame() {
  if (typeof self.requestAnimationFrame === "function") {
    self.requestAnimationFrame(loop);
  } else {
    setTimeout(() => loop(performance.now()), 16);
  }
}
