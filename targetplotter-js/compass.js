// Compass rose beside the readout azimuth. Its needle points to the inspected target azimuth.
const svgNamespace = 'http://www.w3.org/2000/svg';
const cardinals = [['N', 0, -42], ['E', 42, 0], ['S', 0, 42], ['W', -42, 0]];

function add(parent, tag, attributes, text = '') {
    const element = document.createElementNS(svgNamespace, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    element.textContent = text;
    parent.append(element);
    return element;
}

export function createCompass(next) {
    const compass = document.createElementNS(svgNamespace, 'svg');
    compass.setAttribute('class', 'plot-compass');
    compass.setAttribute('viewBox', '-50 -50 100 100');
    compass.setAttribute('aria-hidden', 'true');
    add(compass, 'circle', {class: 'plot-compass-ring', r: 32});
    for (let angle = 0; angle < 360; angle += 45) add(compass, 'line', {class: 'plot-compass-tick', y1: -32, y2: angle % 90 ? -28 : -25, transform: `rotate(${angle})`});
    for (const [letter, x, y] of cardinals) add(compass, 'text', {class: 'plot-compass-letter', x, y}, letter);
    const needle = add(compass, 'g', {class: 'plot-compass-needle'});
    add(needle, 'line', {y2: -28});
    add(needle, 'circle', {cy: -28, r: 3.5});
    add(compass, 'circle', {class: 'plot-compass-hub', r: 2.5});
    next.before(compass);

    function show(row) {
        needle.style.display = row ? '' : 'none';
        if (row) needle.setAttribute('transform', `rotate(${row.az})`);
    }
    show(null);
    return {show};
}
