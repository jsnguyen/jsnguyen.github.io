import {minimumTint, observingTime, formatSeconds, subcPresets} from './efficiency.js';

export const readsColors = {2: '#2a78d6', 4: '#6250d6', 8: '#eb6834', 16: '#1baf7a', 32: '#eda100', 64: '#e87ba4', 128: '#008300'};
export const subcColors = {1024: '#2a78d6', 768: '#6250d6', 512: '#eb6834', 256: '#1baf7a', 128: '#eda100', 64: '#e87ba4'};
export const subcDashes = {1024: [], 768: [8, 3, 2, 3, 2, 3], 512: [8, 4], 256: [2, 3], 128: [8, 3, 2, 3], 64: [4, 3]};
const customColor = '#008300';
const markerColor = '#e34948';
const sampleCount = 600;
export const axisStyle = {stroke: '#222', font: '11px Arial', labelFont: '12px Arial', ticks: {size: 3, stroke: '#777'}};

const panels = [
    {key: 'tint', name: 'Tint', label: 'Tint [s]', format: formatSeconds, range: settings => [minimumTint(settings), Math.max(100, settings.tint)]},
    {key: 'coadds', name: 'Coadds', label: 'Coadds', integer: true, format: String, range: (settings, log) => [log ? 1 : 0, Math.max(200, settings.coadds)]}
];

export function add(parent, tag, className, text = '') {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
}

export function swatchBackground(color, dash) {
    if (!dash.length) return color;
    let position = 0;
    const stops = dash.map((length, i) => `${i % 2 ? 'transparent' : color} ${position}px ${position += length}px`);
    return `repeating-linear-gradient(90deg, ${stops.join(', ')})`;
}

export function logSplits(min, max, length) {
    const mantissas = length / Math.log10(max / min) > 110 ? [1, 2, 5] : [1];
    const ticks = [];
    for (let power = Math.floor(Math.log10(min)); power <= Math.ceil(Math.log10(max)); power++) {
        for (const mantissa of mantissas) {
            const tick = Number((mantissa * 10 ** power).toPrecision(1));
            if (tick >= min && tick <= max) ticks.push(tick);
        }
    }
    return ticks;
}

export const logAxis = {filter: (plot, ticks) => ticks, values: (plot, ticks) => ticks.map(String)};

export function drawDot(plot, x, y) {
    const {ctx} = plot;
    const scale = ctx.canvas.width / plot.width;
    ctx.save();
    ctx.beginPath();
    ctx.arc(plot.valToPos(x, 'x', true), plot.valToPos(y, 'y', true), 4.5 * scale, 0, 2 * Math.PI);
    ctx.fillStyle = markerColor;
    ctx.fill();
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeStyle = 'white';
    ctx.stroke();
    ctx.restore();
}

export function onPointer(plot, inspect, clear) {
    plot.over.addEventListener('pointermove', inspect);
    plot.over.addEventListener('pointerdown', inspect);
    plot.over.addEventListener('pointerleave', event => event.pointerType === 'mouse' && clear());
}

function lineSet(settings) {
    const presetOf = (x, y) => subcPresets[x] === y ? x : null;
    if (settings.compareMode === 'reads') {
        const preset = presetOf(settings.x, settings.y);
        return [...new Set([settings.reads, ...settings.compareReads])].sort((a, b) => a - b).map(reads => ({
            label: `${reads} reads`, color: readsColors[reads], dash: preset ? subcDashes[preset] : [],
            primary: reads === settings.reads, settings: {...settings, reads}
        })).sort((a, b) => b.primary - a.primary);
    }
    const others = settings.compareSubcs.filter(x => x !== presetOf(settings.x, settings.y)).map(x => [x, subcPresets[x]]);
    return [[settings.x, settings.y], ...others].map(([x, y], i) => {
        const preset = presetOf(x, y);
        return {
            label: `${x}×${y}`, color: preset ? subcColors[preset] : customColor, dash: preset ? subcDashes[preset] : [],
            primary: i === 0, settings: {...settings, x, y}
        };
    });
}

function timeAt(panel, line, x) {
    if (panel.key === 'tint' && x < minimumTint(line.settings)) return null;
    return observingTime({...line.settings, [panel.key]: x});
}

function sampleValues(panel, lines, [min, max], log) {
    const geometric = (log || panel.key === 'tint') && min > 0;
    const xs = Array.from({length: sampleCount}, (_, i) => {
        const f = i / (sampleCount - 1);
        return geometric ? min * (max / min) ** f : min + (max - min) * f;
    });
    if (panel.key === 'tint') xs.push(...lines.map(line => minimumTint(line.settings)).filter(x => x > min && x < max));
    return xs.sort((a, b) => a - b);
}

function makePanel(parent, panel, state) {
    const element = add(parent, 'div', 'plot-panel');
    const head = add(element, 'div', 'panel-head');
    add(head, 'span', 'range-label', 'Range');
    const minInput = add(head, 'input', 'range-input');
    add(head, 'span', 'range-label', 'to');
    const maxInput = add(head, 'input', 'range-input');
    for (const [input, end] of [[minInput, 'minimum'], [maxInput, 'maximum']]) {
        Object.assign(input, {type: 'number', step: 'any', min: '0'});
        input.setAttribute('aria-label', `${panel.name} axis ${end}`);
    }
    const toggle = add(head, 'label', 'log-toggle');
    const logInput = add(toggle, 'input', '');
    Object.assign(logInput, {type: 'checkbox', checked: true});
    toggle.append('Log scale');
    const chart = add(element, 'div', 'panel-chart');
    const readout = add(element, 'div', 'panel-readout');
    const view = {plot: null, hover: null, lines: [], rows: [], dots: []};

    function resolveDomain() {
        const auto = panel.range(state.settings, logInput.checked);
        [minInput.placeholder, maxInput.placeholder] = auto.map(value => String(Number(value.toPrecision(3))));
        const typed = [minInput, maxInput].map((input, i) => input.value.trim() === '' ? auto[i] : Number(input.value));
        const [min, max] = typed;
        const valid = Number.isFinite(min) && Number.isFinite(max) && min >= 0 && min < max && (!logInput.checked || min > 0);
        for (const input of [minInput, maxInput]) input.setAttribute('aria-invalid', String(!valid && input.value.trim() !== ''));
        return valid ? typed : auto;
    }

    function drawCurrent(plot) {
        const x = state.settings[panel.key];
        if (x < plot.scales.x.min || x > plot.scales.x.max) return;
        const {ctx, bbox} = plot;
        const left = plot.valToPos(x, 'x', true);
        ctx.save();
        ctx.strokeStyle = markerColor;
        ctx.lineWidth = 1.5 * ctx.canvas.width / plot.width;
        ctx.beginPath();
        ctx.moveTo(left, bbox.top);
        ctx.lineTo(left, bbox.top + bbox.height);
        ctx.stroke();
        ctx.restore();
        const time = timeAt(panel, view.lines[0], x);
        if (time) drawDot(plot, x, time.efficiency);
    }

    function buildReadout() {
        readout.replaceChildren();
        const head = add(readout, 'div', 'readout-row readout-head');
        add(head, 'span', '');
        add(head, 'span', 'readout-num', 'Efficiency');
        view.rows = view.lines.map(line => {
            const row = add(readout, 'div', 'readout-row' + (line.primary ? ' is-primary' : ''));
            const name = add(row, 'span', 'readout-line', line.label);
            const swatch = document.createElement('i');
            swatch.className = 'line-swatch';
            swatch.style.background = swatchBackground(line.color, line.dash);
            name.prepend(swatch);
            return add(row, 'span', 'readout-num');
        });
    }

    function placeTag(tag, x) {
        tag.hidden = x < view.domain[0] || x > view.domain[1];
        if (tag.hidden) return;
        tag.textContent = panel.format(x);
        const half = tag.offsetWidth / 2;
        const width = view.plot.bbox.width / devicePixelRatio;
        tag.style.left = Math.min(width - half, Math.max(half, view.plot.valToPos(x, 'x'))) + 'px';
    }

    function show() {
        const inspecting = view.hover != null;
        const x = inspecting ? view.hover : state.settings[panel.key];
        view.cursor.hidden = view.cursorTag.hidden = !inspecting;
        view.currentTag.hidden = inspecting;
        if (inspecting) view.cursor.style.left = view.plot.valToPos(x, 'x') + 'px';
        placeTag(inspecting ? view.cursorTag : view.currentTag, x);
        view.lines.forEach((line, i) => {
            const time = timeAt(panel, line, x);
            view.rows[i].textContent = time ? time.efficiency.toFixed(1) + '%' : '—';
            view.dots[i].hidden = !inspecting || !time;
            if (!view.dots[i].hidden) view.dots[i].style.top = view.plot.valToPos(time.efficiency, 'y') + 'px';
        });
    }

    function inspect(event) {
        let x = view.plot.posToVal(event.clientX - view.plot.over.getBoundingClientRect().left, 'x');
        let [min, max] = view.domain;
        if (panel.integer) [x, min, max] = [Math.round(x), Math.ceil(min), Math.floor(max)];
        view.hover = Math.min(max, Math.max(min, x));
        show();
    }

    function build() {
        view.plot?.destroy();
        view.lines = lineSet(state.settings);
        view.domain = resolveDomain();
        view.hover = null;
        const log = logInput.checked;
        const xs = sampleValues(panel, view.lines, view.domain, log);
        const drawn = [...view.lines].reverse();
        const grid = {stroke: '#aaa', width: 0.5};
        const xAxis = {...axisStyle, grid, label: panel.label, labelSize: 18, size: 22, space: 40};
        if (log) Object.assign(xAxis, logAxis, {splits: (plot, i, min, max) => logSplits(min, max, plot.width)});
        else if (panel.integer) xAxis.incrs = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000];
        view.plot = new uPlot({
            width: chart.clientWidth, height: 220, padding: [8, 14, 0, 0],
            scales: {x: {time: false, distr: log ? 3 : 1, range: () => view.domain}, y: {range: [0, 100]}},
            axes: [xAxis, {...axisStyle, grid, label: 'Efficiency [%]', size: 34, labelSize: 16, splits: () => [0, 25, 50, 75, 100]}],
            series: [{}, ...drawn.map(line => ({
                stroke: line.color, width: line.primary ? 2.5 : 1.75, dash: line.dash, pxAlign: 0, points: {show: false},
                fill: line.primary ? line.color + '14' : undefined
            }))],
            cursor: {show: false}, legend: {show: false}, select: {show: false},
            hooks: {draw: [drawCurrent, plot => plot === view.plot && show()]}
        }, [xs, ...drawn.map(line => xs.map(x => timeAt(panel, line, x)?.efficiency ?? null))], chart);

        view.cursor = add(view.plot.over, 'div', 'plot-cursor');
        view.dots = view.lines.map(line => {
            const dot = add(view.cursor, 'i', 'plot-dot');
            dot.style.borderColor = line.color;
            return dot;
        });
        view.currentTag = add(view.plot.over, 'span', 'plot-tag is-current');
        view.cursorTag = add(view.plot.over, 'span', 'plot-tag');
        onPointer(view.plot, inspect, () => {
            view.hover = null;
            show();
        });
        buildReadout();
        show();
    }

    for (const input of [logInput, minInput, maxInput]) input.addEventListener('input', build);

    return {
        build,
        resize() {
            if (!view.plot || chart.clientWidth === view.plot.width) return;
            view.plot.setSize({width: chart.clientWidth, height: view.plot.height});
            show();
        }
    };
}

export function createPanels(container) {
    const state = {settings: null};
    const views = panels.map(panel => makePanel(container, panel, state));
    new ResizeObserver(() => views.forEach(view => view.resize())).observe(container);
    return {
        update(settings) {
            state.settings = settings;
            views.forEach(view => view.build());
        }
    };
}
