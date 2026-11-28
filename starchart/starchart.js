// Finder chart: Gaia DR3 stars around a target with a compass rose and alt/az for a site.
(() => {
    const vizier_hosts = ['https://vizier.cfa.harvard.edu', 'https://vizier.cds.unistra.fr'];
    const sites = { keck: { lat: 19.8286, lon: -155.4742 } };
    const deg = Math.PI / 180;
    const $ = id => document.getElementById(id);
    const canvas = $('chart');
    const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    let catalog = { key: '', stars: [] };
    let drawn = [];
    let fetch_id = 0;

    function parse_sexagesimal(text, hours) {
        const parts = text.trim().replace(/[hdms:°'"]/g, ' ').split(/\s+/).filter(Boolean);
        if (parts.length === 1) return parseFloat(parts[0]);
        const sign = parts[0].startsWith('-') ? -1 : 1;
        const [a, b = 0, c = 0] = parts.map(p => Math.abs(parseFloat(p)));
        return sign * (a + b / 60 + c / 3600) * (hours ? 15 : 1);
    }

    function format_sexagesimal(value, hours) {
        const sign = value < 0 ? '-' : hours ? '' : '+';
        let s = Math.abs(value) / (hours ? 15 : 1) * 3600;
        const a = Math.floor(s / 3600); s -= a * 3600;
        const b = Math.floor(s / 60); s -= b * 60;
        const pad = n => String(n).padStart(2, '0');
        return `${sign}${pad(a)} ${pad(b)} ${s.toFixed(hours ? 2 : 1).padStart(hours ? 5 : 4, '0')}`;
    }

    function read_inputs() {
        const ra = parse_sexagesimal($('ra').value, $('ra').value.trim().includes(' ') || $('ra').value.includes(':'));
        const dec = parse_sexagesimal($('dec').value, false);
        const fov = parseFloat($('size').value) * parseFloat($('unit').value);
        const time = $('time').value ? new Date($('time').value + 'Z') : new Date();
        const years = (julian_date(time) - 2451545) / 365.25;
        const pm_dec = (parseFloat($('pmdec').value) || 0) * years / 3.6e6;
        const pm_ra = (parseFloat($('pmra').value) || 0) * years / 3.6e6 / Math.cos(dec * deg);
        return { ra, dec, center: { ra: ra + pm_ra, dec: dec + pm_dec }, fov, maglim: parseFloat($('maglim').value), orient: document.querySelector('input[name=orient]:checked').value, lat: parseFloat($('lat').value), lon: parseFloat($('lon').value), time };
    }

    function julian_date(date) { return date.getTime() / 86400000 + 2440587.5; }

    function precess_from_j2000(ra, dec, years) {
        const m = 46.1 / 3600, n = 20.04 / 3600;
        return { ra: ra + (m + n * Math.sin(ra * deg) * Math.tan(dec * deg)) * years, dec: dec + n * Math.cos(ra * deg) * years };
    }

    function horizon(p) {
        const jd = julian_date(p.time);
        const now = precess_from_j2000(p.ra, p.dec, (jd - 2451545) / 365.25);
        const lst = (280.46061837 + 360.98564736629 * (jd - 2451545) + p.lon) % 360;
        const h = (((lst - now.ra) % 360) + 540) % 360 - 180;
        const [H, d, f] = [h * deg, now.dec * deg, p.lat * deg];
        const alt = Math.asin(Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H));
        const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(f) - Math.cos(d) * Math.cos(H) * Math.sin(f));
        const q = Math.atan2(Math.sin(H), Math.tan(f) * Math.cos(d) - Math.sin(d) * Math.cos(H));
        return { alt: alt / deg, az: ((az / deg) + 360) % 360, ha: h / 15, q: q / deg, airmass: alt > 0 ? 1 / Math.sin(alt) : Infinity };
    }

    async function fetch_stars(p) {
        const radius = p.fov / 60 * Math.SQRT1_2 * 1.02;
        const query = `-source=I/355/gaiadr3&-c=${p.ra.toFixed(6)}%20${p.dec >= 0 ? '%2B' : ''}${p.dec.toFixed(6)}&-c.rm=${radius.toFixed(4)}&-out=Source,RA_ICRS,DE_ICRS,pmRA,pmDE,Gmag,BP-RP&Gmag=%3C${p.maglim}&-sort=Gmag&-out.max=5000`;
        for (const host of vizier_hosts) {
            try {
                const response = await fetch(`${host}/viz-bin/asu-tsv?${query}`);
                if (!response.ok) continue;
                return parse_tsv(await response.text());
            } catch (error) { console.warn(host, error); }
        }
        throw new Error('VizieR unavailable');
    }

    function parse_tsv(text) {
        return text.split('\n').filter(line => /^\d/.test(line)).map(line => {
            const [source, ra, dec, pmra, pmdec, g, bprp] = line.split('\t').map(s => s.trim());
            return { source, ra: +ra, dec: +dec, pmra: +pmra || 0, pmdec: +pmdec || 0, g: +g, bprp: bprp === '' ? null : +bprp };
        }).filter(s => Number.isFinite(s.g));
    }

    function project(star, p, years) {
        const a = star.ra * deg, d = star.dec * deg, a0 = p.center.ra * deg, d0 = p.center.dec * deg;
        const cos_c = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
        const xi = Math.cos(d) * Math.sin(a - a0) / cos_c / deg * 3600 + star.pmra * years / 1000;
        const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cos_c / deg * 3600 + star.pmdec * years / 1000;
        return { xi, eta };
    }

    function nice_scale(max_arcsec) {
        const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
        return steps.filter(s => s <= max_arcsec).pop() || steps[0];
    }

    const color_stops = [[-0.3, [140, 170, 255]], [0, [165, 190, 255]], [0.3, [205, 218, 255]], [0.6, [245, 245, 255]], [0.8, [255, 240, 220]], [1.1, [255, 222, 175]], [1.5, [255, 195, 130]], [2.2, [255, 165, 100]], [3, [255, 130, 80]]];
    const spectral_types = [['B', -0.15], ['A', 0.15], ['F', 0.55], ['G', 0.85], ['K', 1.3], ['M', 2.4]];

    function star_color(bprp) {
        if (bprp === null) return [235, 235, 245];
        const i = color_stops.findIndex(([x]) => x >= bprp);
        if (i <= 0) return color_stops[i === 0 ? 0 : color_stops.length - 1][1];
        const [[x0, c0], [x1, c1]] = [color_stops[i - 1], color_stops[i]];
        const f = (bprp - x0) / (x1 - x0);
        return c0.map((v, j) => Math.round(v + (c1[j] - v) * f));
    }

    function spectral_type(bprp) {
        if (bprp === null) return null;
        return bprp < 0 ? 'B' : bprp < 0.35 ? 'A' : bprp < 0.75 ? 'F' : bprp < 1 ? 'G' : bprp < 1.8 ? 'K' : 'M';
    }

    function format_arcsec(s) { return s >= 60 ? `${s / 60}′` : `${s}″`; }

    function draw(out = canvas, size = canvas.clientWidth, dpr = window.devicePixelRatio || 1) {
        const p = read_inputs();
        if (![p.ra, p.dec, p.fov, p.lat, p.lon].every(Number.isFinite) || !size) return;
        const ctx = out.getContext('2d');
        out.width = out.height = Math.round(size * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const ink = css('--glass-ink'), muted = css('--glass-muted'), accent = css('--glass-accent');
        const font = (px, weight = 400) => `${weight} ${px * t}px "Stack Sans Text", system-ui, sans-serif`;
        const k = size / 640, t = Math.max(k, 0.8);
        const pad = 10 * t, line = 15 * t;

        const sky_bg = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.75);
        sky_bg.addColorStop(0, '#1a1633');
        sky_bg.addColorStop(1, '#09081a');
        ctx.fillStyle = sky_bg;
        ctx.fillRect(0, 0, size, size);

        const sky = horizon(p);
        const theta = p.orient === 'zenith' ? sky.q * deg : 0;
        const scale = size / p.fov;
        const to_screen = (xi, eta) => [size / 2 - (xi * Math.cos(theta) - eta * Math.sin(theta)) * scale, size / 2 - (eta * Math.cos(theta) + xi * Math.sin(theta)) * scale];
        const pa_vector = pa => [-Math.sin((pa * deg) - theta), -Math.cos((pa * deg) - theta)];

        const years = (julian_date(p.time) - julian_date(new Date('2016-01-01T12:00:00Z'))) / 365.25;
        const bright = catalog.stars.length ? catalog.stars[0].g : p.maglim;
        const stars = [];
        for (const star of catalog.stars) {
            const { xi, eta } = project(star, p, years);
            const [x, y] = to_screen(xi, eta);
            if (x < -10 || y < -10 || x > size + 10 || y > size + 10) continue;
            const r = k * (1 + 7 * Math.pow(Math.max(0, p.maglim - star.g) / Math.max(1, p.maglim - bright), 1.4));
            stars.push({ star, x, y, r, xi, eta });
        }
        if (out === canvas) drawn = stars;
        ctx.globalCompositeOperation = 'lighter';
        for (const s of stars.slice().reverse()) {
            const rgb = star_color(s.star.bprp).join(', ');
            if (s.r > 2.5 * k) {
                const glow = ctx.createRadialGradient(s.x, s.y, s.r * 0.5, s.x, s.y, s.r * 3.5);
                glow.addColorStop(0, `rgba(${rgb}, 0.35)`);
                glow.addColorStop(1, `rgba(${rgb}, 0)`);
                ctx.fillStyle = glow;
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3.5, 0, 2 * Math.PI); ctx.fill();
            }
            const core = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
            core.addColorStop(0, 'rgba(255, 255, 255, 1)');
            core.addColorStop(0.45, `rgba(${rgb}, 1)`);
            core.addColorStop(1, `rgba(${rgb}, 0.55)`);
            ctx.fillStyle = core;
            ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(s.r, 0.8), 0, 2 * Math.PI); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = font(10);
        ctx.fillStyle = muted;
        ctx.textBaseline = 'middle';
        const c = size / 2, ring = 16 * t, arm = 12 * t;
        for (const s of stars.slice(0, 12)) {
            const label = s.star.g.toFixed(1), w = ctx.measureText(label).width;
            const r = Math.hypot(s.x - c, s.y - c) < ring ? ring + arm * 0.6 + Math.hypot(s.x - c, s.y - c) : s.r;
            const x = s.x + r + 3 * t + w > size - 2 ? s.x - r - 3 * t - w : s.x + r + 3 * t;
            ctx.fillText(label, x, Math.max(6 * t, s.y - r * 0.6 - 2 * t));
        }

        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.2 * t;
        ctx.beginPath();
        ctx.arc(c, c, ring, 0, 2 * Math.PI);
        ctx.moveTo(c - ring - arm, c); ctx.lineTo(c - ring, c);
        ctx.moveTo(c + ring, c); ctx.lineTo(c + ring + arm, c);
        ctx.moveTo(c, c - ring - arm); ctx.lineTo(c, c - ring);
        ctx.moveTo(c, c + ring); ctx.lineTo(c, c + ring + arm);
        ctx.stroke();
        ctx.globalAlpha = 1;

        const box = (x, y, w, h) => {
            ctx.beginPath(); ctx.roundRect(x, y, w, h, 8 * t);
            ctx.fillStyle = 'rgba(14, 12, 30, 0.78)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'; ctx.lineWidth = 1; ctx.stroke();
        };
        const text_box = (rows, x, y, align) => {
            const w = Math.max(...rows.map(([text, f]) => { ctx.font = f; return ctx.measureText(text).width; })) + 2 * pad;
            const h = rows.length * line + pad;
            const left = align === 'right' ? x - w : x;
            box(left, y, w, h);
            ctx.textAlign = align;
            rows.forEach(([text, f, color], i) => { ctx.font = f; ctx.fillStyle = color; ctx.fillText(text, align === 'right' ? x - pad : x + pad, y + pad / 2 + line * (i + 0.5)); });
            ctx.textAlign = 'left';
            return { w, h };
        };
        const arrow = (x, y, v, len, label, color) => {
            const [ex, ey] = [x + v[0] * len, y + v[1] * len];
            const head = 6 * t, ang = Math.atan2(v[1], v[0]);
            ctx.strokeStyle = ctx.fillStyle = color;
            ctx.lineWidth = 1.5 * t;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - head * Math.cos(ang - 0.4), ey - head * Math.sin(ang - 0.4));
            ctx.lineTo(ex - head * Math.cos(ang + 0.4), ey - head * Math.sin(ang + 0.4));
            ctx.fill();
            ctx.font = font(11, 500);
            ctx.textAlign = 'center';
            ctx.fillText(label, x + v[0] * (len + 12 * t), y + v[1] * (len + 12 * t));
            ctx.textAlign = 'left';
        };

        const target = [
            [$('target').value.trim() || 'Target', font(13, 500), ink],
            [`${format_sexagesimal(p.ra, true)}  ${format_sexagesimal(p.dec, false)}`, font(10), muted],
            [`${p.time.toISOString().slice(0, 16).replace('T', ' ')} UTC`, font(10), muted],
            [`Alt ${sky.alt.toFixed(1)}°  Az ${sky.az.toFixed(1)}°  AM ${Number.isFinite(sky.airmass) ? sky.airmass.toFixed(2) : '–'}`, font(10), ink],
            [`HA ${sky.ha >= 0 ? '+' : ''}${sky.ha.toFixed(2)}h  PA ${sky.q.toFixed(1)}°`, font(10), muted],
        ];
        const info = [
            [`${format_arcsec(p.fov)} × ${format_arcsec(p.fov)}`, font(10, 500), ink],
            [`G < ${p.maglim}`, font(10), muted],
            [p.orient === 'zenith' ? 'Alt-az, zenith up' : 'North up, East left', font(10), muted],
            [$('site').selectedOptions[0].text, font(10), muted],
            [`${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`, font(10), muted],
            [spectral_types.map(([type]) => type).join('  '), font(10, 500), 'transparent'],
        ];
        const left = text_box(target, pad, pad, 'left');
        ctx.font = font(10);
        const info_w = Math.max(...info.map(([text, f]) => { ctx.font = f; return ctx.measureText(text).width; })) + 2 * pad;
        const info_y = left.w + info_w + 3 * pad > size ? left.h + 2 * pad : pad;
        text_box(info, size - pad, info_y, 'right');
        ctx.font = font(10, 500);
        let legend_x = size - 2 * pad - ctx.measureText(info[info.length - 1][0]).width;
        for (const [type, bprp] of spectral_types) {
            ctx.fillStyle = `rgb(${star_color(bprp).join(', ')})`;
            ctx.fillText(type, legend_x, info_y + pad / 2 + line * (info.length - 0.5));
            legend_x += ctx.measureText(type + '  ').width;
        }

        const rose = 100 * t, len = 28 * t;
        const [rx, zx, ry] = [pad + rose / 2, size - pad - rose / 2, size - pad - rose / 2];
        box(pad, size - pad - rose, rose, rose);
        arrow(rx, ry, pa_vector(0), len, 'N', ink);
        arrow(rx, ry, pa_vector(90), len * 0.75, 'E', muted);
        box(size - pad - rose, size - pad - rose, rose, rose);
        if (sky.alt > 0) {
            arrow(zx, ry, pa_vector(sky.q), len, 'Zen', accent);
            arrow(zx, ry, pa_vector(sky.q - 90), len * 0.75, '+Az', muted);
        } else {
            ctx.font = font(10); ctx.fillStyle = muted; ctx.textAlign = 'center';
            ctx.fillText('below', zx, ry - line / 2); ctx.fillText('horizon', zx, ry + line / 2); ctx.textAlign = 'left';
        }

        const bar_room = size - 2 * (rose + 2 * pad) - 4 * pad;
        const bar = nice_scale(Math.min(p.fov / 4, bar_room / scale)), bar_px = bar * scale;
        const bar_h = 2 * line;
        box(size / 2 - bar_px / 2 - 2 * pad, size - pad - bar_h, bar_px + 4 * pad, bar_h);
        ctx.strokeStyle = ctx.fillStyle = ink;
        ctx.lineWidth = 1.5 * t;
        ctx.beginPath();
        ctx.moveTo(size / 2 - bar_px / 2, size - pad - line * 0.6); ctx.lineTo(size / 2 + bar_px / 2, size - pad - line * 0.6);
        ctx.stroke();
        ctx.font = font(10);
        ctx.textAlign = 'center';
        ctx.fillText(format_arcsec(bar), size / 2, size - pad - line * 1.35);
        ctx.textAlign = 'left';
    }

    async function update_catalog() {
        const p = read_inputs();
        if (![p.ra, p.dec, p.fov, p.maglim].every(Number.isFinite)) return set_status('Check the RA, Dec, field and G limit.', true);
        const key = [p.ra.toFixed(6), p.dec.toFixed(6), p.fov, p.maglim].join();
        if (key === catalog.key) return draw();
        const id = ++fetch_id;
        set_status('Loading Gaia DR3…');
        try {
            const stars = await fetch_stars(p);
            if (id !== fetch_id) return;
            catalog = { key, stars };
            set_status(`${stars.length} stars${stars.length >= 5000 ? ' (truncated, lower the G limit)' : ''}`);
        } catch (error) {
            if (id === fetch_id) set_status('Could not reach VizieR.', true);
        }
        draw();
    }

    function set_status(text, warn = false) {
        $('status').textContent = text;
        $('status').classList.toggle('warn', warn);
    }

    async function resolve() {
        const name = $('target').value.trim();
        if (!name) return;
        set_status(`Resolving ${name}…`);
        try {
            const response = await fetch(`https://cds.unistra.fr/cgi-bin/nph-sesame/-ox/~A?${encodeURIComponent(name)}`);
            const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
            const ra = xml.querySelector('jradeg'), dec = xml.querySelector('jdedeg');
            if (!ra || !dec) throw new Error('not found');
            $('pmra').value = xml.querySelector('pmRA')?.textContent ?? 0;
            $('pmdec').value = xml.querySelector('pmDE')?.textContent ?? 0;
            $('ra').value = format_sexagesimal(parseFloat(ra.textContent), true);
            $('dec').value = format_sexagesimal(parseFloat(dec.textContent), false);
            update_catalog();
        } catch (error) {
            set_status(`Could not resolve ${name}.`, true);
        }
    }

    function mark_preset() {
        const mark = $('unit').value === '60' ? '′' : '″';
        for (const button of $('presets').children) {
            button.textContent = `${button.dataset.size}×${button.dataset.size}${mark}`;
            button.classList.toggle('on', parseFloat($('size').value) === parseFloat(button.dataset.size));
        }
    }

    function set_now() {
        $('time').value = new Date().toISOString().slice(0, 16);
    }

    function on_hover(event) {
        const rect = canvas.getBoundingClientRect();
        const [mx, my] = [event.clientX - rect.left, event.clientY - rect.top];
        let best = null, best_d = 12;
        for (const s of drawn) {
            const d = Math.hypot(s.x - mx, s.y - my) - s.r;
            if (d < best_d) { best = s; best_d = d; }
        }
        if (!best) return;
        const { star, xi, eta } = best;
        const offset = `${Math.abs(xi).toFixed(1)}″ ${xi >= 0 ? 'E' : 'W'}, ${Math.abs(eta).toFixed(1)}″ ${eta >= 0 ? 'N' : 'S'}`;
        $('hover').textContent = `Gaia DR3 ${star.source} · G ${star.g.toFixed(2)}${star.bprp === null ? '' : ` · BP−RP ${star.bprp.toFixed(2)} (~${spectral_type(star.bprp)})`} · ${offset} (${Math.hypot(xi, eta).toFixed(1)}″)`;
    }

    function save() {
        const link = document.createElement('a');
        link.download = `starchart_${($('target').value.trim() || 'target').replace(/\W+/g, '_').toLowerCase()}.png`;
        const out = document.createElement('canvas');
        draw(out, 1000, 1);
        link.href = out.toDataURL('image/png');
        link.click();
    }

    $('site').addEventListener('change', () => {
        const site = sites[$('site').value];
        if (site) { $('lat').value = site.lat; $('lon').value = site.lon; }
        draw();
    });
    for (const id of ['lat', 'lon']) $(id).addEventListener('input', () => { $('site').value = 'custom'; draw(); });
    for (const id of ['time', 'pmra', 'pmdec']) $(id).addEventListener('input', () => draw());
    for (const radio of document.querySelectorAll('input[name=orient]')) radio.addEventListener('change', () => draw());
    for (const id of ['ra', 'dec', 'size', 'unit', 'maglim']) $(id).addEventListener('change', update_catalog);
    for (const id of ['size', 'unit']) $(id).addEventListener('input', mark_preset);
    for (const button of $('presets').children) button.addEventListener('click', () => { $('size').value = button.dataset.size; mark_preset(); update_catalog(); });
    $('resolve').addEventListener('click', resolve);
    $('target').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); resolve(); } });
    $('controls').addEventListener('submit', e => e.preventDefault());
    $('now').addEventListener('click', () => { set_now(); draw(); });
    $('save').addEventListener('click', save);
    canvas.addEventListener('mousemove', on_hover);
    new ResizeObserver(() => draw()).observe(canvas);

    set_now();
    mark_preset();
    document.fonts.ready.then(update_catalog);
})();
