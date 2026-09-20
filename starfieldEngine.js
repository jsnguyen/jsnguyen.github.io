const clamp01 = value => Math.min(Math.max(value, 0), 1);

export const DEFAULT_CONFIG = {
  starCount: 210,
  maxPixelRatio: 1.5,
  maxCanvasPixels: 3000000,
  baseSpeed: 0.03,
  speedSpread: 0.06,
  minTrail: 40,
  trailRange: 120,
  maxLineWidth: 2.5,
  minLineWidth: 0.6,
  colors: [
    "65,205,255", // Blue
    "245,250,255", // White
    "255,220,70", // Yellow
    "255,164,64", // Orange
    "255,55,35" // Red
  ],
  colorWavePeriod: 90000,
  flightColorShift: 0.2,
  backgroundStarCount: 160,
  backgroundStarOpacity: 0.45,
  nebulaOpacity: 0.36,
  orbitalArcCount: 5,
  orbitalArcOpacity: 0.18,
  wormholeTwist: 0.65,
  resetPadding: 80,
  backgroundFillStyle: "#070b13",
  fadeStops: [
    { offset: 0, alpha: 0 },
    { offset: 0.65, alpha: 0.25 },
    { offset: 1, alpha: 1 }
  ],
  maskInnerRadius: 100,
  maskOuterRadius: 300,
  maskInnerAlpha: 1.0,
  maskOuterAlpha: 0.0
};

export function createStarfieldEngine(ctx, customConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  const palette = config.colors.map(color => color.split(",").map(Number));
  // The golden angle spreads colors evenly without tying them to screen position.
  const colorPhaseStep = Math.PI * (3 - Math.sqrt(5));
  let width = 0;
  let height = 0;
  let cx = 0;
  let cy = 0;
  let maxTravel = 0;
  let elapsed = 0;
  const stars = [];
  const backgroundStars = Array.from({ length: config.backgroundStarCount }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: 0.5 + Math.random() ** 3,
    phase: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.0006 + Math.random() * 0.0004
  }));
  let backgroundSprite = null;
  let nebulaCanvas = null;
  let orbitalArcs = null;
  let maskCanvas = null;
  let maskCtx = null;
  let maskX = 0;
  let maskY = 0;

  const renderFrame = (dt = 0) => {
    dt = Math.min(Math.max(dt, 0), 60);
    elapsed += dt;
    if (config.backgroundFillStyle) {
      ctx.fillStyle = config.backgroundFillStyle;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = "lighter";
    if (nebulaCanvas && config.nebulaOpacity > 0) {
      const size = maxTravel * 2.2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(elapsed * 0.000015);
      ctx.globalAlpha = config.nebulaOpacity;
      ctx.drawImage(nebulaCanvas, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    if (orbitalArcs) {
      ctx.strokeStyle = `rgba(208,218,235,${config.orbitalArcOpacity})`;
      ctx.lineWidth = 0.65;
      ctx.stroke(orbitalArcs);
    }
    if (backgroundSprite) {
      for (const star of backgroundStars) {
        const size = star.size * 24;
        const pulse = 1 + 0.2 * Math.sin(elapsed * star.twinkleSpeed + star.phase);
        const x = star.x * width + Math.sin(elapsed * 0.0001 + star.phase) * 3;
        const y = star.y * height + Math.cos(elapsed * 0.00008 + star.phase) * 3;
        ctx.globalAlpha = clamp01(config.backgroundStarOpacity * (0.4 + star.size * 0.4) * pulse);
        ctx.drawImage(backgroundSprite, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }
    for (const star of stars) {
      star.update(dt);
      star.draw();
    }
    ctx.globalCompositeOperation = "source-over";
    if (maskCanvas && maskCtx) {
      ctx.drawImage(maskCanvas, maskX, maskY);
    }
  };

  function sampleStarColor(phase, depth) {
    // Stars keep their own phase while drifting together through neighboring colors.
    const drift = elapsed * Math.PI * 2 / config.colorWavePeriod;
    const position = (1 + Math.cos(phase + drift + depth * config.flightColorShift)) * 0.5 * (palette.length - 1);
    const index = Math.floor(position);
    const mix = position - index;
    return { index, next: Math.min(index + 1, palette.length - 1), mix: mix * mix * (3 - 2 * mix) };
  }

  class Star {
    constructor(colorPhase, seedWarm = false) {
      this.colorPhase = colorPhase;
      this.reset(seedWarm);
    }

    reset(warm = false) {
      this.angle = Math.random() * Math.PI * 2;
      this.speed = config.baseSpeed + Math.random() * config.speedSpread;
      this.tailLength = config.minTrail + Math.random() * config.trailRange;
      this.lineWidth = config.minLineWidth + Math.random() * (config.maxLineWidth - config.minLineWidth);
      this.dist = warm ? Math.random() * maxTravel : 0;
      this.updatePosition();
    }

    updatePosition() {
      this.depth = clamp01(this.dist / maxTravel);
      const angle = this.angle + this.depth * config.wormholeTwist;
      this.x = cx + Math.cos(angle) * this.dist;
      this.y = cy + Math.sin(angle) * this.dist;
      const startDist = Math.max(this.dist - this.tailLength * (0.25 + this.depth), 0);
      this.startDepth = startDist / maxTravel;
      const startAngle = this.angle + this.startDepth * config.wormholeTwist;
      this.startX = cx + Math.cos(startAngle) * startDist;
      this.startY = cy + Math.sin(startAngle) * startDist;

      // Bend the trail through the midpoint of its spiral path.
      const midDist = (startDist + this.dist) / 2;
      const midAngle = this.angle + midDist / maxTravel * config.wormholeTwist;
      this.controlX = 2 * (cx + Math.cos(midAngle) * midDist) - (this.startX + this.x) / 2;
      this.controlY = 2 * (cy + Math.sin(midAngle) * midDist) - (this.startY + this.y) / 2;
    }

    update(dt) {
      this.dist += this.speed * dt * (0.5 + this.depth * 3);
      if (this.dist > maxTravel) {
        this.reset();
        return;
      }
      this.updatePosition();
    }

    draw() {
      if (this.dist === 0) {
        return;
      }
      const lineWidth = this.lineWidth * (0.3 + this.depth);
      const padding = lineWidth * 3 + 1;
      if (Math.max(this.startX, this.controlX, this.x) < -padding || Math.min(this.startX, this.controlX, this.x) > width + padding) {
        return;
      }
      if (Math.max(this.startY, this.controlY, this.y) < -padding || Math.min(this.startY, this.controlY, this.y) > height + padding) {
        return;
      }
      const gradient = ctx.createLinearGradient(this.startX, this.startY, this.x, this.y);
      (config.fadeStops || []).forEach(stop => {
        const depth = this.startDepth + (this.depth - this.startDepth) * stop.offset;
        const { index, next, mix } = sampleStarColor(this.colorPhase, depth);
        const color = palette[index].map((channel, i) => Math.round(channel + (palette[next][i] - channel) * mix)).join(",");
        gradient.addColorStop(stop.offset, `rgba(${color},${stop.alpha})`);
      });
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(this.startX, this.startY);
      ctx.quadraticCurveTo(this.controlX, this.controlY, this.x, this.y);

      // A wide, faint stroke gives the trail a glow without a blur filter.
      ctx.globalAlpha = 0.08;
      ctx.lineWidth = lineWidth * 6;
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = lineWidth * 3;
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      const headLength = Math.min(8, this.dist) * this.depth;
      const headAngle = Math.atan2(this.y - this.controlY, this.x - this.controlX);
      ctx.strokeStyle = "#f5faff";
      ctx.lineWidth = lineWidth * 0.5;
      ctx.beginPath();
      ctx.moveTo(this.x - Math.cos(headAngle) * headLength, this.y - Math.sin(headAngle) * headLength);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function syncStarCount() {
    const desired = Math.max(Math.floor(config.starCount || 0), 0);
    while (stars.length < desired) {
      stars.push(new Star(stars.length * colorPhaseStep, true));
    }
    if (stars.length > desired) {
      stars.length = desired;
    }
  }

  function rescaleStars(prevMaxTravel) {
    if (!(prevMaxTravel > 0)) {
      stars.forEach(star => star.updatePosition());
      return;
    }
    const travelScale = maxTravel / prevMaxTravel;
    for (const star of stars) {
      star.dist *= travelScale;
      if (star.dist > maxTravel) {
        star.reset(true);
      } else {
        star.updatePosition();
      }
    }
  }

  return {
    config,
    resize(newWidth, newHeight, dpr = 1) {
      const prevMaxTravel = maxTravel;
      width = Math.max(newWidth, 1);
      height = Math.max(newHeight, 1);
      cx = width / 2;
      cy = height / 2;
      const halfDiag = Math.sqrt(width ** 2 + height ** 2) / 2;
      maxTravel = halfDiag + config.resetPadding;
      // Bound the compositing cost on Retina and large external displays.
      dpr = Math.min(dpr, config.maxPixelRatio, Math.sqrt(config.maxCanvasPixels / (width * height)));

      if (ctx.canvas) {
        ctx.canvas.width = width * dpr;
        ctx.canvas.height = height * dpr;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      backgroundSprite = createBackgroundSprite(dpr);
      if (!nebulaCanvas) {
        nebulaCanvas = createNebulaTexture();
      }
      orbitalArcs = createOrbitalArcs();
      renderCenterMask();

      rescaleStars(prevMaxTravel);
      syncStarCount();

      renderFrame(0); // Draw immediately to avoid visible flashes after resize
    },
    frame: renderFrame
  };

  function createOrbitalArcs() {
    if (typeof Path2D === "undefined" || config.orbitalArcCount <= 0) {
      return null;
    }
    // Cache the closed ellipses as one path; extra orbits fit between the preview's three.
    const arcs = new Path2D();
    const count = Math.floor(config.orbitalArcCount);
    const tilt = -0.33;
    for (let i = 0; i < count; i++) {
      const position = i * 2 / Math.max(count - 1, 1);
      const rx = width * (0.39 + position * 0.17);
      const ry = height * (0.29 + position * 0.17);
      arcs.moveTo(cx + rx * Math.cos(tilt), cy + rx * Math.sin(tilt));
      arcs.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
      arcs.closePath();
      const angle = 0.85 + position * 1.4;
      const x = cx + Math.cos(angle) * rx * Math.cos(tilt) - Math.sin(angle) * ry * Math.sin(tilt);
      const y = cy + Math.cos(angle) * rx * Math.sin(tilt) + Math.sin(angle) * ry * Math.cos(tilt);
      arcs.moveTo(x + 1.5, y);
      arcs.arc(x, y, 1.5, 0, Math.PI * 2);
    }
    return arcs;
  }

  function createBackgroundSprite(dpr) {
    const sprite = createCanvasSurface();
    const backgroundCtx = sprite ? sprite.getContext("2d") : null;
    if (!backgroundCtx) {
      return null;
    }

    // Reuse one white star at extra resolution for crisp spikes.
    sprite.width = Math.ceil(48 * dpr);
    sprite.height = Math.ceil(48 * dpr);
    backgroundCtx.setTransform(dpr * 2, 0, 0, dpr * 2, 0, 0);
    backgroundCtx.lineWidth = 0.6;

    const x = 12;
    const y = 12;
    const radius = 8;
    const glow = backgroundCtx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.15, "rgba(255,255,255,0.45)");
    glow.addColorStop(1, "rgba(255,255,255,0)");

    backgroundCtx.globalAlpha = 0.12;
    backgroundCtx.fillStyle = glow;
    backgroundCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    // Three axes, 60 degrees apart, produce six tapered diffraction spikes.
    backgroundCtx.globalAlpha = 1;
    backgroundCtx.strokeStyle = glow;
    backgroundCtx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3;
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;
      backgroundCtx.moveTo(x - dx, y - dy);
      backgroundCtx.lineTo(x + dx, y + dy);
    }
    backgroundCtx.stroke();
    backgroundCtx.fillStyle = "white";
    backgroundCtx.beginPath();
    backgroundCtx.arc(x, y, 0.65, 0, Math.PI * 2);
    backgroundCtx.fill();
    return sprite;
  }

  function createNebulaTexture() {
    const nebula = createCanvasSurface();
    const nebulaCtx = nebula ? nebula.getContext("2d") : null;
    if (!nebulaCtx) {
      return null;
    }

    // Build the clouds, wisps, and color gradient once; each frame draws one texture.
    nebula.width = nebula.height = 640;
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 130; i++) {
        const depth = 0.08 + i / 130 * 0.84;
        const angle = arm * Math.PI * 2 / 3 + depth * 3 + Math.sin(depth * 18 + arm) * 0.16;
        const radius = depth * 300;
        const spread = (22 + depth * 52) * (0.65 + Math.random() * 0.7);
        const x = 320 + Math.cos(angle) * radius + (Math.random() - 0.5) * spread;
        const y = 320 + Math.sin(angle) * radius + (Math.random() - 0.5) * spread;
        nebulaCtx.save();
        nebulaCtx.translate(x, y);
        nebulaCtx.rotate(angle);
        nebulaCtx.scale(spread, spread * 0.65);
        const cloud = nebulaCtx.createRadialGradient(0, 0, 0, 0, 0, 1);
        cloud.addColorStop(0, "rgba(255,255,255,0.16)");
        cloud.addColorStop(0.4, "rgba(255,255,255,0.07)");
        cloud.addColorStop(1, "rgba(255,255,255,0)");
        nebulaCtx.fillStyle = cloud;
        nebulaCtx.fillRect(-1, -1, 2, 2);
        nebulaCtx.restore();
      }
    }

    // Feather before rotating a copy so its square boundaries cannot show through.
    const edgeFade = nebulaCtx.createRadialGradient(320, 320, 180, 320, 320, 312);
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      edgeFade.addColorStop(t, `rgba(0,0,0,${1 - t * t * (3 - 2 * t)})`);
    }
    nebulaCtx.save();
    nebulaCtx.globalCompositeOperation = "destination-in";
    nebulaCtx.fillStyle = edgeFade;
    nebulaCtx.fillRect(0, 0, 640, 640);
    nebulaCtx.restore();

    const layer = createCanvasSurface();
    const layerCtx = layer ? layer.getContext("2d") : null;
    if (layerCtx) {
      layer.width = layer.height = 640;
      layerCtx.drawImage(nebula, 0, 0);
      nebulaCtx.save();
      nebulaCtx.globalCompositeOperation = "lighter";
      nebulaCtx.globalAlpha = 0.35;
      nebulaCtx.translate(320, 320);
      nebulaCtx.rotate(1.2);
      nebulaCtx.drawImage(layer, -256, -256, 512, 512);
      nebulaCtx.restore();
    }

    const noise = Float32Array.from({ length: 4096 }, () => Math.random());
    function sampleNoise(x, y) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const a = noise[(iy & 63) * 64 + (ix & 63)];
      const b = noise[(iy & 63) * 64 + ((ix + 1) & 63)];
      const c = noise[((iy + 1) & 63) * 64 + (ix & 63)];
      const d = noise[((iy + 1) & 63) * 64 + ((ix + 1) & 63)];
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }

    const texture = nebulaCtx.getImageData(0, 0, 640, 640);
    for (let y = 0; y < 640; y++) {
      for (let x = 0; x < 640; x++) {
        const index = (y * 640 + x) * 4;
        const broad = sampleNoise(x / 80, y / 80);
        const detail = sampleNoise(x / 22 + broad * 3, y / 22 - broad * 3);
        const fine = sampleNoise(x / 7, y / 7);
        const density = clamp01((broad * 0.5 + detail * 0.35 + fine * 0.15 - 0.25) * 2);
        const warmth = clamp01(0.5 + (320 - x) / 600 + (320 - y) / 1200);
        const mix = warmth * warmth * (3 - 2 * warmth);
        texture.data[index] = Math.round(72 + 138 * mix);
        texture.data[index + 1] = Math.round(136 + 7 * mix);
        texture.data[index + 2] = Math.round(196 - 120 * mix);
        texture.data[index + 3] *= 0.7 + density * 0.6;
      }
    }
    nebulaCtx.putImageData(texture, 0, 0);

    // Soften fine cloud edges once, keeping blur work out of the animation loop.
    if (layerCtx) {
      layerCtx.clearRect(0, 0, 640, 640);
      layerCtx.drawImage(nebula, 0, 0);
      nebulaCtx.clearRect(0, 0, 640, 640);
      nebulaCtx.filter = "blur(2.5px)";
      nebulaCtx.drawImage(layer, 0, 0);
      nebulaCtx.filter = "none";
    }
    return nebula;
  }

  function renderCenterMask() {
    if (!maskCanvas) {
      maskCanvas = createCanvasSurface();
      maskCtx = maskCanvas ? maskCanvas.getContext("2d") : null;
    }
    if (!maskCanvas || !maskCtx) {
      return;
    }

    // A circular falloff keeps the tunnel's center dark and the content readable.
    const inner = Math.min(Math.max(config.maskInnerRadius, 0), Math.min(cx, cy) * 0.3);
    const outer = Math.max(config.maskOuterRadius, inner + 1);
    maskX = config.maskOuterAlpha === 0 ? Math.max(0, Math.floor(cx - outer)) : 0;
    maskY = config.maskOuterAlpha === 0 ? Math.max(0, Math.floor(cy - outer)) : 0;
    maskCanvas.width = Math.ceil(width - maskX * 2);
    maskCanvas.height = Math.ceil(height - maskY * 2);
    const gradient = maskCtx.createRadialGradient(cx - maskX, cy - maskY, inner, cx - maskX, cy - maskY, outer);
    gradient.addColorStop(0, `rgba(0,0,0,${clamp01(config.maskInnerAlpha)})`);
    gradient.addColorStop(1, `rgba(0,0,0,${clamp01(config.maskOuterAlpha)})`);
    maskCtx.fillStyle = gradient;
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  }

  function createCanvasSurface() {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(1, 1);
    }
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      return document.createElement("canvas");
    }
    return null;
  }
}
