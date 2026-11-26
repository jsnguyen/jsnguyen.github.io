// Compass rose section below the readout. Its needle points to the inspected target azimuth.
const svgNamespace = 'http://www.w3.org/2000/svg';
const cardinals = [['N', 0, -43], ['E', 43, 0], ['S', 0, 43], ['W', -43, 0]];

function addSvg(parent, tag, attributes, text = '') {
    const element = document.createElementNS(svgNamespace, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    element.textContent = text;
    parent.append(element);
    return element;
}

export function createCompass(parent) {
    const section = document.createElement('div');
    section.className = 'plot-compass-section';
    const heading = document.createElement('h2');
    heading.className = 'details-heading';
    heading.textContent = 'Target azimuth';
    const compass = document.createElementNS(svgNamespace, 'svg');
    compass.setAttribute('class', 'plot-compass');
    compass.setAttribute('viewBox', '-50 -50 100 100');
    compass.setAttribute('aria-hidden', 'true');
    addSvg(compass, 'circle', {class: 'plot-compass-ring', r: 35});
    for (let angle = 0; angle < 360; angle += 10) {
        const length = angle % 90 === 0 ? 7 : angle % 30 === 0 ? 4.5 : 2.5;
        addSvg(compass, 'line', {class: 'plot-compass-tick', y1: -35, y2: -35 + length, transform: `rotate(${angle})`});
    }
    for (const [letter, x, y] of cardinals) addSvg(compass, 'text', {class: 'plot-compass-letter', x, y}, letter);
    const needle = addSvg(compass, 'g', {class: 'plot-compass-needle'});
    addSvg(needle, 'line', {y2: -29});
    addSvg(needle, 'circle', {cy: -29, r: 2.6});
    addSvg(compass, 'circle', {class: 'plot-compass-hub', r: 2});
    const angle = document.createElement('span');
    angle.className = 'plot-compass-angle';
    section.append(heading, compass, angle);
    parent.append(section);

    function show(row) {
        needle.style.display = row ? '' : 'none';
        if (row) needle.setAttribute('transform', `rotate(${row.az})`);
        angle.textContent = row ? row.az.toFixed(1) + '°' : '—';
    }
    show(null);
    return {
        show,
        destroy() {
            section.remove();
        }
    };
}
