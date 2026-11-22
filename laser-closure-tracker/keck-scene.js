import * as THREE from "./vendor/three.module.js";

const DEG = Math.PI / 180;
const DOME = { radius: 18.5, wall: 11, slit: 5.2 };
const KECK_I = { x: -26, z: 33.5, alt: 58, az: 145 };
const KECK_II = { x: 26, z: -33.5 };
const PARK = { alt: 62, az: 205 };
const LAUNCH_Y = 12.4;
const BEAM_LENGTH = 5200;
const SLEW_RATE = 6;
const BEAM_TIME = 1.3;
const CAMERA = { radius: 235, yaw: 202, pitch: 9, aim: [0, 40, 0], hfov: 64 };
const SODIUM = new THREE.Color("#ffc23d");

class KeckScene extends HTMLElement {
  static get observedAttributes() {
    return ["laser", "alt", "az"];
  }

  connectedCallback() {
    if (this.renderer !== undefined) return;
    this.attachShadow({ mode: "open" }).innerHTML =
      "<style>:host{display:block;position:relative}canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:pan-y}canvas:active{cursor:grabbing}p{margin:0;padding:24px;color:#9a98b0}</style>";
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      this.renderer = null;
      this.shadowRoot.append(Object.assign(document.createElement("p"), { textContent: "3D view needs WebGL." }));
      return;
    }
    this.motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.elapsed = 0;
    this.yaw = 0;
    this.beam = { head: 0, tail: 0, on: false };
    this.pointing = { ...PARK, target: { ...PARK }, ready: false };
    this.build();
    this.readAttributes(true);
    this.bindPointer();
    this.shadowRoot.append(this.renderer.domElement);
    this.resizer = new ResizeObserver(() => this.fit());
    this.resizer.observe(this);
    this.watcher = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.loop();
    });
    this.watcher.observe(this);
    document.addEventListener("visibilitychange", () => this.loop());
    this.fit();
  }

  disconnectedCallback() {
    this.resizer?.disconnect();
    this.watcher?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  attributeChangedCallback() {
    if (this.renderer) this.readAttributes(false);
  }

  readAttributes(initial) {
    const alt = parseFloat(this.getAttribute("alt"));
    const az = parseFloat(this.getAttribute("az"));
    const target = Number.isFinite(alt) && Number.isFinite(az) ? { alt: Math.max(16, Math.min(89.5, alt)), az } : PARK;
    this.pointing.target = target;
    if (initial || !this.motion) Object.assign(this.pointing, target);

    const on = this.getAttribute("laser") === "on";
    if (on !== this.beam.on) {
      this.beam.on = on;
      if (on) Object.assign(this.beam, { head: initial || !this.motion ? 1 : 0, tail: 0 });
      else if (initial || !this.motion) Object.assign(this.beam, { head: 0, tail: 0 });
    }
    this.render();
  }

  build() {
    const renderer = this.renderer;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.FogExp2("#141a2c", 0.00026);
    this.camera = new THREE.PerspectiveCamera(30, 2, 1, 40000);

    scene.add(new THREE.HemisphereLight("#3b4a72", "#1a120e", 0.7));
    const moon = new THREE.DirectionalLight("#c4d0ff", 0.9);
    moon.position.copy(direction(34, 238)).multiplyScalar(500);
    scene.add(moon);

    scene.add(makeSky(), (this.stars = makeStars()), makeTerrain(), makeClouds(), makeBuilding());

    this.keck1 = makeTelescope();
    this.keck1.group.position.set(KECK_I.x, 0, KECK_I.z);
    aim(this.keck1, KECK_I.alt, KECK_I.az);

    this.keck2 = makeTelescope();
    this.keck2.group.position.set(KECK_II.x, 0, KECK_II.z);
    this.laser = makeLaser();
    this.keck2.tube.add(this.laser.group);
    scene.add(this.keck1.group, this.keck2.group);
  }

  bindPointer() {
    const canvas = this.renderer.domElement;
    let last = null;
    canvas.addEventListener("pointerdown", (event) => {
      last = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (last === null) return;
      this.yaw += (event.clientX - last) * 0.3;
      last = event.clientX;
      this.render();
    });
    const release = () => (last = null);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }

  fit() {
    const { width, height } = this.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    const vfov = 2 * Math.atan(Math.tan((CAMERA.hfov / 2) * DEG) / aspect) / DEG;
    this.camera.aspect = aspect;
    this.camera.fov = Math.max(22, Math.min(58, vfov));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.stars.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    this.render();
  }

  loop() {
    const running = this.visible && this.motion && !document.hidden;
    if (running && !this.frame) {
      let last = performance.now();
      const tick = (now) => {
        this.step(Math.max(0, Math.min(0.5, (now - last) / 1000)));
        last = now;
        this.render();
        this.frame = this.visible && !document.hidden ? requestAnimationFrame(tick) : null;
      };
      this.frame = requestAnimationFrame(tick);
    }
  }

  step(dt) {
    this.elapsed += dt;
    const p = this.pointing;
    const maxStep = SLEW_RATE * dt;
    const daz = ((p.target.az - p.az + 540) % 360) - 180;
    p.az = (p.az + Math.sign(daz) * Math.min(Math.abs(daz), maxStep) + 360) % 360;
    p.alt += Math.sign(p.target.alt - p.alt) * Math.min(Math.abs(p.target.alt - p.alt), maxStep);

    const b = this.beam;
    const rate = dt / BEAM_TIME;
    if (b.on) b.head = Math.min(1, b.head + rate);
    else if (b.head > 0) {
      b.tail = Math.min(1, b.tail + rate);
      if (b.tail >= 1) Object.assign(b, { head: 0, tail: 0 });
    }
  }

  render() {
    if (!this.renderer || !this.camera) return;
    const time = this.elapsed;
    const drift = this.motion ? Math.sin(time * 0.04) * 7 : 0;
    const yaw = (CAMERA.yaw + this.yaw + drift) * DEG;
    const pitch = CAMERA.pitch * DEG;
    const [ax, ay, az] = CAMERA.aim;
    this.camera.position.set(
      ax + CAMERA.radius * Math.cos(pitch) * Math.sin(yaw),
      14 + CAMERA.radius * Math.sin(pitch),
      az - CAMERA.radius * Math.cos(pitch) * Math.cos(yaw)
    );
    this.camera.lookAt(ax, ay, az);

    aim(this.keck2, this.pointing.alt, this.pointing.az);
    this.laser.update(this.beam.head ** 2.5, this.beam.tail ** 2.5);
    this.stars.material.uniforms.uTime.value = time;
    this.renderer.render(this.scene, this.camera);
  }
}

function direction(alt, az) {
  return new THREE.Vector3(Math.cos(alt * DEG) * Math.sin(az * DEG), Math.sin(alt * DEG), -Math.cos(alt * DEG) * Math.cos(az * DEG));
}

function aim(telescope, alt, az) {
  telescope.dome.rotation.y = Math.PI - az * DEG;
  telescope.tube.rotation.x = Math.PI / 2 - alt * DEG;
}

function makeSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        float h = max(vDir.y, 0.0);
        vec3 zenith = vec3(0.012, 0.018, 0.045);
        vec3 horizon = vec3(0.08, 0.10, 0.17);
        vec3 color = mix(horizon, zenith, pow(h, 0.45));
        color += vec3(0.025, 0.05, 0.03) * smoothstep(0.0, 0.05, h) * exp(-h * 12.0);
        color += vec3(0.10, 0.05, 0.02) * exp(-h * 9.0) * max(0.0, -vDir.z * 0.6 + vDir.x * 0.4);
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), material);
  sky.renderOrder = -2;
  return sky;
}

function makeStars() {
  const radius = 20000;
  const positions = [];
  const sizes = [];
  const phases = [];
  const add = (v, size) => {
    if (v.y < -0.02) return;
    positions.push(v.x * radius, v.y * radius, v.z * radius);
    sizes.push(size);
    phases.push(Math.random() * Math.PI * 2);
  };
  for (let i = 0; i < 4200; i += 1) {
    add(new THREE.Vector3().randomDirection(), Math.random() < 0.04 ? 2.6 + Math.random() * 1.4 : 0.9 + Math.random() * 1.2);
  }
  const band = new THREE.Vector3(0.35, 0.55, 0.76).normalize();
  for (let i = 0; i < 5000; i += 1) {
    const v = new THREE.Vector3().randomDirection();
    v.addScaledVector(band, -v.dot(band) * (1 - Math.abs(gaussian()) * 0.18)).normalize();
    add(v, 0.6 + Math.random() * 0.7);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: `
      attribute float aSize; attribute float aPhase;
      uniform float uTime; uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * 1.6;
        float h = normalize(position).y;
        vAlpha = (0.7 + 0.3 * sin(uTime * 1.7 + aPhase)) * smoothstep(0.0, 0.2, h) * min(1.0, aSize * 0.75);
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)) * vAlpha;
        gl_FragColor = vec4(vec3(0.92, 0.94, 1.0) * a, a);
      }`,
  });
  const stars = new THREE.Points(geometry, material);
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  return stars;
}

function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

const CONES = [
  [-250, -300, 120, 64],
  [330, 140, 100, 38],
  [-80, 360, 90, 30],
  [180, -420, 140, 46],
];

function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  const slope = -(Math.max(0, d - 150) ** 1.22) * 0.1;
  const flatten = THREE.MathUtils.smoothstep(d, 95, 170);
  const cones = CONES.reduce((sum, [cx, cz, r, h]) => sum + h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r)), 0);
  const noise = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) * 4 + Math.sin(x * 0.063 + z * 0.051) * 1.6 + Math.cos(z * 0.11 - x * 0.04) * 0.7;
  return slope + (cones + noise) * flatten + noise * 0.04;
}

function makeTerrain() {
  const geometry = new THREE.PlaneGeometry(5000, 5000, 180, 180).rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = [];
  const base = new THREE.Color("#4a2f25");
  const ash = new THREE.Color("#6b5246");
  const tint = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, terrainHeight(x, z));
    tint.copy(base).lerp(ash, 0.5 + 0.5 * Math.sin(x * 0.05) * Math.cos(z * 0.043));
    colors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
}

function makeClouds() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#2e364c";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 10 + Math.random() * 38;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, `rgba(170, 182, 214, ${0.06 + Math.random() * 0.1})`);
    glow.addColorStop(1, "rgba(150, 165, 200, 0)");
    for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      ctx.fillStyle = glow;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(36, 36);
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texture }));
  clouds.position.y = -300;
  return clouds;
}

function makeBuilding() {
  const dx = KECK_II.x - KECK_I.x;
  const dz = KECK_II.z - KECK_I.z;
  const length = Math.hypot(dx, dz) - DOME.radius * 1.6;
  const building = new THREE.Mesh(new THREE.BoxGeometry(length, 9, 17), new THREE.MeshStandardMaterial({ color: "#b9bfc4", roughness: 0.7 }));
  building.position.set((KECK_I.x + KECK_II.x) / 2, 4.5, (KECK_I.z + KECK_II.z) / 2);
  building.rotation.y = Math.atan2(-dz, dx);
  return building;
}

function slitMaterial(color) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.25, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSlit = { value: DOME.slit };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;\nuniform float uSlit;")
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (abs(vLocal.x) < uSlit && vLocal.z > -4.5) discard;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb *= 0.12;");
  };
  return material;
}

function strut(a, b, radius, material) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 6), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  return mesh;
}

function makeTelescope() {
  const { radius, wall, slit } = DOME;
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: "#d9dee2", roughness: 0.5, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: "#4f5966", roughness: 0.55, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: "#1d2127", roughness: 0.8 });

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius + 3, radius + 4, 1.2, 64), new THREE.MeshStandardMaterial({ color: "#6e6862", roughness: 1 }));
  pad.position.y = 0.2;
  const walls = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, wall, 64, 1, true), new THREE.MeshStandardMaterial({ color: "#c5cbd0", roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }));
  walls.position.y = wall / 2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), dark);
  floor.position.y = 3;
  group.add(pad, walls, floor);

  const dome = new THREE.Group();
  dome.position.y = wall;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 72, 28, 0, Math.PI * 2, 0, Math.PI / 2), slitMaterial("#e4e8eb"));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.05, 0.45, 8, 72).rotateX(Math.PI / 2), steel);
  dome.add(cap, ring);
  const rim = Math.sqrt(radius * radius - slit * slit);
  const start = Math.acos(4.5 / rim);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(rim, 0.4, 6, 48, Math.PI - start).rotateZ(start).rotateY(Math.PI / 2), shell);
    edge.position.x = side * slit;
    dome.add(edge);
  }
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 4), steel);
    arm.position.set(side * 7.2, -3.5, 0);
    dome.add(arm);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 6), steel);
  base.position.y = -8.4;
  dome.add(base);

  const tube = new THREE.Group();
  const mirror = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.5, 6), new THREE.MeshStandardMaterial({ color: "#7d8b9e", roughness: 0.12, metalness: 1 }));
  mirror.position.y = -3.6;
  const cell = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 2, 6), steel);
  cell.position.y = -5;
  const top = new THREE.Mesh(new THREE.TorusGeometry(3, 0.3, 6, 24).rotateX(Math.PI / 2), steel);
  top.position.y = 11;
  const secondary = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 6), steel);
  secondary.position.y = 11.4;
  const launcher = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.2, 12), dark);
  launcher.position.y = 12.2;
  tube.add(mirror, cell, top, secondary, launcher);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const b = a + Math.PI / 6;
    tube.add(strut([5 * Math.cos(a), -3.4, 5 * Math.sin(a)], [3 * Math.cos(b), 11, 3 * Math.sin(b)], 0.18, steel));
  }
  for (const side of [-1, 1]) {
    tube.add(strut([side * 6.4, 0, 0], [side * 4.8, 0, 0], 0.7, steel));
  }
  dome.add(tube);
  group.add(dome);
  return { group, dome, tube };
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, "rgba(255, 244, 200, 1)");
  glow.addColorStop(0.18, "rgba(255, 200, 80, .55)");
  glow.addColorStop(1, "rgba(255, 170, 40, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makeLaser() {
  const group = new THREE.Group();
  group.position.y = LAUNCH_Y;
  const layers = [
    [0.35, 6, 1.0],
    [1.6, 34, 0.22],
  ].map(([bottom, topRadius, strength]) => {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uHead: { value: 0 }, uTail: { value: 0 }, uStrength: { value: strength }, uColor: { value: SODIUM } },
      vertexShader: `
        varying float vT; varying float vEdge;
        void main() {
          vT = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vEdge = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uHead; uniform float uTail; uniform float uStrength; uniform vec3 uColor;
        varying float vT; varying float vEdge;
        void main() {
          float lit = smoothstep(uTail, uTail + 0.004, vT) * (1.0 - smoothstep(uHead - 0.006, uHead, vT));
          float scatter = exp(-vT * 9.0) * 0.85 + 0.15 * (1.0 - vT);
          float a = uStrength * lit * scatter * pow(vEdge, 1.6);
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    const geometry = new THREE.CylinderGeometry(topRadius, bottom, BEAM_LENGTH, 16, 1, true).translate(0, BEAM_LENGTH / 2, 0);
    return new THREE.Mesh(geometry, material);
  });
  layers.forEach((layer) => (layer.frustumCulled = false));

  const texture = glowTexture();
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: SODIUM, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flare.scale.setScalar(7);
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: SODIUM, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  star.position.y = BEAM_LENGTH;
  star.scale.setScalar(260);
  const light = new THREE.PointLight(SODIUM, 0, 24, 1.6);
  light.position.y = 1;
  group.add(...layers, flare, star, light);

  return {
    group,
    update(head, tail) {
      layers.forEach(({ material }) => {
        material.uniforms.uHead.value = head;
        material.uniforms.uTail.value = tail;
      });
      const source = head > 0 && tail === 0 ? 1 : Math.max(0, 1 - tail * 8);
      flare.material.opacity = head > 0 ? source : 0;
      light.intensity = head > 0 ? source * 900 : 0;
      star.material.opacity = head >= 0.995 && tail < 0.995 ? 1 - tail : 0;
      group.visible = head > 0;
    },
  };
}

customElements.define("keck-scene", KeckScene);
