import {formatClock, formatLST} from './time.js';

const steps = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 14400, 21600, 43200];

function multiples(min, max, step) {
    const result = [];
    for (let i = Math.ceil(min / step); i <= Math.floor(max / step); i++) result.push(i * step);
    return result;
}

function civilOffset(time, zone) {
    const whole = Math.floor(time);
    const clock = formatClock(whole, zone);
    return Date.parse(clock.date + 'T' + clock.time + 'Z') / 1000 - whole;
}

export function createTimeAxis(samples, getMode, getZone, getShowDates) {
    const first = samples[0];
    const last = samples.at(-1);
    const duration = last.time - first.time;
    const initialLST = first.lstHours * 3600;
    // Unwrap the endpoint against elapsed sidereal time, including nights longer than 24 sidereal hours.
    const change = last.lstHours * 3600 - initialLST;
    const siderealChange = change + 86400 * Math.round((duration * 1.0027379 - change) / 86400);
    const siderealRate = siderealChange / duration;
    const lst = time => initialLST + (time - first.time) * siderealRate;
    const zone = () => getMode() === 'utc' ? 'UTC' : getZone();

    function tickStep(width) {
        const count = Math.max(2, Math.min(9, Math.floor((width - 65) / 58)));
        return steps.find(step => duration / step <= count + 1) || steps.at(-1);
    }

    function splits(min, max, width) {
        const step = tickStep(width);
        if (getMode() === 'lst') {
            return multiples(lst(min), lst(max), step).map(seconds => first.time + (seconds - initialLST) / siderealRate);
        }
        const displayZone = zone();
        if (displayZone === 'UTC') return multiples(min, max, step);
        // Try both UTC offsets across a clock change, retaining each tick in its actual local zone.
        const offsets = new Set([civilOffset(min, displayZone), civilOffset(max, displayZone)]);
        const ticks = [];
        for (const offset of offsets) {
            for (const wallTime of multiples(min + offset, max + offset, step)) {
                const time = wallTime - offset;
                if (offsets.size === 1 || civilOffset(time, displayZone) === offset) ticks.push(time);
            }
        }
        return ticks.sort((a, b) => a - b);
    }

    function labels(ticks, width) {
        const step = tickStep(width);
        const sidereal = getMode() === 'lst';
        const displayZone = zone();
        const labels = ticks.map(time => {
            const seconds = sidereal ? lst(time) : time;
            const rounded = Math.round(seconds * 10);
            const whole = step < 1 ? Math.floor(rounded / 10) : Math.round(seconds);
            const clock = sidereal ? formatLST(whole / 3600) : formatClock(whole, displayZone).time;
            if (step < 1) return clock + '.' + ((rounded % 10 + 10) % 10);
            return step < 60 ? clock : clock.slice(0, 5);
        });
        // Identify repeated civil times on a fall-back night.
        if (!sidereal && new Set(labels).size < labels.length) {
            return labels.map((label, i) => labels.indexOf(label) === labels.lastIndexOf(label) ? label : label + ' ' + formatClock(ticks[i], displayZone).zone);
        }
        return labels;
    }

    function caption() {
        if (getMode() === 'lst') return 'Local apparent sidereal time (LST)';
        const start = formatClock(first.time, zone());
        const end = formatClock(last.time, zone());
        const zones = start.zone === end.zone ? start.zone : start.zone + ' / ' + end.zone;
        if (!getShowDates()) return zones;
        return zones + ' · ' + start.date + (start.date === end.date ? '' : ' to ' + end.date);
    }

    return {splits, labels, caption};
}
