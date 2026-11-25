import {minimumTint, efficiencyMap, formatSeconds} from './efficiency.js';
import {add, axisStyle, logAxis, logSplits, drawDot, onPointer} from './plots.js';

const bandColors = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#1c5cab', '#104281'];
const bandRGB = bandColors.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));

export function createContour(container) {
    const chart = add(container, 'div', 'contour-chart');
    const legend = add(container, 'div', 'contour-legend');
    add(legend, 'span', '', 'Efficiency [%]');
    const bar = add(legend, 'div', 'contour-bar');
    bandColors.forEach((color, i) => add(bar, 'span', 'contour-band', String(10 * i)).style.setProperty('--band', color));
    add(bar, 'span', 'contour-band-end', '100');
    const view = {settings: null, plot: null, hover: null, domain: null};

    // Paint each device pixel by its 10% efficiency band, darkening pixels on a band edge to draw contours.
    function drawMap(plot) {
        const {ctx, bbox} = plot;
        const width = Math.round(bbox.width);
        const height = Math.round(bbox.height);
        if (width <= 0 || height <= 0) return;
        const scale = ctx.canvas.width / plot.width;
        const efficiency = efficiencyMap(view.settings);
        const tints = Array.from({length: width}, (_, i) => plot.posToVal((i + 0.5) / scale, 'x'));
        const bands = new Uint8Array(width * height);
        for (let j = 0; j < height; j++) {
            const coadds = plot.posToVal((j + 0.5) / scale, 'y');
            for (let i = 0; i < width; i++) bands[j * width + i] = Math.min(9, Math.floor(efficiency(tints[i], coadds) / 10));
        }
        const image = ctx.createImageData(width, height);
        for (let j = 0, k = 0; j < height; j++) {
            for (let i = 0; i < width; i++, k++) {
                const band = bands[k];
                const edge = (i > 0 && bands[k - 1] !== band) || (i + 1 < width && bands[k + 1] !== band)
                    || (j > 0 && bands[k - width] !== band) || (j + 1 < height && bands[k + width] !== band);
                const shade = edge ? 0.72 : 1;
                const [r, g, b] = bandRGB[band];
                image.data[4 * k] = r * shade;
                image.data[4 * k + 1] = g * shade;
                image.data[4 * k + 2] = b * shade;
                image.data[4 * k + 3] = 255;
            }
        }
        ctx.putImageData(image, Math.round(bbox.left), Math.round(bbox.top));
    }

    function drawCurrent(plot) {
        const {tint, coadds} = view.settings;
        const [x, y] = [plot.scales.x, plot.scales.y];
        if (tint >= x.min && tint <= x.max && coadds >= y.min && coadds <= y.max) drawDot(plot, tint, coadds);
    }

    function show() {
        view.cursor.hidden = view.hover == null;
        if (view.cursor.hidden) return;
        const {tint, coadds} = view.hover;
        const left = view.plot.valToPos(tint, 'x');
        view.cursor.style.left = left + 'px';
        view.cursor.style.top = view.plot.valToPos(coadds, 'y') + 'px';
        view.tag.classList.toggle('is-left', left > view.plot.over.clientWidth / 2);
        view.tag.textContent = `${formatSeconds(tint)}\n${coadds} coadds\n${efficiencyMap(view.settings)(tint, coadds).toFixed(1)}%`;
    }

    function inspect(event) {
        const box = view.plot.over.getBoundingClientRect();
        const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));
        view.hover = {
            tint: clamp(view.plot.posToVal(event.clientX - box.left, 'x'), view.domain.x),
            coadds: clamp(Math.round(view.plot.posToVal(event.clientY - box.top, 'y')), view.domain.y)
        };
        show();
    }

    function build() {
        view.plot?.destroy();
        view.hover = null;
        const axis = {...axisStyle, ...logAxis, grid: {stroke: 'rgba(255, 255, 255, 0.35)', width: 0.5}};
        view.plot = new uPlot({
            width: chart.clientWidth, height: 260, padding: [8, 14, 0, 0],
            scales: {x: {time: false, distr: 3, range: () => view.domain.x}, y: {distr: 3, range: () => view.domain.y}},
            axes: [
                {...axis, label: 'Tint [s]', labelSize: 18, size: 22, space: 40, splits: (plot, i, min, max) => logSplits(min, max, plot.width)},
                {...axis, label: 'Coadds', labelSize: 16, size: 34, splits: (plot, i, min, max) => logSplits(min, max, plot.height)}
            ],
            series: [{}, {paths: () => null, points: {show: false}}],
            cursor: {show: false}, legend: {show: false}, select: {show: false},
            hooks: {drawClear: [drawMap], draw: [drawCurrent, plot => plot === view.plot && show()]}
        }, [view.domain.x, [null, null]], chart);
        view.cursor = add(view.plot.over, 'div', 'plot-dot contour-cursor');
        view.tag = add(view.cursor, 'span', 'plot-tag contour-tag');
        onPointer(view.plot, inspect, () => {
            view.hover = null;
            show();
        });
        show();
    }

    new ResizeObserver(() => {
        if (view.plot && chart.clientWidth !== view.plot.width) view.plot.setSize({width: chart.clientWidth, height: view.plot.height});
    }).observe(chart);

    return {
        update(settings) {
            view.settings = settings;
            view.domain = {x: [minimumTint(settings), Math.max(100, settings.tint)], y: [1, Math.max(200, settings.coadds)]};
            build();
        }
    };
}
