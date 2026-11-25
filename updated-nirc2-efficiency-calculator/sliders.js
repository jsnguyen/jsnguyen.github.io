import {minimumTint} from './efficiency.js';

const tintStep = 0.1;

function roundUp(value, digits) {
    const scale = 10 ** (digits - 1 - Math.floor(Math.log10(value)));
    return Math.ceil(value * scale) / scale;
}

// The first stop is the minimum tint, then even 0.1 s steps up to the maximum.
function tintStops(min, max) {
    const stops = [roundUp(min, 4)];
    for (let step = Math.floor(min / tintStep) + 1; step * tintStep <= max + 1e-9; step++) stops.push(Number((step * tintStep).toFixed(1)));
    return stops;
}

function nearestIndex(stops, value) {
    let best = 0;
    stops.forEach((stop, i) => {
        if (Math.abs(stop - value) < Math.abs(stops[best] - value)) best = i;
    });
    return best;
}

export function createSnapSliders(sliders, onChoose) {
    const stops = {tint: [], coadds: []};
    for (const [key, slider] of Object.entries(sliders)) {
        slider.addEventListener('input', () => onChoose(key, stops[key][Number(slider.value)]));
    }
    return {
        update(settings) {
            stops.tint = tintStops(minimumTint(settings), Math.max(100, settings.tint));
            stops.coadds = Array.from({length: Math.max(200, settings.coadds)}, (_, i) => i + 1);
            for (const [key, slider] of Object.entries(sliders)) {
                slider.max = String(stops[key].length - 1);
                slider.value = String(nearestIndex(stops[key], settings[key]));
            }
        }
    };
}
