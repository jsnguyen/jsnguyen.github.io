const GRID_SETTINGS = {
  radial: {
    lineCount: 32,
    lineWidth: 2.0
  },
  frames: {
    count: 8,
    scaleFactor: 0.875,
    maxSizeRatio: 0.95,
    lineWidth: 2.0
  }
};

const RESIZE_DEBOUNCE_MS = 140;
const MIN_SIZE_DELTA = 2;

document.addEventListener("DOMContentLoaded", () => {
  const renderers = [setupRectGrid(), setupRadialGrid()].filter(Boolean);
  if (!renderers.length) {
    return;
  }

  const drawAll = () => renderers.forEach(draw => draw());
  drawAll();

  let resizeTimer = null;
  const queueResize = () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      drawAll();
    }, RESIZE_DEBOUNCE_MS);
  };

  window.addEventListener("resize", queueResize, { passive: true });
  window.addEventListener("orientationchange", queueResize, { passive: true });
});

function setupRectGrid() {
  const host = document.getElementById("grid-rect");
  if (!host) {
    return null;
  }

  const canvas = createHostCanvas(host);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  return () => {
    const dims = resizeCanvasForHost(canvas, host);
    if (!dims || dims.unchanged) {
      return;
    }

    prepareContext(ctx, dims);

    const strokeStyle = readCssVar(host, "--frame-color");
    if (!strokeStyle) {
      return;
    }

    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = GRID_SETTINGS.frames.lineWidth;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";

    ctx.save();
    ctx.translate(dims.width / 2, dims.height / 2);

    const aspectWidth = dims.width;
    const aspectHeight = dims.height;
    let currentWidth = aspectWidth * GRID_SETTINGS.frames.maxSizeRatio;
    let currentHeight = aspectHeight * GRID_SETTINGS.frames.maxSizeRatio;

    for (let i = 0; i < GRID_SETTINGS.frames.count; i += 1) {
      const halfWidth = currentWidth / 2;
      const halfHeight = currentHeight / 2;
      ctx.strokeRect(-halfWidth, -halfHeight, currentWidth, currentHeight);
      currentWidth *= GRID_SETTINGS.frames.scaleFactor;
      currentHeight *= GRID_SETTINGS.frames.scaleFactor;
      if (currentWidth <= 0.5 || currentHeight <= 0.5) {
        break;
      }
    }

    ctx.restore();
  };
}

function setupRadialGrid() {
  const host = document.getElementById("grid-radial");
  if (!host) {
    return null;
  }

  const canvas = createHostCanvas(host);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  return () => {
    const dims = resizeCanvasForHost(canvas, host);
    if (!dims || dims.unchanged) {
      return;
    }

    prepareContext(ctx, dims);

    const strokeStyle = readCssVar(host, "--frame-color");
    if (!strokeStyle) {
      return;
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = GRID_SETTINGS.radial.lineWidth;
    ctx.lineCap = "round";

    ctx.save();
    ctx.translate(dims.width / 2, dims.height / 2);

    const angles = computeCornerAwareAngles(dims.width, dims.height, GRID_SETTINGS.radial.lineCount);
    const halfWidth = dims.width / 2;
    const halfHeight = dims.height / 2;

    angles.forEach(angle => {
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const reachX = dirX === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dirX);
      const reachY = dirY === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dirY);
      const limit = Math.min(reachX, reachY);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dirX * limit, dirY * limit);
      ctx.stroke();
    });

    ctx.restore();
  };
}

function createHostCanvas(host) {
  const canvas = document.createElement("canvas");
  canvas.width = 0;
  canvas.height = 0;
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  host.replaceChildren(canvas);
  return canvas;
}

function resizeCanvasForHost(canvas, host) {
  const rect = host.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (!width || !height) {
    return null;
  }

  const dpr = window.devicePixelRatio || 1;
  const lastWidth = canvas.__lastWidth || 0;
  const lastHeight = canvas.__lastHeight || 0;
  const lastDpr = canvas.__lastDpr || 0;
  const widthChange = Math.abs(width - lastWidth);
  const heightChange = Math.abs(height - lastHeight);

  if (widthChange < MIN_SIZE_DELTA && heightChange < MIN_SIZE_DELTA && dpr === lastDpr) {
    return { width: lastWidth || width, height: lastHeight || height, dpr, unchanged: true };
  }

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.__lastWidth = width;
  canvas.__lastHeight = height;
  canvas.__lastDpr = dpr;

  return { width, height, dpr, unchanged: false };
}

function prepareContext(ctx, dims) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.scale(dims.dpr, dims.dpr);
}

function readCssVar(source, name) {
  const target = source || document.documentElement;
  if (!target || !name) {
    return "";
  }
  return getComputedStyle(target).getPropertyValue(name).trim();
}

function computeCornerAwareAngles(width, height, desiredCount) {
  const minLines = 4;
  const targetCount = Math.max(desiredCount, minLines);

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight]
  ];

  const cornerAngles = corners
    .map(([x, y]) => Math.atan2(y, x))
    .sort((a, b) => a - b);

  const extendedCorners = [...cornerAngles, cornerAngles[0] + Math.PI * 2];
  const spans = cornerAngles.map((_, idx) => extendedCorners[idx + 1] - extendedCorners[idx]);
  const extraLines = targetCount - minLines;
  const spanCounts = distributeCounts(spans, extraLines);

  const angles = [];
  const pushAngle = angle => {
    let normalized = angle % (Math.PI * 2);
    if (normalized < 0) {
      normalized += Math.PI * 2;
    }
    if (!angles.length) {
      angles.push(normalized);
      return;
    }
    const epsilon = 1e-6;
    if (Math.abs(normalized - angles[angles.length - 1]) < epsilon) {
      return;
    }
    angles.push(normalized);
  };

  for (let i = 0; i < spans.length; i += 1) {
    const start = extendedCorners[i];
    const end = extendedCorners[i + 1];
    const segments = spanCounts[i] + 1;

    if (i === 0) {
      pushAngle(start);
    }

    const maxStep = i === spans.length - 1 ? segments - 1 : segments;

    for (let step = 1; step <= maxStep; step += 1) {
      const t = step / segments;
      pushAngle(start + t * (end - start));
    }

  }

  return angles;
}

function distributeCounts(spans, total) {
  const totalSpan = spans.reduce((sum, span) => sum + span, 0);
  if (total <= 0 || totalSpan <= 0) {
    return spans.map(() => 0);
  }

  const provisional = spans.map(span => (span / totalSpan) * total);
  const baseCounts = provisional.map(value => Math.floor(value));
  let remaining = total - baseCounts.reduce((sum, value) => sum + value, 0);

  const remainders = provisional
    .map((value, idx) => ({ idx, frac: value - baseCounts[idx] }))
    .sort((a, b) => b.frac - a.frac);

  let cursor = 0;
  while (remaining > 0 && remainders.length) {
    const target = remainders[cursor % remainders.length].idx;
    baseCounts[target] += 1;
    remaining -= 1;
    cursor += 1;
  }

  return baseCounts;
}
