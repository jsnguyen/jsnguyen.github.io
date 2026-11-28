// ORKID filter and pupil wheel quick reference. Specs from the ORKID instrument docs (JATIS table, bench Strehl 2026-10-16)
// and PyAO orkid.ini (slot order, Strehl tool wavelengths). Curves are logistic flat tops built from centre and width.
(function () {
    var F = {
        bessell_r: { pos: 'FW_BESSELL_R', short: 'R', name: 'Bessell R', part: 'Chroma 27052', centre: '625 nm', range: '554–696 nm', c: 625, w: 142, soft: 4, peak: 0.93, trans: '93 % avg', sr: 0.48, tool: 0.625, note: 'Broadband: ADC needed away from zenith.' },
        o_i: { pos: 'FW_O_I', short: '[O I]', name: '[O I]', centre: '630 nm', range: '620–640 nm', fwhm: '10 nm', c: 630, w: 10, soft: 1, peak: 0.90, trans: '90 % peak', sr: 0.57, tool: 0.630, note: 'Shortest narrowband. Smears beyond ADC offset 35°.' },
        h_a_cont: { pos: 'FW_H_A_CONT', short: 'Hα-c', name: 'Hα continuum', centre: '643 nm', range: '634–646 nm', fwhm: '6 nm', c: 640, w: 6, soft: 0.6, peak: 0.90, trans: '90 % peak', sr: 0.34, tool: 0.640, bad: true, note: 'Known bad since commissioning (2022): streaked image, > 40 % ghost around the first Airy ring. Not for science, sharpening or Strehl.' },
        h_a: { pos: 'FW_H_A', short: 'Hα', name: 'Hα', part: 'Chroma 27002', centre: '656.3 nm', range: '651–661 nm', fwhm: '5 nm', c: 656.3, w: 5, soft: 0.5, peak: 0.94, trans: '94 % peak', sr: 0.585, tool: 0.656, note: 'First-light and characterisation filter.' },
        sloan_i: { pos: 'FW_SLOAN_I', short: 'i', name: 'Sloan i', part: 'Chroma 27058', centre: '771 nm', range: '698–853 nm', c: 775.5, w: 155, soft: 4, peak: 0.95, trans: '95 % avg', sr: 0.58, tool: 0.7705, note: 'Broadband; ≈ 8× the Jovian flux on the bench source.' },
        jovian: { pos: 'PW_JOVIAN', short: 'Jov', name: 'Jovian methane', part: 'Chroma 27012', centre: '889 nm', range: '871–907 nm', fwhm: '18 nm', c: 889, w: 18, soft: 1.8, peak: 0.94, trans: '94 % avg', sr: 0.64, tool: 0.889, note: 'Preferred daytime sharpening filter.' },
        sloan_z: { pos: 'PW_SLOAN_Z', short: 'z', name: 'Sloan z', part: 'Chroma 27059', centre: '≈ 915 nm', range: '830–1000+ nm', c: 920, w: 180, soft: 4, peak: 0.90, trans: '90 % avg', sr: 0.67, tool: 0.915, note: 'Highest bench Strehl. The red end is set by the AO bench dichroic, ≈ 950–970 nm.' },
        ct940: { pos: 'PW_CT940_20BP', short: '940', name: 'CT940/20', centre: '940 nm', range: '920–960 nm', fwhm: '20 nm', c: 940, w: 20, soft: 2, peak: 0.93, trans: '93 % peak', sr: 0.55, tool: 0.940, note: 'Titan window; ≈ 12 % extra loss on the bench. Used for image sharpening (best performance, 2026-10-09).' }
    };
    var ORDER = ['bessell_r', 'o_i', 'h_a_cont', 'h_a', 'sloan_i', 'jovian', 'sloan_z', 'ct940'];
    var LABEL_ROW = { bessell_r: 0, o_i: 1, h_a_cont: 2, h_a: 3, sloan_i: 0, jovian: 1, sloan_z: 0, ct940: 2 };
    var WHEELS = {
        fw: { title: 'Filter wheel', note: 'Thorlabs FW102C, tilted ≈ 4° to kill ghosts between the wheels.', slots: [{ pos: 'FW_OPEN', short: 'open', open: true, name: 'Open' }, F.bessell_r, F.sloan_i, F.o_i, F.h_a, F.h_a_cont] },
        pw: { title: 'Pupil wheel', note: 'Thorlabs FW102C, at the pupil. Usable with any filter-wheel filter.', slots: [{ pos: 'PW_OPEN', short: 'open', open: true, name: 'Open' }, { pos: 'PW_NRM', short: 'NRM', nrm: true, name: 'Non-redundant mask', note: '9 holes (0.8 m each, projected) on a 3 mm AR window. Use with a filter-wheel filter; frames short enough to freeze the residuals.' }, { pos: 'PW_ND2', short: 'ND2', nd: true, name: 'Neutral density 2', trans: '1 % nominal', note: 'Bright targets, bench source. On 10 Lac it cut Sloan i by only ≈ 17×, so it is weaker in the red.' }, F.sloan_z, F.ct940, F.jovian] }
    };
    var LO = 560, HI = 1000, PX = 6.6;
    var state = { fw: { i: 4, angle: 0 }, pw: { i: 0, angle: 0 }, dur: 0 };

    ORDER.forEach(function (k, n) { F[k].key = k; F[k].color = 'hsl(' + ((10 - n * 13 + 360) % 360) + ' 85% 70%)'; });
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function sig(x) { return 1 / (1 + Math.exp(-x)); }
    function curve(f, l) { return f.peak * sig((l - (f.c - f.w / 2)) / f.soft) * sig(((f.c + f.w / 2) - l) / f.soft); }
    function element(s, l) { return s.open || s.nrm ? 1 : s.nd ? 0.01 : curve(s, l); }
    function bench(l) { return sig((l - 595) / 3) * sig((962 - l) / 6); }
    function beam(l) { return element(slot('fw'), l) * element(slot('pw'), l) * bench(l); }
    function slot(id) { return WHEELS[id].slots[state[id].i]; }
    function lambda_d(nm) { return nm * 0.0206265; }

    // Wheels
    function nrm_dots() { return [[-6, -5], [-1, -7], [5, -5], [-7, 1], [0, -1], [6, 2], [-4, 6], [2, 6], [7, 7]].map(function (p) { return '<circle class="hole" cx="' + p[0] + '" cy="' + p[1] + '" r="1.6"/>'; }).join(''); }
    function wheel_svg(id) {
        var w = WHEELS[id], n = w.slots.length, svg = '<figure class="wheel"><svg viewBox="-72 -84 144 158" role="group" aria-label="' + w.title + '"><g class="rot" id="rot-' + id + '"><circle class="disc" r="58"/>';
        w.slots.forEach(function (s, i) {
            var a = i * 2 * Math.PI / n, cls = 'slot' + (s.open ? ' open' : '') + (s.bad ? ' bad' : '');
            svg += '<g class="' + cls + '" data-wheel="' + id + '" data-i="' + i + '" tabindex="0" role="button" aria-label="' + esc(s.name + ' (' + s.pos + ')') + '" transform="translate(' + (44 * Math.sin(a)).toFixed(2) + ' ' + (-44 * Math.cos(a)).toFixed(2) + ')"' + (s.color ? ' style="--c:' + s.color + '"' : '') + '>' +
                '<circle class="glass" r="14"/>' + (s.nrm ? nrm_dots() : '<text class="lbl">' + esc(s.short) + '</text>') + '</g>';
        });
        return svg + '<circle class="hub" r="7"/></g><path class="beam-mark" d="M0 -61 L-6 -71 L6 -71 Z"/><text class="beam-lbl" y="-76">beam</text></svg><figcaption><span>' + w.title + '</span><code id="pos-' + id + '"></code></figcaption></figure>';
    }
    function render_wheel(id) {
        var st = state[id], g = document.getElementById('rot-' + id), d = (st.dur || 0) + 's';
        g.style.transitionDuration = d;
        g.style.transform = 'rotate(' + st.angle + 'deg)';
        g.querySelectorAll('.slot').forEach(function (s) {
            s.classList.toggle('on', +s.dataset.i === st.i);
            var t = s.querySelector('.lbl');
            if (t) { t.style.transitionDuration = d; t.style.transform = 'rotate(' + (-st.angle) + 'deg)'; }
        });
        document.getElementById('pos-' + id).textContent = slot(id).pos;
    }
    function turn(id, i) {
        var st = state[id], n = WHEELS[id].slots.length, steps = Math.min((i - st.i + n) % n, (st.i - i + n) % n);
        var delta = ((-i * 360 / n - st.angle) % 360 + 540) % 360 - 180;
        st.i = i; st.angle += delta; st.dur = [0, 0.8, 1.6, 2.5][steps];
        render_wheel(id);
        return steps;
    }

    // Chart
    var M = { l: 40, r: 12, t: 62, b: 32 }, W = 640, H = 290;
    function x(l) { return M.l + (l - LO) / (HI - LO) * (W - M.l - M.r); }
    function y(t) { return H - M.b - t * (H - M.t - M.b); }
    function path(fn, close) {
        var d = '';
        for (var l = LO; l <= HI; l += 0.5) d += (d ? 'L' : 'M') + x(l).toFixed(1) + ' ' + y(fn(l)).toFixed(1);
        return close ? d + 'L' + x(HI) + ' ' + y(0) + 'L' + x(LO) + ' ' + y(0) + 'Z' : d;
    }
    function build_chart() {
        var s = '<rect class="cut" x="' + x(LO) + '" y="' + M.t + '" width="' + (x(595) - x(LO)) + '" height="' + (y(0) - M.t) + '"/>' +
            '<rect class="cut" x="' + x(962) + '" y="' + M.t + '" width="' + (x(HI) - x(962)) + '" height="' + (y(0) - M.t) + '"/>' +
            '<text class="cut-lbl" x="' + (x(LO) + 4) + '" y="' + (y(1) + 14) + '">to ACAM</text><text class="cut-lbl" x="' + (x(HI) - 4) + '" y="' + (y(1) + 14) + '" text-anchor="end">dichroic</text>';
        [0, 0.25, 0.5, 0.75, 1].forEach(function (t) { s += '<line class="grid" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="tick" x="' + (M.l - 6) + '" y="' + y(t) + '" text-anchor="end">' + t * 100 + '</text>'; });
        for (var l = 600; l < HI; l += 50) s += '<text class="tick" x="' + x(l) + '" y="' + (H - M.b + 16) + '" text-anchor="middle">' + l + '</text>';
        s += '<text class="axis-lbl" x="' + (W - M.r) + '" y="' + (H - 2) + '" text-anchor="end">wavelength (nm)</text><text class="axis-lbl" x="4" y="' + (M.t - 8) + '">T (%)</text>';
        s += '<path class="beam-area" id="beam-area"/>';
        ORDER.forEach(function (k) {
            var f = F[k], ly = 12 + LABEL_ROW[k] * 12;
            s += '<g class="curve" data-key="' + k + '" style="--c:' + f.color + '" tabindex="0" role="button" aria-label="' + esc(f.name) + '">' +
                '<path class="hit" d="' + path(function (l) { return curve(f, l); }) + '"/><path class="line" d="' + path(function (l) { return curve(f, l); }) + '"/>' +
                '<line class="lead" x1="' + x(f.c) + '" x2="' + x(f.c) + '" y1="' + (ly + 3) + '" y2="' + (y(f.peak) - 2) + '"/><text class="curve-lbl" x="' + x(f.c) + '" y="' + ly + '">' + esc(f.short) + '</text></g>';
        });
        s += '<line class="cursor" id="cursor" y1="' + M.t + '" y2="' + y(0) + '"/><text class="cursor-lbl" id="cursor-lbl" y="' + (M.t - 6) + '"></text>';
        chart.innerHTML = s;
    }
    function render_chart() {
        var keys = [slot('fw').key, slot('pw').key], area = document.getElementById('beam-area');
        chart.querySelectorAll('.curve').forEach(function (g) { g.classList.toggle('on', keys.indexOf(g.dataset.key) >= 0); });
        area.classList.remove('grow');
        area.setAttribute('d', path(beam, true));
        void area.getBBox();
        area.classList.add('grow');
    }
    function stats() {
        var sum = 0, wsum = 0, max = 0;
        for (var l = LO; l <= HI; l += 0.5) { var t = beam(l); sum += t * 0.5; wsum += l * t * 0.5; if (t > max) max = t; }
        return { eff: sum ? wsum / sum : 0, ew: max ? sum / max : 0, max: max, sum: sum };
    }

    // Combination and details
    function combo() {
        var f = slot('fw'), p = slot('pw'), msg, warn = false;
        if (f.open && p.open) { msg = 'Open + open: 595 to ≈ 960 nm, no defined wavelength; the Strehl tool refuses it.'; warn = true; }
        else if (p.nrm && f.open) { msg = 'NRM needs a filter-wheel filter.'; warn = true; }
        else if (p.nrm) msg = 'NRM through ' + f.name + ': the standard NRM setup.';
        else if (p.nd) { msg = (f.open ? 'ND2 alone: no defined wavelength.' : f.name + ' + ND2: attenuated beam.'); warn = f.open; }
        else if (!f.open && !p.open) { msg = 'Crossed filters: ' + f.name + ' and ' + p.name + ' barely overlap, so almost no light gets through. Use one wheel at a time.'; warn = true; }
        else msg = 'In the beam: ' + (f.open ? p.name : f.name) + '.';
        if (f.bad) { msg += ' Hα continuum is a known bad filter.'; warn = true; }
        var el = document.getElementById('combo');
        el.textContent = msg;
        el.classList.toggle('warn', warn);
    }
    function info(moved, steps) {
        var f = slot('fw'), p = slot('pw'), active = [f, p].filter(function (s) { return s.key; }), st = stats(), rows = [], html;
        if (active.length === 1) {
            var a = active[0], ld = lambda_d(a.tool * 1000);
            rows = [['Position', a.pos], ['Part', a.part], ['Centre', a.centre], ['Range', a.range], ['FWHM', a.fwhm], ['Transmission', a.trans], ['PyAO λ', (a.tool * 1000).toFixed(1).replace(/\.0$/, '') + ' nm'], ['Bench Strehl', a.sr], ['λ/D', ld.toFixed(1) + ' mas (' + (ld / PX).toFixed(2) + ' pixels)']];
            html = '<h2><span class="swatch" style="background:' + a.color + '"></span>' + esc(a.name) + '</h2>';
        } else html = '<h2>' + esc(f.pos + ' + ' + p.pos) + '</h2>';
        if (st.max > 0.002) rows.push(['Beam effective λ', st.eff.toFixed(0) + ' nm'], ['Beam equiv. width', st.ew.toFixed(0) + ' nm'], ['Beam peak', (st.max * 100).toFixed(st.max < 0.1 ? 1 : 0) + ' %']);
        else rows.push(['Beam peak', (st.max * 100).toFixed(2) + ' %']);
        html += '<dl>' + rows.filter(function (r) { return r[1] !== undefined; }).map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>';
        [f, p].forEach(function (s) { if (s.note) html += '<p>' + esc(s.note) + '</p>'; });
        if (moved) html += '<p class="move">' + WHEELS[moved].title + ': ' + WHEELS[moved].note + (steps ? ' This move: ' + steps + ' slot' + (steps > 1 ? 's' : '') + ', ' + (steps === 1 ? '< 1 s' : steps === 3 ? '≈ 2.5 s' : '1 to 2.5 s') + '.' : '') + '</p>';
        document.getElementById('info').innerHTML = html;
    }
    function table() {
        var head = '<thead><tr><th>Position</th><th>Filter</th><th>Centre</th><th>Range</th><th>T</th><th>PyAO λ</th><th>SR</th><th>λ/D</th></tr></thead><tbody>';
        document.getElementById('ref-table').innerHTML = head + ORDER.map(function (k) {
            var f = F[k];
            return '<tr data-key="' + k + '" tabindex="0"' + (f.bad ? ' class="bad"' : '') + '><td><code>' + f.pos + '</code></td><td><span class="swatch" style="background:' + f.color + '"></span>' + esc(f.name) + '</td><td>' + esc(f.centre) + '</td><td>' + esc(f.range) + '</td><td>' + esc(f.trans) + '</td><td>' + Math.round(f.tool * 1000) + '</td><td>' + f.sr + '</td><td>' + lambda_d(f.tool * 1000).toFixed(1) + '</td></tr>';
        }).join('') + '</tbody>';
    }
    function highlight_rows() {
        var keys = [slot('fw').key, slot('pw').key];
        document.querySelectorAll('#ref-table tbody tr').forEach(function (r) { r.classList.toggle('on', keys.indexOf(r.dataset.key) >= 0); });
    }
    function update(moved, steps) { render_chart(); combo(); info(moved, steps); highlight_rows(); }

    function pick_wheel(id, i) { update(id, turn(id, i)); }
    function pick_filter(key) {
        var id = WHEELS.fw.slots.indexOf(F[key]) >= 0 ? 'fw' : 'pw', other = id === 'fw' ? 'pw' : 'fw', steps = turn(id, WHEELS[id].slots.indexOf(F[key]));
        if (slot(other).key) turn(other, 0);
        update(id, steps);
    }

    var wheels = document.getElementById('wheels'), chart = document.getElementById('chart');
    wheels.innerHTML = wheel_svg('fw') + wheel_svg('pw');
    build_chart();
    table();
    function activate(e) {
        var s = e.target.closest('.slot'), c = e.target.closest('.curve, tr[data-key]');
        if (s) pick_wheel(s.dataset.wheel, +s.dataset.i);
        else if (c) pick_filter(c.dataset.key);
        return s || c;
    }
    document.addEventListener('click', activate);
    document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.slot, .curve, tr[data-key]')) { e.preventDefault(); activate(e); } });
    chart.addEventListener('pointermove', function (e) {
        var pt = chart.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        var p = pt.matrixTransform(chart.getScreenCTM().inverse()), l = LO + (p.x - M.l) / (W - M.l - M.r) * (HI - LO), cur = document.getElementById('cursor'), lbl = document.getElementById('cursor-lbl');
        var show = l >= LO && l <= HI;
        cur.style.opacity = lbl.style.opacity = show ? 1 : 0;
        if (!show) return;
        cur.setAttribute('x1', p.x); cur.setAttribute('x2', p.x);
        lbl.setAttribute('x', Math.min(Math.max(p.x, M.l + 50), W - M.r - 50));
        lbl.textContent = l.toFixed(0) + ' nm · beam ' + (beam(l) * 100).toFixed(1) + ' %';
    });
    chart.addEventListener('pointerleave', function () { document.getElementById('cursor').style.opacity = document.getElementById('cursor-lbl').style.opacity = 0; });

    state.fw.angle = -state.fw.i * 60;
    render_wheel('fw'); render_wheel('pw'); update(null, 0);
})();
