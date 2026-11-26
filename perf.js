export const PERF_CONFIG = {
  starCount: 120,
  backgroundStarCount: 80,
  nebulaSpin: 0
};

export const FRAME_MS = 1000 / 30 - 4;

const reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function isPaused() {
  return document.hidden || Boolean(reducedMotion && reducedMotion.matches);
}

export function watchPaused(onChange) {
  const notify = () => onChange(isPaused());
  document.addEventListener("visibilitychange", notify);
  if (reducedMotion) {
    reducedMotion.addEventListener("change", notify);
  }
}
