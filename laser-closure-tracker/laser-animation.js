(function () {
  "use strict";

  const STAR_COUNT = 90;
  const KECK_II = { x: 0.21, y: 0.66, r: 0.135 };
  const KECK_I = { x: 0.255, y: 0.69, r: 0.116 };
  const GUIDE_STAR = { x: 0.72, y: 0.11 };

  class LaserAnimation extends HTMLElement {
    static get observedAttributes() {
      return ["laser-state"];
    }

    connectedCallback() {
      this.attachShadow({ mode: "open" });
      this.canvas = document.createElement("canvas");
      this.shadowRoot.append(this.canvas, style());
      this.ctx = this.canvas.getContext("2d");
      this.stars = makeStars(STAR_COUNT);
      this.laserOn = this.getAttribute("laser-state") !== "off";
      this.motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.resize = new ResizeObserver(() => this.fit());
      this.resize.observe(this);
      this.fit();
      this.draw(0);
      this.updateLoop();
    }

    attributeChangedCallback(_name, oldValue, newValue) {
      if (oldValue === newValue || !this.ctx) return;
      this.laserOn = this.getAttribute("laser-state") !== "off";
      this.draw(0);
      this.updateLoop();
    }

    disconnectedCallback() {
      this.resize?.disconnect();
      this.stop();
    }

    fit() {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const rect = this.getBoundingClientRect();
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.canvas.width = Math.round(this.width * ratio);
      this.canvas.height = Math.round(this.height * ratio);
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.draw(0);
    }

    redraw() {
      this.draw(0);
    }

    updateLoop() {
      if (this.motion && this.laserOn && !this.frame) this.frame = requestAnimationFrame((time) => this.loop(time));
      if ((!this.motion || !this.laserOn) && this.frame) this.stop();
    }

    stop() {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }

    loop(time) {
      this.draw(time / 1000);
      this.frame = this.laserOn ? requestAnimationFrame((next) => this.loop(next)) : null;
    }

    draw(time) {
      const { ctx, width: w, height: h } = this;
      const dark = getComputedStyle(document.documentElement).colorScheme !== "light";
      const domeR = Math.min(w, h) * KECK_II.r;
      const beam = {
        x1: w * KECK_II.x + domeR * 0.06,
        y1: h * KECK_II.y - domeR * 0.82,
        x2: w * GUIDE_STAR.x,
        y2: h * GUIDE_STAR.y,
      };

      ctx.clearRect(0, 0, w, h);
      drawSky(ctx, w, h, dark);
      drawOcean(ctx, w, h, dark);
      drawStars(ctx, this.stars, w, h, time, dark);
      if (this.laserOn) {
        drawGuideStar(ctx, beam.x2, beam.y2, time);
        drawLaser(ctx, beam, time);
        drawBackscatter(ctx, beam, time);
      }
      drawMaunaKea(ctx, w, h, dark);
      drawDome(ctx, w, h, KECK_I, dark, false);
      drawDome(ctx, w, h, KECK_II, dark, true, this.laserOn);
    }
  }

  function style() {
    const node = document.createElement("style");
    node.textContent = "canvas{display:block;width:100%;height:100%}";
    return node;
  }

  function makeStars(count) {
    return Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random() * 0.55,
      r: 0.35 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function drawSky(ctx, w, h, dark) {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    if (dark) {
      gradient.addColorStop(0, "#061017");
      gradient.addColorStop(0.58, "#102231");
      gradient.addColorStop(1, "#1b1a16");
    } else {
      gradient.addColorStop(0, "#daeef4");
      gradient.addColorStop(0.6, "#eef6f0");
      gradient.addColorStop(1, "#ddd5c2");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  function drawStars(ctx, stars, w, h, time, dark) {
    if (!dark) return;
    stars.forEach((star) => {
      const alpha = 0.35 + Math.sin(time * 0.8 + star.phase) * 0.14;
      ctx.fillStyle = `rgba(235, 248, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawOcean(ctx, w, h, dark) {
    const y = h * 0.79;
    const gradient = ctx.createLinearGradient(0, y, 0, h);
    gradient.addColorStop(0, dark ? "rgba(20, 54, 69, .7)" : "rgba(79, 142, 162, .55)");
    gradient.addColorStop(1, dark ? "rgba(9, 25, 35, .2)" : "rgba(178, 210, 214, .2)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, w, h - y);
    ctx.strokeStyle = dark ? "rgba(148, 206, 220, .2)" : "rgba(255,255,255,.65)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      const yy = y + h * (0.025 + i * 0.032);
      ctx.beginPath();
      ctx.moveTo(w * 0.04, yy);
      ctx.bezierCurveTo(w * 0.28, yy - 2, w * 0.48, yy + 2, w * 0.72, yy);
      ctx.bezierCurveTo(w * 0.84, yy - 1, w * 0.94, yy + 1, w, yy);
      ctx.stroke();
    }
  }

  function drawGuideStar(ctx, x, y, time) {
    const glow = 0.52 + Math.sin(time * 1.8) * 0.04;
    const halo = ctx.createRadialGradient(x, y, 3, x, y, 58);
    halo.addColorStop(0, `rgba(255, 231, 85, ${glow})`);
    halo.addColorStop(0.26, "rgba(255, 208, 32, .22)");
    halo.addColorStop(1, "rgba(255, 208, 32, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 239, 122, .96)";
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLaser(ctx, beam, time) {
    const pulse = 0.82 + Math.sin(time * 3.5) * 0.08;
    ctx.save();
    ctx.lineCap = "round";
    [[18, 0.06], [9, 0.18], [4, 0.78], [1.35, 1]].forEach(([width, alpha]) => {
      ctx.strokeStyle = `rgba(255, 211, 35, ${alpha * pulse})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawBackscatter(ctx, beam, time) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    [-1, 1].forEach((direction) => {
      for (let i = 0; i < 24; i += 1) {
        const raw = ((i / 24) + direction * time * 0.06 + 1) % 1;
        const t = 0.035 + raw * 0.93;
        const edgeFade = Math.min(1, raw / 0.16, (1 - raw) / 0.16);
        const centerFade = 1 - Math.abs(t - 0.52) * 1.15;
        const wobble = edgeFade * 1.25;
        const x = beam.x1 + (beam.x2 - beam.x1) * t + Math.sin(time * 2.1 + i) * wobble;
        const y = beam.y1 + (beam.y2 - beam.y1) * t + Math.cos(time * 1.7 + i) * wobble;
        const alpha = Math.max(0.08, centerFade) * edgeFade * (direction > 0 ? 0.38 : 0.24);
        ctx.fillStyle = `rgba(255, 229, 88, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.62 + (i % 4) * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  function drawMaunaKea(ctx, w, h, dark) {
    const ridge = [
      [0, 0.86],
      [0.08, 0.78],
      [0.18, 0.68],
      [0.24, 0.65],
      [0.33, 0.74],
      [0.46, 0.71],
      [0.62, 0.8],
      [0.78, 0.73],
      [1, 0.82],
    ];
    ctx.fillStyle = dark ? "#20221d" : "#b5b29b";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ridge.forEach(([x, y]) => ctx.lineTo(x * w, y * h));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = dark ? "#141816" : "#879486";
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
  }

  function drawDome(ctx, w, h, dome, dark, active, laserOn = false) {
    const cx = w * dome.x;
    const wallTop = h * dome.y;
    const r = Math.min(w, h) * dome.r;
    const wallH = r * 0.58;
    const slitX = cx + r * 0.06;
    const capCenterY = wallTop + r * 0.12;
    const capHalfWidth = Math.sqrt(Math.max(0, r * r - (wallTop - capCenterY) ** 2));

    ctx.save();
    ctx.strokeStyle = dark ? "#71828a" : "#9aa7aa";
    ctx.lineWidth = 2;

    ctx.fillStyle = dark ? "#9fadb2" : "#d7dfdf";
    ctx.fillRect(cx - capHalfWidth, wallTop, capHalfWidth * 2, wallH);
    ctx.strokeRect(cx - capHalfWidth, wallTop, capHalfWidth * 2, wallH);

    ctx.fillStyle = dark ? "#cfd8db" : "#eef2f1";
    ctx.beginPath();
    ctx.arc(cx, capCenterY, r, Math.PI + Math.asin((capCenterY - wallTop) / r), Math.PI * 2 - Math.asin((capCenterY - wallTop) / r));
    ctx.lineTo(cx + capHalfWidth, wallTop);
    ctx.lineTo(cx - capHalfWidth, wallTop);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = dark ? "rgba(255,255,255,.22)" : "rgba(30,40,45,.18)";
    for (let i = -3; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(cx + i * capHalfWidth * 0.22, wallTop);
      ctx.lineTo(cx + i * r * 0.1, capCenterY - r * 0.94);
      ctx.stroke();
    }

    if (active) {
      ctx.fillStyle = dark ? "#0f1518" : "#c5d0d1";
      ctx.strokeStyle = dark ? "#657981" : "#9aa8ad";
      ctx.lineWidth = 1.5;
      roundRect(ctx, slitX - r * 0.12, capCenterY - r * 0.95, r * 0.24, r * 0.78, r * 0.045);
      ctx.fill();
      ctx.stroke();

      if (laserOn) {
        ctx.fillStyle = "rgba(255, 214, 42, .55)";
        ctx.beginPath();
        ctx.arc(slitX, capCenterY - r * 0.78, r * 0.075, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = dark ? "#839198" : "#cdd7d8";
      ctx.fillRect(slitX - r * 0.09, capCenterY - r * 0.72, r * 0.18, r * 0.5);
    }

    ctx.fillStyle = dark ? "#0e1214" : "#8e989a";
    ctx.fillRect(cx - capHalfWidth * 1.04, wallTop + wallH, capHalfWidth * 2.08, r * 0.15);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  customElements.define("laser-animation", LaserAnimation);
})();
