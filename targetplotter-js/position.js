// Target position section below the readout: a compass rose for azimuth and a quadrant for altitude.
// Arrows follow the inspected time. Shading marks where the target is visible tonight.
import {createTelescope} from './telescope.js';

const svgNamespace = 'http://www.w3.org/2000/svg';
const cardinals = [['N', 0, -43], ['E', 43, 0], ['S', 0, 43], ['W', -43, 0]];
const compassRadius = 35;
const altitudePivot = [-38, 37];
const altitudeRadius = 62;
const radians = Math.PI / 180;

function addSvg(parent, tag, attributes, text = '') {
    const element = document.createElementNS(svgNamespace, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    element.textContent = text;
    parent.append(element);
    return element;
}

function tickLength(angle) {
    return angle % 90 === 0 ? 7 : angle % 30 === 0 ? 4.5 : 2.5;
}

// Marks whole degrees swept between consecutive visible samples, the short way around for azimuth.
function visibleDegrees(samples, field, size, wrap) {
    const bins = new Uint8Array(size);
    for (let i = 1; i < samples.length; i++) {
        const previous = samples[i - 1];
        const next = samples[i];
        if (previous.visibility !== 2 || next.visibility !== 2) continue;
        let start = previous[field];
        let end = next[field];
        if (wrap && end - start > 180) start += 360;
        if (wrap && start - end > 180) end += 360;
        for (let degree = Math.floor(Math.min(start, end)); degree <= Math.floor(Math.max(start, end)); degree++) {
            bins[wrap ? degree % size : Math.min(degree, size - 1)] = 1;
        }
    }
    const ranges = [];
    let first = null;
    for (let i = 0; i <= size; i++) {
        if (bins[i] && first === null) first = i;
        if (!bins[i] && first !== null) {
            ranges.push([first, i]);
            first = null;
        }
    }
    return ranges;
}

function addDial(parent, label, description) {
    const figure = document.createElement('figure');
    figure.className = 'plot-dial';
    figure.title = description;
    const svg = document.createElementNS(svgNamespace, 'svg');
    svg.setAttribute('viewBox', '-50 -50 100 100');
    svg.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('figcaption');
    const name = document.createElement('span');
    name.className = 'plot-dial-name';
    name.textContent = label;
    const value = document.createElement('span');
    caption.append(name, ' ', value);
    figure.append(svg, caption);
    parent.append(figure);
    return {svg, value};
}

// Drawn along +x so that rotation sets its direction.
function addArrow(parent, length) {
    const arrow = addSvg(parent, 'g', {class: 'plot-dial-arrow'});
    addSvg(arrow, 'line', {x2: length - 6});
    addSvg(arrow, 'path', {d: `M ${length} 0 L ${length - 8} -4 L ${length - 8} 4 Z`});
    return arrow;
}

function addCompass(parent, samples) {
    const {svg, value} = addDial(parent, 'Az', 'Shaded azimuths are where the target is visible tonight.');
    const r = compassRadius;
    const point = azimuth => `${r * Math.sin(azimuth * radians)} ${-r * Math.cos(azimuth * radians)}`;
    for (const [start, end] of visibleDegrees(samples, 'az', 360, true)) {
        if (end - start === 360) addSvg(svg, 'circle', {class: 'plot-dial-visible', r});
        else addSvg(svg, 'path', {class: 'plot-dial-visible', d: `M 0 0 L ${point(start)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)} Z`});
    }
    addSvg(svg, 'circle', {class: 'plot-dial-ring', r});
    for (let angle = 0; angle < 360; angle += 10) addSvg(svg, 'line', {class: 'plot-dial-tick', x1: r, x2: r - tickLength(angle), transform: `rotate(${angle})`});
    for (const [letter, x, y] of cardinals) addSvg(svg, 'text', {class: 'plot-dial-label', x, y}, letter);
    const arrow = addArrow(svg, r - 4);
    addSvg(svg, 'circle', {class: 'plot-dial-hub', r: 2});
    return row => {
        arrow.style.display = row ? '' : 'none';
        if (row) arrow.setAttribute('transform', `rotate(${row.az - 90})`);
        value.textContent = row ? row.az.toFixed(1) + '°' : '—';
    };
}

function addAltitude(parent, samples) {
    const {svg, value} = addDial(parent, 'Alt', 'Shaded altitudes are where the target is visible tonight.');
    const [x, y] = altitudePivot;
    const r = altitudeRadius;
    const point = altitude => `${r * Math.cos(altitude * radians)} ${-r * Math.sin(altitude * radians)}`;
    const scale = addSvg(svg, 'g', {transform: `translate(${x} ${y})`});
    for (const [start, end] of visibleDegrees(samples, 'alt', 90, false)) {
        addSvg(scale, 'path', {class: 'plot-dial-visible', d: `M 0 0 L ${point(start)} A ${r} ${r} 0 0 0 ${point(end)} Z`});
    }
    addSvg(scale, 'path', {class: 'plot-dial-ring', d: `M 0 0 H ${r} A ${r} ${r} 0 0 0 0 ${-r} Z`});
    for (let angle = 0; angle <= 90; angle += 10) addSvg(scale, 'line', {class: 'plot-dial-tick', x1: r, x2: r - tickLength(angle), transform: `rotate(${-angle})`});
    for (let angle = 0; angle <= 90; angle += 30) {
        addSvg(scale, 'text', {class: 'plot-dial-label', x: (r + 9) * Math.cos(angle * radians), y: -(r + 9) * Math.sin(angle * radians)}, angle);
    }
    const arrow = addArrow(scale, r - 4);
    addSvg(scale, 'circle', {class: 'plot-dial-hub', r: 2});
    return row => {
        const aboveHorizon = row && row.alt >= 0;
        arrow.style.display = aboveHorizon ? '' : 'none';
        if (aboveHorizon) arrow.setAttribute('transform', `rotate(${-row.alt})`);
        value.textContent = row ? row.alt.toFixed(1) + '°' : '—';
    };
}

export function createPosition(parent, samples = []) {
    const section = document.createElement('div');
    section.className = 'plot-position';
    const heading = document.createElement('h2');
    heading.className = 'details-heading';
    heading.textContent = 'Target position';
    const diagrams = document.createElement('div');
    diagrams.className = 'plot-position-diagrams';
    section.append(heading, diagrams);
    parent.append(section);
    const updates = [addCompass(diagrams, samples), addAltitude(diagrams, samples), createTelescope(diagrams)];

    function show(row) {
        for (const update of updates) update(row);
    }
    show(null);
    return {
        show,
        destroy() {
            section.remove();
        }
    };
}
