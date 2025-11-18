const canvas = document.getElementById("warp-canvas");
const ctx = canvas.getContext("2d");
ctx.lineCap = "round";
ctx.lineJoin = "round";

let width, height, cx, cy;
let stars = [];
const STAR_COUNT = 300;       // density
const BASE_SPEED = 0.05;      // base speed (pixels per ms)
const SPEED_SPREAD = 0.05;    // variation on speed
const TRAIL_DISTANCE = 50;   // px of history to keep per star (adjust for trail length)
const MAX_TRAIL_POINTS = 100; // safety cap on stored samples
const TRAIL_SEED_STEPS = 100;  // samples generated for warm start
const TRAIL_OPACITY = 1.0;   // max opacity for streak head
const TRAIL_FADE_EXP = 3.35;  // controls falloff curve (higher = tighter head)

function drawCenterMask() {
  const radius = 300;
  const fade = 0.9;

  const grad = ctx.createRadialGradient(
    cx, cy, 0,
    cx, cy, radius
  );

  grad.addColorStop(0, `rgb(0, 0, 0, 1.0)`);
  grad.addColorStop(1, `rgb(0, 0, 0, ${fade})`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  width = canvas.width  = window.innerWidth * dpr;
  height = canvas.height = window.innerHeight * dpr;

  // reset transform & scale for high DPI
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  cx = window.innerWidth / 2;
  cy = window.innerHeight / 2;
}

window.addEventListener("resize", resize);
resize();

class Star {
  constructor() {
    this.reset(true);  // true = warmup on creation
  }

  reset(warmup = false) {
    this.angle = Math.random() * Math.PI * 2;
    this.dist = Math.random() * 10;
    this.speed = BASE_SPEED + Math.random() * SPEED_SPREAD;
    this.size = 1.0;

    // 🔹 give this star its own color
    this.hue = Math.floor(Math.random() * 360);
    this.lightness = Math.min(70 + this.speed * 30, 90); // faster = brighter

    // start at center
    this.x = cx;
    this.y = cy;
    this.prevX = this.x;
    this.prevY = this.y;

    // on initial creation, "fast-forward" each star a random amount
    if (warmup) {
      const fakeTime = Math.random() * canvas.width/2.0/BASE_SPEED;
      this.dist += this.speed * fakeTime;
      this.x = cx + Math.cos(this.angle) * this.dist;
      this.y = cy + Math.sin(this.angle) * this.dist;
      this.prevX = this.x;
      this.prevY = this.y;
    }

    this.history = [];
    this.segmentLengths = [];
    this.historyLength = 0;

    if (warmup) {
      this.seedHistory();
    } else {
      this.addHistoryPoint(this.x, this.y, false);
    }
  }

  update(dt) {
    this.dist += this.speed * dt;

    this.prevX = this.x;
    this.prevY = this.y;

    this.x = cx + Math.cos(this.angle) * this.dist;
    this.y = cy + Math.sin(this.angle) * this.dist;

    this.addHistoryPoint(this.x, this.y);

    if (
      this.x < -50 || this.x > window.innerWidth + 50 ||
      this.y < -50 || this.y > window.innerHeight + 50
    ) {
      this.reset();   // normal reset (no warmup)
      return;
    }
  }

  draw() {
    if (this.history.length < 2) {
      return;
    }

    ctx.lineWidth = this.size;

    for (let i = 1; i < this.history.length; i++) {
      const start = this.history[i - 1];
      const end = this.history[i];
      const progress = i / (this.history.length - 1);
      const alpha = Math.pow(progress, TRAIL_FADE_EXP) * TRAIL_OPACITY;
      ctx.strokeStyle = `hsla(${this.hue}, 100%, ${this.lightness}%, ${Math.min(alpha, 1)})`;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }

  addHistoryPoint(x, y, trim = true) {
    const last = this.history[this.history.length - 1];
    this.history.push({ x, y });

    if (last) {
      const dx = x - last.x;
      const dy = y - last.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      this.segmentLengths.push(len);
      this.historyLength += len;
    }

    if (trim) {
      this.trimHistory();
    }
  }

  trimHistory() {
    while (this.historyLength > TRAIL_DISTANCE && this.history.length > 1) {
      this.history.shift();
      const removed = this.segmentLengths.shift();
      this.historyLength -= removed || 0;
    }

    while (this.history.length > MAX_TRAIL_POINTS) {
      this.history.shift();
      const removed = this.segmentLengths.shift();
      this.historyLength -= removed || 0;
    }

    if (this.historyLength < 0) {
      this.historyLength = 0;
    }
  }

  seedHistory() {
    const steps = TRAIL_SEED_STEPS;
    const dirX = Math.cos(this.angle);
    const dirY = Math.sin(this.angle);
    const maxTrail = Math.min(TRAIL_DISTANCE, this.dist);

    for (let i = steps; i >= 0; i--) {
      const ratio = i / steps;
      const d = Math.max(this.dist - ratio * maxTrail, 0);
      const px = cx + dirX * d;
      const py = cy + dirY * d;
      this.addHistoryPoint(px, py, false);
    }

    this.trimHistory();
  }
}

function initStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push(new Star());
  }
}

initStars();

let lastTime = performance.now();

function animate(now) {
  const dt = now - lastTime;
  lastTime = now;

  // clear the frame before rebuilding trails
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // update stars
  for (const s of stars) {
    s.update(dt);
    s.draw();
  }

  drawCenterMask();

  requestAnimationFrame(animate);
}

// start with a fully black frame
ctx.fillStyle = "#000";
ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

requestAnimationFrame(animate);
