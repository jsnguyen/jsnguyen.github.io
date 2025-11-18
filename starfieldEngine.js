export const DEFAULT_CONFIG = {
  starCount: 240,
  baseSpeed: 0.03,
  speedSpread: 0.06,
  minTrail: 30,
  trailRange: 80,
  maxLineWidth: 10,
  minLineWidth: 1,
  resetPadding: 80,
  fadeStops: [
    { offset: 0, alpha: 0 },
    { offset: 0.5, alpha: 0.5 },
    { offset: 1, alpha: 1 }
  ],
  maskInnerRadius: 300,
  maskOuterRadius: 800,
  maskOuterAlpha: 0.1
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
    const inner = Math.min(config.maskInnerRadius, maxTravel);
    const outerRaw = Math.max(config.maskOuterRadius, inner + 10);
    const outer = Math.min(outerRaw, maxTravel + config.resetPadding);
    const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, `rgba(0,0,0,${config.maskOuterAlpha})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.fill();
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
    },
    frame(dt) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      for (const star of stars) {
        star.update(dt);
        star.draw();
      }
      drawCenterMask();
    }
  };
}
