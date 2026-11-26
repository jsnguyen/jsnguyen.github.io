// Cartoon telescope beside the position dials. Its tube follows the inspected altitude
// and faces east (right) or west (left) as seen from the south.
const svgNamespace = 'http://www.w3.org/2000/svg';
const pivot = [0, 2];

function addSvg(parent, tag, attributes) {
    const element = document.createElementNS(svgNamespace, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    parent.append(element);
    return element;
}

export function createTelescope(parent) {
    const figure = document.createElement('figure');
    figure.className = 'plot-dial plot-telescope';
    const svg = addSvg(figure, 'svg', {viewBox: '-50 -50 100 100', 'aria-hidden': 'true'});
    addSvg(svg, 'line', {class: 'plot-telescope-ground', x1: -42, y1: 42, x2: 42, y2: 42});
    addSvg(svg, 'path', {class: 'plot-telescope-mount', d: 'M -16 42 L -7 18 L 7 18 L 16 42 Z'});
    addSvg(svg, 'path', {class: 'plot-telescope-mount', d: 'M -10 18 V 14 H -3 V 2 H 3 V 14 H 10 V 18 Z'});
    const tube = addSvg(svg, 'g', {class: 'plot-telescope-tube'});
    addSvg(tube, 'rect', {x: -16, y: -6, width: 44, height: 12, rx: 2});
    addSvg(tube, 'rect', {x: -6, y: -11.5, width: 16, height: 4, rx: 1.5});
    addSvg(tube, 'rect', {class: 'plot-telescope-aperture', x: 27, y: -8, width: 7, height: 16, rx: 1.5});
    addSvg(svg, 'circle', {class: 'plot-telescope-pivot', cx: pivot[0], cy: pivot[1], r: 2.5});
    parent.append(figure);

    return row => {
        const altitude = row ? Math.max(row.alt, 0) : 0;
        const side = row && row.az > 180 ? -1 : 1;
        tube.setAttribute('transform', `translate(${pivot[0]} ${pivot[1]}) scale(${side} 1) rotate(${-altitude})`);
    };
}
