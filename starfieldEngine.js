const clamp01 = value => Math.min(Math.max(value, 0), 1);

export const DEFAULT_CONFIG = {
  starCount: 240,
  baseSpeed: 0.03,
  speedSpread: 0.06,
  minTrail: 30,
  trailRange: 80,
  maxLineWidth: 10,
  minLineWidth: 1,
  resetPadding: 80,
  backgroundFillStyle: null,
  fadeStops: [
    { offset: 0, alpha: 0 },
    { offset: 0.5, alpha: 0.5 },
    { offset: 1, alpha: 1 }
  ],
  maskInnerRadius: 200,
  maskOuterRadius: 500,
  maskInnerAlpha: 1.0,
  maskOuterAlpha: 0.0,
  maskInnerScaleX: null,
  maskInnerScaleY: null,
  maskOuterScaleX: null,
  maskOuterScaleY: null
};

export function createStarfieldEngine(ctx, customConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let width = 0;
  let height = 0;
  let cx = 0;
  let cy = 0;
  let maxTravel = 0;
  let stars = [];
  let maskCanvas = null;
  let maskCtx = null;
  let maskDpr = 1;
  let maskNeedsUpdate = true;

  class Star {
    constructor(seedWarm = false) {
      this.angle = 0;
      this.cos = 0;
      this.sin = 0;
      this.dist = 0;
      this.speed = 0;
      this.tailLength = 0;
      this.lineWidth = 1;
      this.hue = 0;
      this.reset(seedWarm);
    }

    reset(warm = false) {
      this.angle = Math.random() * Math.PI * 2;
      this.cos = Math.cos(this.angle);
      this.sin = Math.sin(this.angle);
      this.speed = config.baseSpeed + Math.random() * config.speedSpread;
      this.tailLength = config.minTrail + Math.random() * config.trailRange;
      this.lineWidth = config.minLineWidth + Math.random() * (config.maxLineWidth - config.minLineWidth);
      this.hue = Math.floor(180 + Math.random() * 180);
      this.dist = warm ? Math.random() * maxTravel : 0;
      this.updatePosition();
    }

    updatePosition() {
      this.x = cx + this.cos * this.dist;
      this.y = cy + this.sin * this.dist;
      const startDist = Math.max(this.dist - this.tailLength, 0);
      this.startX = cx + this.cos * startDist;
      this.startY = cy + this.sin * startDist;
    }

    update(dt) {
      this.dist += this.speed * dt;
      if (this.dist > maxTravel) {
        this.reset();
        return;
      }
      this.updatePosition();
    }

    draw() {
      const gradient = ctx.createLinearGradient(this.startX, this.startY, this.x, this.y);
      (config.fadeStops || []).forEach(stop => {
        gradient.addColorStop(stop.offset, `hsla(${this.hue},95%,65%,${stop.alpha})`);
      });
      ctx.strokeStyle = gradient;
      ctx.lineWidth = this.lineWidth;
      ctx.beginPath();
      ctx.moveTo(this.startX, this.startY);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    }
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < config.starCount; i++) {
      stars.push(new Star(true));
    }
  }

  function drawCenterMask() {
    if (!maskCanvas || !maskCtx || width <= 0 || height <= 0) {
      return;
    }
    if (maskNeedsUpdate) {
      renderRectangularMask(width, height);
      maskNeedsUpdate = false;
    }

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(
      maskCanvas,
      0,
      0,
      maskCanvas.width,
      maskCanvas.height,
      0,
      0,
      width,
      height
    );
    ctx.restore();
  }

  return {
    config,
    resize(newWidth, newHeight, dpr = 1) {
      width = Math.max(newWidth, 1);
      height = Math.max(newHeight, 1);
      cx = width / 2;
      cy = height / 2;
      const halfDiag = Math.sqrt(width ** 2 + height ** 2) / 2;
      maxTravel = halfDiag + config.resetPadding;

      if (ctx.canvas) {
        ctx.canvas.width = width * dpr;
        ctx.canvas.height = height * dpr;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      initStars();
      ensureMaskResources(width, height, dpr);
    },
    frame(dt) {
      if (config.backgroundFillStyle) {
        ctx.fillStyle = config.backgroundFillStyle;
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
      for (const star of stars) {
        star.update(dt);
        star.draw();
      }
      drawCenterMask();
    }
  };

  function ensureMaskResources(canvasWidth, canvasHeight, dpr) {
    if (!maskCanvas) {
      maskCanvas = createMaskSurface();
      maskCtx = maskCanvas ? maskCanvas.getContext("2d") : null;
    }
    if (!maskCanvas || !maskCtx) {
      return;
    }

    maskDpr = dpr || 1;
    const pixelWidth = Math.max(Math.floor(canvasWidth * maskDpr), 1);
    const pixelHeight = Math.max(Math.floor(canvasHeight * maskDpr), 1);
    if (maskCanvas.width !== pixelWidth || maskCanvas.height !== pixelHeight) {
      maskCanvas.width = pixelWidth;
      maskCanvas.height = pixelHeight;
    }
    maskNeedsUpdate = true;
  }

  function renderRectangularMask(canvasWidth, canvasHeight) {
    if (!maskCtx || !maskCanvas) {
      return;
    }

    const cssWidth = Math.max(canvasWidth, 1);
    const cssHeight = Math.max(canvasHeight, 1);
    const halfWidth = cssWidth / 2;
    const halfHeight = cssHeight / 2;

    const baseHalf = Math.max(Math.min(halfWidth, halfHeight), 1);
    const rawInner = Math.max(config.maskInnerRadius || 0, 0);
    const rawOuter = Math.max(config.maskOuterRadius || rawInner + 10, rawInner + 10);
    const fallbackInnerScale = clamp01(rawInner / baseHalf);
    const fallbackOuterScale = Math.max(rawOuter / baseHalf, fallbackInnerScale + 0.01);

    const innerScaleX = clamp01(resolveScale(config.maskInnerScaleX, fallbackInnerScale));
    const innerScaleY = clamp01(resolveScale(config.maskInnerScaleY, fallbackInnerScale));

    const maxOuterScaleX = (halfWidth + config.resetPadding) / halfWidth;
    const maxOuterScaleY = (halfHeight + config.resetPadding) / halfHeight;
    const outerScaleX = clampValue(
      resolveScale(config.maskOuterScaleX, fallbackOuterScale),
      innerScaleX + 0.01,
      maxOuterScaleX
    );
    const outerScaleY = clampValue(
      resolveScale(config.maskOuterScaleY, fallbackOuterScale),
      innerScaleY + 0.01,
      maxOuterScaleY
    );

    if (!(outerScaleX > innerScaleX) || !(outerScaleY > innerScaleY)) {
      return;
    }

    const innerWidth = cssWidth * innerScaleX;
    const innerHeight = cssHeight * innerScaleY;
    const outerWidth = cssWidth * outerScaleX;
    const outerHeight = cssHeight * outerScaleY;

    const innerHalfWidth = innerWidth / 2;
    const innerHalfHeight = innerHeight / 2;
    const outerHalfWidth = outerWidth / 2;
    const outerHalfHeight = outerHeight / 2;

    const innerAlpha = clamp01(
      typeof config.maskInnerAlpha === "number" ? config.maskInnerAlpha : 1
    );
    const outerAlpha = clamp01(
      typeof config.maskOuterAlpha === "number" ? config.maskOuterAlpha : 0
    );

    maskCtx.setTransform(1, 0, 0, 1, 0, 0);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    const imageData = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);
    const buffer = imageData.data;
    const deltaAlpha = innerAlpha - outerAlpha;
    const widthPx = maskCanvas.width;
    const heightPx = maskCanvas.height;

    for (let y = 0; y < heightPx; y += 1) {
      const yCss = (y + 0.5) / maskDpr - halfHeight;
      const vFactor = computeAxisFactor(Math.abs(yCss), innerHalfHeight, outerHalfHeight);
      for (let x = 0; x < widthPx; x += 1) {
        const xCss = (x + 0.5) / maskDpr - halfWidth;
        const hFactor = computeAxisFactor(Math.abs(xCss), innerHalfWidth, outerHalfWidth);
        const mix = clamp01(hFactor * vFactor);
        const alpha = clamp01(outerAlpha + deltaAlpha * mix);
        const idx = (y * widthPx + x) * 4;
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = Math.round(alpha * 255);
      }
    }

    maskCtx.putImageData(imageData, 0, 0);
  }

  function computeAxisFactor(distance, innerHalf, outerHalf) {
    if (!(outerHalf > innerHalf)) {
      return 1;
    }
    if (distance <= innerHalf) {
      return 1;
    }
    if (distance >= outerHalf) {
      return 0;
    }
    const span = outerHalf - innerHalf;
    return 1 - (distance - innerHalf) / span;
  }

  function createMaskSurface() {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(1, 1);
    }
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      return document.createElement("canvas");
    }
    return null;
  }

  function resolveScale(explicitValue, fallbackValue) {
    return Number.isFinite(explicitValue) ? explicitValue : fallbackValue;
  }

  function clampValue(value, min, max) {
    const safeValue = Number.isFinite(value) ? value : 0;
    let safeMin = Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY;
    let safeMax = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
    if (safeMin > safeMax) {
      const temp = safeMin;
      safeMin = safeMax;
      safeMax = temp;
    }
    return Math.min(safeMax, Math.max(safeMin, safeValue));
  }
}
