import {formatClock, formatClockTime, formatEventTime, formatLST} from './time.js';
import {createTimeAxis} from './axis.js';
import {createObservingSummary} from './summary.js';
import {createIntervalSelection} from './interval.js';
import {createCurrentTimeMarker} from './current-time.js';

const visibilityColors = ['#d64242', '#d69f18', '#27a963'];
const skyColors = ['#e6f2fc', '#c9c9c9'];
const panels = [['az', 'Azimuth [°]'], ['alt', 'Altitude [°]'], ['rate', 'Field rotation [°/min]']];
const rotationFormat = new Intl.NumberFormat('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero', useGrouping: false});

function add(parent, tag, className, text = '') {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
}

function backgroundBands(samples) {
    const bands = [];
    let start = samples[0].time;
    let previous = null;
    for (let i = 0; i < samples.length; i++) {
        const {time, sunAlt} = samples[i];
        const shade = Number(sunAlt < -12);
        if (i && shade !== previous) {
            const boundary = (samples[i - 1].time + time) / 2;
            bands.push([start, boundary, previous]);
            start = boundary;
        }
        previous = shade;
    }
    bands.push([start, samples.at(-1).time, previous]);
    return bands;
}

function drawSky(plot, bands) {
    const {ctx, bbox} = plot;
    ctx.save();
    for (const [start, end, shade] of bands) {
        const x = plot.valToPos(start, 'x', true);
        ctx.fillStyle = skyColors[shade];
        ctx.fillRect(x, bbox.top, plot.valToPos(end, 'x', true) - x, bbox.height);
    }
    ctx.restore();
}

function panelValue(row, field) {
    return field === 'rate' && row.rate != null ? row.rate * 60 : row[field];
}

function drawTrack(plot, samples, field) {
    const {ctx, bbox} = plot;
    const values = plot.data[1];
    ctx.save();
    ctx.beginPath();
    ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
    ctx.clip();
    ctx.lineWidth = 2.5 * ctx.canvas.width / plot.width;
    ctx.lineJoin = 'round';
    let color = null;
    let connected = false;
    for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1];
        const next = samples[i];
        if (values[i - 1] == null || values[i] == null || (field === 'az' && Math.abs(next.az - prev.az) > 180)) {
            connected = false;
            continue;
        }
        if (prev.visibility !== color) {
            if (color !== null) ctx.stroke();
            ctx.beginPath();
            color = prev.visibility;
            ctx.strokeStyle = visibilityColors[color];
            connected = false;
        }
        if (!connected) ctx.moveTo(plot.valToPos(prev.time, 'x', true), plot.valToPos(values[i - 1], 'y', true));
        ctx.lineTo(plot.valToPos(next.time, 'x', true), plot.valToPos(values[i], 'y', true));
        connected = true;
    }
    if (color !== null) ctx.stroke();
    ctx.restore();
}

function ticksBetween(min, max, step) {
    const ticks = [];
    for (let i = Math.ceil(min / step); i <= Math.floor(max / step); i++) ticks.push(i * step);
    return ticks;
}

function makePanel(parent, samples, times, field, label, bands, timeAxis) {
    const values = samples.map(row => panelValue(row, field));
    const isBottom = field === 'rate';
    let range = field === 'az' ? [0, 360] : [0, 90];
    if (isBottom) {
        const min = values.reduce((a, b) => b === null ? a : Math.min(a, b), 0);
        const max = values.reduce((a, b) => b === null ? a : Math.max(a, b), 0);
        range = max - min < 0.1 ? [-0.1, 0.1] : uPlot.rangeNum(min, max, 0.05, false);
    }
    const grid = {stroke: '#aaa', width: 0.5};
    const rightPadding = 17;
    const axis = {grid, stroke: '#222', font: '11px Arial', labelFont: '12px Arial', ticks: {size: 3, stroke: '#777'}};
    const xAxis = {...axis, splits: (plot, axis, min, max) => timeAxis.splits(min, max, plot.width), size: isBottom ? 20 : 0};
    xAxis.values = (plot, ticks) => {
        if (!isBottom) return ticks.map(() => '');
        const labels = timeAxis.labels(ticks, plot.width);
        if (labels.length && timeAxis.uses12Hour()) {
            // A centered AM/PM label can extend beyond sunrise at the right edge.
            const room = rightPadding + plot.valToPos(times.at(-1), 'x') - plot.valToPos(ticks.at(-1), 'x');
            plot.ctx.save();
            plot.ctx.font = axis.font;
            if (plot.ctx.measureText(labels.at(-1)).width / 2 > room) labels[labels.length - 1] = '';
            plot.ctx.restore();
        }
        return labels;
    };
    const yAxis = {...axis, label, size: 44, labelSize: 16, space: 30};
    if (field === 'az') yAxis.splits = () => [0, 90, 180, 270, 360];
    if (field === 'alt') yAxis.splits = () => [0, 30, 60, 90];
    if (isBottom) {
        yAxis.splits = (plot, axis, min, max, step) => ticksBetween(min, max, Math.max(0.1, step));
        yAxis.values = (plot, ticks) => ticks.map(value => value.toFixed(1));
    }

    return new uPlot({
        width: parent.clientWidth, height: isBottom ? 162 : 128, padding: [10, rightPadding, 6, 0],
        scales: {x: {time: false, range: [times[0], times.at(-1)]}, y: {range}},
        axes: [xAxis, yAxis], series: [{}, {paths: () => null, points: {show: false}}],
        cursor: {show: false}, legend: {show: false}, select: {show: false},
        hooks: {drawClear: [plot => drawSky(plot, bands)], draw: [plot => drawTrack(plot, samples, field)]}
    }, [times, values], parent);
}

// The cursor and sample readout are DOM elements outside the chart canvases.
function saveFigure(figure, filename, summary, measuredFacts) {
    const bounds = figure.getBoundingClientRect();
    const sections = [summary, measuredFacts].filter(Boolean).map(element => ({element, rect: element.getBoundingClientRect()}));
    const width = Math.max(bounds.width, ...sections.map(section => section.rect.width));
    const height = sections.reduce((total, section) => total + section.rect.height + 12, bounds.height);
    const canvas = document.createElement('canvas');
    const scale = Math.max(1, window.devicePixelRatio);
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate((width - bounds.width) / 2, 0);

    for (const item of figure.querySelectorAll('canvas, .plot-swatch')) {
        const rect = item.getBoundingClientRect();
        const x = rect.left - bounds.left;
        const y = rect.top - bounds.top;
        if (item.tagName === 'CANVAS') ctx.drawImage(item, x, y, rect.width, rect.height);
        else {
            ctx.fillStyle = item.style.backgroundColor;
            ctx.fillRect(x, y, rect.width, rect.height);
        }
    }
    for (const band of figure.querySelectorAll('.plot-interval-band.is-complete')) {
        const rect = band.getBoundingClientRect();
        const x = rect.left - bounds.left;
        const y = rect.top - bounds.top;
        const style = getComputedStyle(band);
        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(x, y, rect.width, rect.height);
        ctx.fillStyle = style.borderLeftColor;
        ctx.fillRect(x, y, 1, rect.height);
        ctx.fillRect(x + Math.max(0, rect.width - 1), y, 1, rect.height);
    }
    for (const marker of figure.querySelectorAll('.plot-now-marker:not([hidden])')) {
        const rect = marker.getBoundingClientRect();
        ctx.fillStyle = getComputedStyle(marker).color;
        ctx.fillRect(rect.left + rect.width / 2 - bounds.left, rect.top - bounds.top, 1, rect.height);
        const label = marker.firstElementChild;
        if (label) {
            const box = label.getBoundingClientRect();
            const x = box.left - bounds.left;
            const y = box.top - bounds.top;
            ctx.fillRect(x, y, box.width, box.height);
            ctx.fillStyle = 'white';
            ctx.fillRect(x + 1, y + 1, box.width - 2, box.height - 2);
            ctx.fillStyle = getComputedStyle(marker).color;
            ctx.font = getComputedStyle(label).font;
            ctx.textBaseline = 'middle';
            ctx.fillText(label.textContent, x + 4, y + box.height / 2);
        }
    }
    // Use the displayed word positions so that wrapped titles and legends export at any width.
    const range = document.createRange();
    ctx.textBaseline = 'middle';
    function drawText(block, originX, originY) {
        for (const item of block.querySelectorAll('.plot-text')) {
            if (!item.getClientRects().length) continue;
            const style = getComputedStyle(item);
            ctx.fillStyle = block === figure ? style.color : '#222';
            ctx.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
            for (const match of item.textContent.matchAll(/\S+/g)) {
                range.setStart(item.firstChild, match.index);
                range.setEnd(item.firstChild, match.index + match[0].length);
                const rect = range.getBoundingClientRect();
                ctx.fillText(match[0], rect.left - originX, rect.top - originY + rect.height / 2);
            }
        }
    }
    drawText(figure, bounds.left, bounds.top);
    ctx.restore();
    ctx.textBaseline = 'middle';
    let top = bounds.height;
    for (const {element, rect} of sections) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(0, top, width, 1);
        drawText(element, rect.left - (width - rect.width) / 2, rect.top - top - 6);
        top += rect.height + 12;
    }
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

export function renderPlot(container, night, title, dateISO, zone, nowToggle, options = {axisMode: 'local', showDates: false, use12Hour: false}) {
    const samples = night.samples;
    const times = samples.map(row => row.time);
    const bands = backgroundBands(samples);
    const details = container.querySelector('#plot-details');
    const figure = add(container.querySelector('#plot-surface'), 'figure', 'plot-figure');
    const titleText = title + ' visibility on ' + dateISO + ' UTC';
    const caption = add(figure, 'figcaption', 'plot-title plot-text', titleText);
    const keys = add(figure, 'div', 'plot-keys');
    const labels = [['Not visible', visibilityColors[0]], ['Vignetted', visibilityColors[1]], ['Visible', visibilityColors[2]], ['Twilight', skyColors[0]], ['Night', skyColors[1]]];
    for (const [label, color] of labels) {
        if (label === 'Vignetted' && !night.isKeck) continue;
        const key = add(keys, 'span', 'plot-key');
        add(key, 'i', 'plot-swatch').style.backgroundColor = color;
        add(key, 'span', 'plot-text', label);
    }

    const charts = add(figure, 'div', 'plot-panels');
    const timeAxis = createTimeAxis(samples, () => options.axisMode, () => zone, () => options.showDates, () => options.use12Hour);
    const plots = panels.map(([field, label]) => makePanel(charts, samples, times, field, label, bands, timeAxis));
    const axisCaption = add(figure, 'div', 'plot-axis-caption plot-text', timeAxis.caption());

    const readout = add(details, 'output', 'plot-readout');
    readout.setAttribute('aria-label', 'Coordinates at the selected time');
    const clockGroup = add(readout, 'span', 'plot-readout-group plot-readout-clocks');
    const coordinateGroup = add(readout, 'span', 'plot-readout-group plot-readout-coordinates');
    function addField(group, key, label) {
        const field = add(group, 'span', 'plot-readout-cell plot-readout-' + key);
        add(field, 'span', 'plot-readout-label', label);
        return add(field, 'span', 'plot-readout-value', '—');
    }
    const dateValue = addField(clockGroup, 'date', 'Date');
    dateValue.parentElement.hidden = !options.showDates;
    const clockValue = addField(clockGroup, 'time', 'Time');
    const clockLabel = clockValue.previousElementSibling;
    const clockHeading = document.createElement('span');
    clockLabel.replaceChildren(clockHeading);
    let initialClockZone;
    function updateClockZone() {
        const first = formatClock(times[0], zone);
        const last = formatClock(times.at(-1), zone);
        initialClockZone = first.zone;
        const longestZone = first.zone.length >= last.zone.length ? first.zone : last.zone;
        clockLabel.dataset.sizeLabel = 'Time (' + longestZone + ')';
        clockGroup.style.setProperty('--clock-width', Math.max(clockLabel.dataset.sizeLabel.length, options.use12Hour ? 11 : 8) + 'ch');
    }
    updateClockZone();
    const lstValue = addField(clockGroup, 'lst', 'LST');
    const azValue = addField(coordinateGroup, 'angle', 'Az');
    const altValue = addField(coordinateGroup, 'angle', 'Alt');
    const rateValue = addField(coordinateGroup, 'rate', 'Field rotation');
    const moonValue = addField(coordinateGroup, 'moon', 'Moon sep.');
    const footer = add(details, 'div', 'plot-summary');
    add(footer, 'h2', 'details-heading plot-text', 'Observing summary');
    const eventTime = time => formatEventTime(time, zone, options.showDates, options.use12Hour);
    const summary = createObservingSummary(footer, night, eventTime);
    const interval = createIntervalSelection(plots, samples, details, eventTime);
    moonValue.parentElement.title = 'Target–Moon separation and whether the Moon’s center is above the local horizon.';
    const cursors = plots.map(plot => add(plot.over, 'div', 'plot-cursor'));
    const dots = cursors.map(cursor => add(cursor, 'i', 'plot-dot'));
    let selected = null;

    function showRow(row, live = false) {
        const clock = row ? formatClock(row.time, zone) : null;
        clockHeading.textContent = (live ? 'Now' : 'Time') + ' (' + (clock?.zone || initialClockZone) + ')';
        for (let i = 0; i < plots.length; i++) {
            const cursor = cursors[i];
            cursor.hidden = !row;
            if (!row) continue;
            const plot = plots[i];
            const value = panelValue(row, panels[i][0]);
            cursor.style.left = plot.valToPos(row.time, 'x') + 'px';
            dots[i].hidden = value == null || value < plot.scales.y.min || value > plot.scales.y.max;
            if (!dots[i].hidden) dots[i].style.top = plot.valToPos(value, 'y') + 'px';
        }
        if (!row) {
            for (const cell of [dateValue, clockValue, lstValue, azValue, altValue, rateValue, moonValue]) cell.textContent = '—';
            return;
        }
        dateValue.textContent = clock.date;
        clockValue.textContent = formatClockTime(clock.time, options.use12Hour);
        lstValue.textContent = formatLST(row.lstHours);
        azValue.textContent = row.az.toFixed(1) + '°';
        altValue.textContent = row.alt.toFixed(1) + '°';
        rateValue.textContent = row.rate == null ? '—' : rotationFormat.format(panelValue(row, 'rate')) + '°/min';
        moonValue.textContent = row.moonSep.toFixed(1) + '° (' + (row.moonAlt >= 0 ? 'up' : 'down') + ')';
    }

    function inspect(index) {
        selected = index;
        showRow(samples[index]);
    }

    inspect(null);
    const currentTime = createCurrentTimeMarker(plots, times, nowToggle, time => {
        selected = null;
        const row = time == null ? null : night.sampleAt(time);
        showRow(row, Boolean(row));
    });
    for (const plot of plots) {
        function inspectPointer(event) {
            if (event.target.closest('.plot-now-marker') && (event.type === 'pointerdown' || !event.buttons)) return;
            currentTime.unpin();
            const index = plot.posToIdx(event.clientX - plot.over.getBoundingClientRect().left);
            if (index !== selected) inspect(index);
        }
        plot.over.addEventListener('pointermove', inspectPointer);
        plot.over.addEventListener('pointerdown', inspectPointer);
        plot.over.addEventListener('pointerleave', event => {
            if (event.pointerType === 'mouse') {
                currentTime.unpin();
                inspect(null);
            }
        });
    }
    function refreshReadout() {
        if (!currentTime.isPinned()) inspect(selected);
        currentTime.refresh();
    }
    function refreshTimeDisplay() {
        axisCaption.textContent = timeAxis.caption();
        plots.forEach(plot => plot.redraw(false, true));
        summary.refresh();
        interval.refresh();
        refreshReadout();
    }
    const observer = new ResizeObserver(() => {
        const width = charts.clientWidth;
        if (!width || width === plots[0].width) return;
        plots.forEach(plot => plot.setSize({width, height: plot.height}));
        queueMicrotask(() => {
            refreshReadout();
            interval.refresh();
        });
    });
    observer.observe(charts);
    return {
        save(filename) {
            currentTime.refresh();
            saveFigure(figure, filename, footer, interval.completedFacts);
        },
        setAxisMode(mode) {
            options.axisMode = mode;
            axisCaption.textContent = timeAxis.caption();
            plots.forEach(plot => plot.redraw(false, true));
        },
        setTimeZone(newZone) {
            zone = newZone;
            updateClockZone();
            refreshTimeDisplay();
        },
        setShowDates(visible) {
            options.showDates = visible;
            dateValue.parentElement.hidden = !visible;
            refreshTimeDisplay();
        },
        setUse12Hour(enabled) {
            options.use12Hour = enabled;
            updateClockZone();
            refreshTimeDisplay();
        },
        setToday(isToday) {
            caption.textContent = titleText + (isToday ? ' (Today)' : '');
        },
        destroy() {
            observer.disconnect();
            currentTime.destroy();
            interval.destroy();
            plots.forEach(plot => plot.destroy());
            figure.remove();
            readout.remove();
            footer.remove();
        }
    };
}
