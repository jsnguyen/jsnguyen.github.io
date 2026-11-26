// Target plot without a target: the night's sky, time axis, legend and blank readouts.
import {formatClock} from './time.js';
import {createTimeAxis} from './axis.js';
import {addFact} from './summary.js';
import {createIntervalSelection} from './interval.js';
import {createCurrentTimeMarker} from './current-time.js';
import {panels, visibilityColors, skyColors, backgroundBands, makePanel} from './plot.js';
import {createCompass} from './compass.js';

const summaryLabels = ['Time visible', 'Min Moon sep.', 'Sunset', 'Sunrise', 'Transit', 'Transit LST', 'Rise', 'Set'];
const blankAxis = {splits: () => [], labels: () => [], uses12Hour: () => false, caption: () => ' '};

function add(parent, tag, className, text = '') {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
}

// Without a night (invalid site or date, polar day or night) the panels have no times or sky.
export function renderEmptyPlot(container, night, isKeck, settings, nowToggle) {
    const samples = (night?.samples || [{time: 0}, {time: 1}]).map(({time, lstHours, sunAlt}) => ({time, lstHours, sunAlt, az: null, alt: null, rate: null}));
    const times = samples.map(row => row.time);
    const bands = night ? backgroundBands(samples) : [];
    const timeAxis = night ? createTimeAxis(samples, () => settings.axisMode, () => settings.zone, () => settings.showDates, () => settings.use12Hour) : blankAxis;

    const figure = add(container.querySelector('#plot-surface'), 'figure', 'plot-figure');
    const keys = add(figure, 'div', 'plot-keys');
    const labels = [['Not visible', visibilityColors[0]], ['Vignetted', visibilityColors[1]], ['Visible', visibilityColors[2]], ['Twilight', skyColors[0]], ['Night', skyColors[1]]];
    for (const [label, color] of labels) {
        if (label === 'Vignetted' && !isKeck) continue;
        const key = add(keys, 'span', 'plot-key');
        add(key, 'i', 'plot-swatch').style.backgroundColor = color;
        add(key, 'span', 'plot-text', label);
    }
    const charts = add(figure, 'div', 'plot-panels');
    const plots = panels.map(([field, label]) => makePanel(charts, samples, times, field, label, bands, timeAxis));
    plots.forEach(plot => plot.over.style.pointerEvents = 'none');
    add(figure, 'div', 'plot-axis-caption', timeAxis.caption());
    const currentTime = night ? createCurrentTimeMarker(plots, times, nowToggle, () => {}) : null;

    const details = container.querySelector('#plot-details');
    const readout = add(details, 'output', 'plot-readout');
    const timeLabel = 'Time (' + formatClock(night ? times[0] : Date.now() / 1000, settings.zone).zone + ')';
    const groups = [['clocks', [['date', 'Date'], ['time', timeLabel], ['lst', 'LST']]], ['coordinates', [['angle', 'Az'], ['angle', 'Alt'], ['rate', 'Field rotation'], ['moon', 'Moon sep.']]]];
    for (const [name, fields] of groups) {
        const group = add(readout, 'span', 'plot-readout-group plot-readout-' + name);
        for (const [key, label] of fields) {
            const field = add(group, 'span', 'plot-readout-cell plot-readout-' + key);
            add(add(field, 'span', 'plot-readout-label'), 'span', '', label);
            add(field, 'span', 'plot-readout-value', '—');
        }
    }
    const compass = createCompass(details);
    readout.querySelector('.plot-readout-date').hidden = !settings.showDates;
    readout.querySelector('.plot-readout-clocks').style.setProperty('--clock-width', Math.max(timeLabel.length, settings.use12Hour ? 11 : 8) + 'ch');

    const footer = add(details, 'div', 'plot-summary');
    add(footer, 'h2', 'details-heading', 'Observing summary');
    const facts = add(footer, 'div', 'plot-facts');
    for (const label of summaryLabels) addFact(facts, label).textContent = '—';
    const interval = createIntervalSelection(plots, [], details, () => '—');

    const observer = new ResizeObserver(() => {
        const width = charts.clientWidth;
        if (width && width !== plots[0].width) plots.forEach(plot => plot.setSize({width, height: plot.height}));
    });
    observer.observe(charts);
    return {
        destroy() {
            observer.disconnect();
            currentTime?.destroy();
            interval.destroy();
            compass.destroy();
            plots.forEach(plot => plot.destroy());
            figure.remove();
            readout.remove();
            footer.remove();
        }
    };
}
