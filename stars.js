import { DEFAULT_CONFIG, createStarfieldEngine } from "./starfieldEngine.js";

const STAR_CONFIG = {...DEFAULT_CONFIG};

const STAR_SCRIPT_URL = import.meta.url;

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("warp-canvas");
  if (!canvas) {
    return;
  }

  if (!setupWorkerStarfield(canvas)) {
    startInlineStarfield(canvas);
  }
});

function setupWorkerStarfield(canvas) {
  if (!window.OffscreenCanvas || !window.Worker) {
    return false;
  }

  try {
    const workerUrl = STAR_SCRIPT_URL
      ? new URL("./starsWorker.js", STAR_SCRIPT_URL)
      : new URL("./starsWorker.js", window.location.href);

    const worker = new Worker(workerUrl, { type: "module" });
    const offscreen = canvas.transferControlToOffscreen();

    const sendResize = () => {
      worker.postMessage({
        type: "resize",
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1
      });
    };

    worker.postMessage({ type: "init", canvas: offscreen, config: STAR_CONFIG }, [offscreen]);
    sendResize();
    window.addEventListener("resize", sendResize);
    window.addEventListener("beforeunload", () => worker.terminate());
    return true;
  } catch (error) {
    console.warn("OffscreenCanvas worker failed, falling back", error);
    return false;
  }
}

function startInlineStarfield(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const engine = createStarfieldEngine(ctx, STAR_CONFIG);

  const handleResize = () => {
    engine.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  };

  window.addEventListener("resize", handleResize);
  handleResize();

  let lastTime = performance.now();
  function animate(now) {
    const dt = Math.min(now - lastTime, 60);
    lastTime = now;
    engine.frame(dt);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
