import { PERF_CONFIG, FRAME_MS, isPaused, watchPaused } from "./perf.js";

const RESIZE_DEBOUNCE_MS = 150;
const MIN_VIEW_DELTA = 2;

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
    const worker = new Worker(new URL("./starsWorker.js", import.meta.url), { type: "module" });
    const offscreen = canvas.transferControlToOffscreen();

    const dispatcher = createResizeDispatcher(view => {
      worker.postMessage({
        type: "resize",
        width: view.width,
        height: view.height,
        dpr: view.dpr
      });
    });

    worker.postMessage({ type: "init", canvas: offscreen }, [offscreen]);
    worker.postMessage({ type: "pause", paused: isPaused() });
    watchPaused(paused => worker.postMessage({ type: "pause", paused }));
    dispatcher.flush();
    window.addEventListener("resize", dispatcher.queue, { passive: true });
    window.addEventListener("orientationchange", dispatcher.resetAndQueue, { passive: true });
    window.addEventListener("beforeunload", () => worker.terminate());
    return true;
  } catch (error) {
    console.warn("OffscreenCanvas worker failed, falling back", error);
    return false;
  }
}

async function startInlineStarfield(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const { createStarfieldEngine } = await import("./starfieldEngine.js");
  const engine = createStarfieldEngine(ctx, PERF_CONFIG);

  const dispatcher = createResizeDispatcher(view => {
    engine.resize(view.width, view.height, view.dpr);
  });

  window.addEventListener("resize", dispatcher.queue, { passive: true });
  window.addEventListener("orientationchange", dispatcher.resetAndQueue, { passive: true });
  dispatcher.flush();

  let lastTime = performance.now();
  let running = false;
  let generation = 0;
  function animate(now, id) {
    if (!running || id !== generation) {
      return;
    }
    if (now - lastTime >= FRAME_MS) {
      const dt = Math.min(now - lastTime, 60);
      lastTime = now;
      engine.frame(dt);
    }
    requestAnimationFrame(time => animate(time, id));
  }

  function setPaused(paused) {
    running = !paused;
    generation++;
    if (running) {
      lastTime = performance.now();
      const id = generation;
      requestAnimationFrame(time => animate(time, id));
    }
  }

  setPaused(isPaused());
  watchPaused(setPaused);
}

function readViewport() {
  const vv = window.visualViewport;
  const width = vv && vv.width ? vv.width : window.innerWidth;
  const height = vv && vv.height ? vv.height : window.innerHeight;
  return {
    width: Math.round(width || 0),
    height: Math.round(height || 0),
    dpr: window.devicePixelRatio || 1
  };
}

function createResizeDispatcher(onChange) {
  let last = { width: 0, height: 0, dpr: 0 };
  let timer = null;

  const emit = () => {
    timer = null;
    const next = readViewport();
    const widthDelta = Math.abs(next.width - last.width);
    const heightDelta = Math.abs(next.height - last.height);
    const dprChanged = next.dpr !== last.dpr;
    if (widthDelta < MIN_VIEW_DELTA && heightDelta < MIN_VIEW_DELTA && !dprChanged) {
      return;
    }
    last = next;
    onChange(next);
  };

  const queue = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(emit, RESIZE_DEBOUNCE_MS);
  };

  const resetAndQueue = () => {
    last = { width: 0, height: 0, dpr: 0 };
    queue();
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    emit();
  };

  return { queue, resetAndQueue, flush };
}
