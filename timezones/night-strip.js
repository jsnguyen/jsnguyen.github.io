import * as THREE from '../laser-closure-tracker/vendor/three.module.js';

const deg = Math.PI / 180;
const keck = {latitude: 19.8286, longitude: -155.4742};
const dome = {radius: 18.5, wall: 11, slit: 5.2, spacing: 42};
const view = {distance: 125, height: 16, pitch: 7.5, vfov: 30, hfov: 80};
const distances = {clouds: 2800, moon: 4000, sun: 4400, stars: 4600, sky: 5000};
// Altitudes above the horizon are squeezed below this so the moon and sun stay inside the strip.
const skyTop = 23;
const slewRate = 5;
const colors = {
    daySky: new THREE.Color('#cfe6ff'), nightSky: new THREE.Color('#4c5aa0'),
    dayGround: new THREE.Color('#9a6a52'), nightGround: new THREE.Color('#231a2e'),
    dayKey: new THREE.Color('#fff3df'), nightKey: new THREE.Color('#a9b8ff')
};
const cones = [[-190, -260, 75, 38], [250, -210, 65, 30], [-380, 60, 90, 26], [90, -450, 100, 46], [420, 120, 70, 22]];

class NightStrip extends HTMLElement {
    static observedAttributes = ['site'];

    connectedCallback() {
        if (this.renderer !== undefined) return;
        try {
            this.renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'low-power'});
        } catch {
            this.renderer = null;
            this.hidden = true;
            return;
        }
        this.motion = false;
        this.elapsed = 0;
        this.halfWidth = view.hfov / 2;
        this.build();
        this.append(this.renderer.domElement);
        this.fit();
        this.update();
        new ResizeObserver(() => this.fit()).observe(this);
        new IntersectionObserver(([entry]) => {
            this.visible = entry.isIntersecting;
            this.loop();
        }).observe(this);
        document.addEventListener('visibilitychange', () => this.loop());
        setInterval(() => this.update(), 60000);
    }

    attributeChangedCallback() {
        if (this.renderer) this.update();
    }

    build() {
        this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(view.vfov, 4, 1, 8000);
        this.camera.position.set(0, view.height, view.distance);
        this.camera.rotation.x = view.pitch * deg;

        const tones = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
        tones.minFilter = tones.magFilter = THREE.NearestFilter;
        tones.needsUpdate = true;
        const toon = (color, options = {}) => new THREE.MeshToonMaterial({color, gradientMap: tones, ...options});
        this.shutter = {value: 0};
        const materials = {
            shell: darkInside(toon('#f4f6fa', {side: THREE.DoubleSide}), this.shutter),
            wall: darkInside(toon('#dfe4ea', {side: THREE.DoubleSide})),
            steel: toon('#a9bdd6', {emissive: '#1c2640'}),
            mirror: toon('#e3eeff', {emissive: '#2c3d63'}),
            dark: toon('#262b38')
        };

        // The site turns with the camera so both domes always face the viewer.
        this.site = new THREE.Group();
        this.scopes = [-1, 1].map(side => {
            const scope = makeDome(materials);
            scope.side = side;
            scope.group.position.x = side * dome.spacing;
            this.site.add(scope.group);
            return scope;
        });
        this.hemisphere = new THREE.HemisphereLight();
        this.key = new THREE.DirectionalLight();
        this.key.position.set(-250, 400, 500);
        this.site.add(this.camera, makeTerrain(), makeBuilding(toon('#cfd6de')), this.hemisphere, this.key);

        this.sky = makeSky();
        this.stars = makeStars();
        this.moon = makeMoon();
        this.sun = makeSun();
        this.scene.add(this.sky, this.stars, this.moon, this.sun, makeClouds(), this.site);
    }

    fit() {
        const {width, height} = this.getBoundingClientRect();
        if (!width || !height) return;
        const aspect = width / height;
        this.camera.aspect = aspect;
        this.camera.fov = Math.max(view.vfov, 2 * Math.atan(Math.tan(view.hfov / 2 * deg) / aspect) / deg);
        this.camera.updateProjectionMatrix();
        this.halfWidth = Math.atan(Math.tan(this.camera.fov / 2 * deg) * aspect) / deg;
        this.renderer.setSize(width, height, false);
        this.stars.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
        this.render();
    }

    update() {
        const [latitude, longitude] = (this.getAttribute('site') ?? '').split(',').map(Number);
        const site = Number.isFinite(latitude) && Number.isFinite(longitude) ? {latitude, longitude} : keck;
        const now = new Date();
        const observer = new Astronomy.Observer(site.latitude, site.longitude, 0);
        const sun = horizon('Sun', now, observer);
        const moon = horizon('Moon', now, observer);

        // Stars sit at fixed equatorial positions and turn with local sidereal time.
        const lst = (Astronomy.SiderealTime(now) * 15 + site.longitude) * deg;
        const [cl, sl, cp, sp] = [Math.cos(lst), Math.sin(lst), Math.cos(site.latitude * deg), Math.sin(site.latitude * deg)];
        this.stars.matrix.set(-sl, cl, 0, 0, cp * cl, cp * sl, sp, 0, sp * cl, sp * sl, -cp, 0, 0, 0, 0, 1);
        this.stars.matrixWorldNeedsUpdate = true;

        const sunDirection = direction(sun.alt, sun.az);
        const moonDirection = direction(moon.alt, moon.az);
        const moonSpot = direction(squeeze(moon.alt), moon.az);
        this.moon.position.copy(moonSpot).multiplyScalar(distances.moon);
        this.moon.lookAt(0, 0, 0);
        this.moon.visible = moon.alt > -1;
        // Turn the sunlight with the squeezed moon so the phase and its tilt stay true.
        const squeezeTurn = new THREE.Quaternion().setFromUnitVectors(moonDirection, moonSpot);
        this.moon.material.uniforms.uLight.value.copy(sunDirection).applyQuaternion(squeezeTurn);
        this.sun.position.copy(direction(squeeze(sun.alt), sun.az)).multiplyScalar(distances.sun);
        this.sun.visible = sun.alt > -1;
        this.sky.material.uniforms.uSun.value.copy(sunDirection);

        const day = THREE.MathUtils.smoothstep(sun.alt, -6, 4);
        const night = 1 - THREE.MathUtils.smoothstep(sun.alt, -14, -3);
        this.stars.material.uniforms.uNight.value = night;
        this.moon.material.uniforms.uDay.value = day;
        this.moon.children[0].material.opacity = 0.5 * night * Astronomy.Illumination('Moon', now).phase_fraction;
        this.hemisphere.color.lerpColors(colors.nightSky, colors.daySky, day);
        this.hemisphere.groundColor.lerpColors(colors.nightGround, colors.dayGround, day);
        this.hemisphere.intensity = 1.2 + day;
        this.key.color.lerpColors(colors.nightKey, colors.dayKey, day);
        this.key.intensity = 1.3 + 1.4 * day;

        this.open = sun.alt < -1;
        this.face = moon.alt > 0 ? moon.az : sun.alt > 0 ? sun.az : 180;
        if (!this.ready || !this.motion) this.settle();
        this.ready = true;
        this.render();
    }

    goalYaw() {
        // Look left of the moon so it sits clear of the right dome.
        return this.face - Math.min(33, this.halfWidth - 6) + (this.motion ? 3 * Math.sin(this.elapsed * 0.05) : 0);
    }

    retarget(scope) {
        scope.open = this.open;
        scope.goal = this.open ? {alt: 35 + Math.random() * 35, turn: scope.side * 15 + (Math.random() - 0.5) * 70} : {alt: 90, turn: 0};
        scope.next = this.elapsed + 30 + Math.random() * 40;
    }

    settle() {
        this.yaw = this.goalYaw();
        this.shutter.value = this.open ? dome.slit : 0;
        for (const scope of this.scopes) {
            if (!this.ready || scope.open !== this.open) this.retarget(scope);
            Object.assign(scope, scope.goal);
        }
    }

    loop() {
        const running = this.visible && this.motion && !document.hidden;
        if (running && !this.frame) {
            let last = performance.now();
            const tick = now => {
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
        this.yaw = turnToward(this.yaw, this.goalYaw(), 8 * dt);
        this.shutter.value = approach(this.shutter.value, this.open ? dome.slit : 0, dt);
        for (const scope of this.scopes) {
            if (this.elapsed > scope.next || scope.open !== this.open) this.retarget(scope);
            scope.alt = approach(scope.alt, scope.goal.alt, slewRate * dt);
            scope.turn = approach(scope.turn, scope.goal.turn, slewRate * dt);
        }
    }

    render() {
        if (!this.renderer || !this.ready) return;
        this.site.rotation.y = -this.yaw * deg;
        for (const scope of this.scopes) {
            scope.turret.rotation.y = scope.turn * deg;
            scope.tube.rotation.x = (90 - scope.alt) * deg;
        }
        this.stars.material.uniforms.uTime.value = this.elapsed;
        this.renderer.render(this.scene, this.camera);
    }
}

function horizon(body, date, observer) {
    const equator = Astronomy.Equator(body, date, observer, true, true);
    const sky = Astronomy.Horizon(date, observer, equator.ra, equator.dec, 'normal');
    return {alt: sky.altitude, az: sky.azimuth};
}

function direction(alt, az) {
    return new THREE.Vector3(Math.cos(alt * deg) * Math.sin(az * deg), Math.sin(alt * deg), -Math.cos(alt * deg) * Math.cos(az * deg));
}

function squeeze(alt) {
    return alt > 0 ? skyTop * (1 - (1 - alt / 90) ** 2) : alt;
}

function approach(value, goal, step) {
    return value + Math.sign(goal - value) * Math.min(Math.abs(goal - value), step);
}

function turnToward(angle, goal, step) {
    const difference = ((goal - angle) % 360 + 540) % 360 - 180;
    return angle + Math.sign(difference) * Math.min(Math.abs(difference), step);
}

function darkInside(material, slit) {
    material.onBeforeCompile = shader => {
        let fragment = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb *= 0.15;');
        if (slit) {
            shader.uniforms.uSlit = slit;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
            fragment = fragment
                .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nuniform float uSlit;')
                .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (abs(vLocal.x) < uSlit && vLocal.z > -4.5) discard;');
        }
        shader.fragmentShader = fragment;
    };
    material.customProgramCacheKey = () => slit ? 'slit' : 'inside';
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

function makeDome(materials) {
    const {radius, wall} = dome;
    const group = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, wall, 48, 1, true), materials.wall);
    walls.position.y = wall / 2;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 32).rotateX(-Math.PI / 2), materials.dark);
    floor.position.y = 2;

    const turret = new THREE.Group();
    turret.position.y = wall;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), materials.shell);
    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 5), materials.steel);
    base.position.y = -8;
    turret.add(cap, base);
    for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8, 3.5), materials.steel);
        arm.position.set(side * 6.5, -4, 0);
        turret.add(arm);
    }

    // Keck's hexagonal primary mirror inside an open truss.
    const tube = new THREE.Group();
    const mirror = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.8, 6), materials.mirror);
    mirror.position.y = -3.5;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.45, 6, 6).rotateX(Math.PI / 2), materials.steel);
    ring.position.y = 12;
    tube.add(mirror, ring);
    for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const b = a + Math.PI / 6;
        tube.add(strut([5 * Math.cos(a), -3.4, 5 * Math.sin(a)], [3 * Math.cos(b), 12, 3 * Math.sin(b)], 0.35, materials.steel));
    }
    turret.add(tube);
    group.add(walls, floor, turret);
    return {group, turret, tube, alt: 90, turn: 0, goal: {alt: 90, turn: 0}, next: 0};
}

function makeBuilding(material) {
    const building = new THREE.Mesh(new THREE.BoxGeometry(dome.spacing * 2 - dome.radius * 1.6, 9, 16), material);
    building.position.y = 4.5;
    return building;
}

function ground(x, z) {
    const d = Math.hypot(x, z);
    const pad = THREE.MathUtils.smoothstep(d, 75, 150);
    const bumps = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) * 4 + Math.sin(x * 0.06 + z * 0.05) * 1.5;
    const hills = cones.reduce((sum, [cx, cz, r, h]) => sum + h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r)), 0);
    return (bumps + hills) * pad - Math.max(0, d - 280) ** 1.25 * 0.12;
}

function makeTerrain() {
    const geometry = new THREE.PlaneGeometry(3400, 3400, 110, 110).rotateX(-Math.PI / 2).toNonIndexed();
    const position = geometry.attributes.position;
    const colors = [];
    const red = new THREE.Color('#a0523f');
    const ash = new THREE.Color('#6e3b30');
    const tint = new THREE.Color();
    for (let i = 0; i < position.count; i += 3) {
        tint.lerpColors(ash, red, 0.5 + 0.5 * Math.sin(position.getX(i) * 0.03 + position.getZ(i) * 0.02));
        for (let k = i; k < i + 3; k++) {
            position.setY(k, ground(position.getX(k), position.getZ(k)));
            colors.push(tint.r, tint.g, tint.b);
        }
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({vertexColors: true}));
}

function makeClouds() {
    const clouds = new THREE.Mesh(new THREE.CircleGeometry(distances.clouds, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({color: '#e8edf5'}));
    clouds.position.y = -120;
    return clouds;
}

function makeSky() {
    const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {uSun: {value: new THREE.Vector3(0, -1, 0)}},
        vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
            uniform vec3 uSun;
            varying vec3 vDir;
            void main() {
                vec3 d = normalize(vDir);
                float h = max(d.y, 0.0);
                float day = smoothstep(-0.1, 0.07, uSun.y);
                float dusk = exp(-pow(uSun.y / 0.12, 2.0));
                vec3 zenith = mix(vec3(0.03, 0.04, 0.13), vec3(0.24, 0.52, 0.88), day);
                vec3 horizon = mix(vec3(0.1, 0.12, 0.28), vec3(0.68, 0.85, 0.97), day);
                vec3 color = mix(horizon, zenith, pow(h, 0.5));
                float toward = max(0.0, dot(normalize(d.xz + 1e-5), normalize(uSun.xz + 1e-5)));
                color = mix(color, vec3(1.0, 0.56, 0.36), dusk * exp(-h * 6.0) * (0.3 + 0.7 * toward));
                gl_FragColor = vec4(color, 1.0);
            }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(distances.sky, 48, 24), material);
    sky.renderOrder = -2;
    return sky;
}

function makeStars() {
    const positions = [];
    const sizes = [];
    const phases = [];
    for (let i = 0; i < 1800; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(distances.stars);
        const roll = Math.random();
        positions.push(v.x, v.y, v.z);
        sizes.push(roll < 0.03 ? 8 + Math.random() * 4 : roll < 0.15 ? 2.6 + Math.random() : 1.2 + Math.random());
        phases.push(Math.random() * Math.PI * 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {uTime: {value: 0}, uPixelRatio: {value: 1}, uNight: {value: 1}},
        vertexShader: `
            attribute float aSize; attribute float aPhase;
            uniform float uTime; uniform float uPixelRatio; uniform float uNight;
            varying float vAlpha; varying float vSpark;
            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * viewMatrix * world;
                gl_PointSize = aSize * uPixelRatio;
                vAlpha = uNight * smoothstep(0.0, 0.06, normalize(world.xyz).y) * (0.75 + 0.25 * sin(uTime * (1.0 + aPhase * 0.3) + aPhase));
                vSpark = step(6.0, aSize);
            }`,
        fragmentShader: `
            varying float vAlpha; varying float vSpark;
            void main() {
                vec2 p = abs(gl_PointCoord - 0.5) * 2.0;
                float core = smoothstep(1.0, 0.4, length(p) * (1.0 + vSpark * 2.5));
                float arms = vSpark * smoothstep(0.16, 0.0, min(p.x, p.y)) * (1.0 - max(p.x, p.y));
                float a = max(core, arms) * vAlpha;
                if (a < 0.01) discard;
                gl_FragColor = vec4(vec3(1.0, 0.97, 0.88) * a, a);
            }`
    });
    const stars = new THREE.Points(geometry, material);
    stars.matrixAutoUpdate = false;
    stars.frustumCulled = false;
    stars.renderOrder = -1;
    return stars;
}

function glowTexture(stops) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [offset, color] of stops) glow.addColorStop(offset, color);
    context.fillStyle = glow;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function makeMoon() {
    const radius = distances.moon * Math.tan(2.6 * deg);
    const material = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {uLight: {value: new THREE.Vector3(0, 0, 1)}, uDay: {value: 0}},
        vertexShader: `
            varying vec3 vNormal; varying vec3 vLocal;
            void main() {
                vLocal = normal;
                vNormal = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform vec3 uLight; uniform float uDay;
            varying vec3 vNormal; varying vec3 vLocal;
            float crater(vec3 c, float r) { return smoothstep(r, r * 0.6, distance(normalize(vLocal), normalize(c))); }
            void main() {
                float lit = smoothstep(-0.04, 0.04, dot(normalize(vNormal), uLight));
                float spots = crater(vec3(0.3, 0.4, 0.86), 0.28) + crater(vec3(-0.35, -0.2, 0.9), 0.2) + crater(vec3(-0.1, 0.55, 0.8), 0.14)
                    + crater(vec3(0.45, -0.35, 0.8), 0.16) + crater(vec3(-0.5, 0.25, 0.8), 0.12);
                vec3 surface = mix(vec3(1.0, 0.97, 0.86), vec3(0.8, 0.78, 0.72), min(spots, 1.0));
                gl_FragColor = vec4(mix(vec3(0.16, 0.18, 0.28), surface, lit), mix(1.0, lit, uDay));
            }`
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTexture([[0, 'rgba(220, 230, 255, 0.7)'], [1, 'rgba(220, 230, 255, 0)']]), blending: THREE.AdditiveBlending, depthWrite: false}));
    halo.scale.setScalar(radius * 7);
    moon.add(halo);
    return moon;
}

function makeSun() {
    const texture = glowTexture([[0, '#fffbe6'], [0.26, '#ffe48a'], [0.3, 'rgba(255, 214, 120, 0.45)'], [1, 'rgba(255, 214, 120, 0)']]);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({map: texture, depthWrite: false}));
    sun.scale.setScalar(distances.sun * Math.tan(8 * deg));
    return sun;
}

customElements.define('night-strip', NightStrip);
