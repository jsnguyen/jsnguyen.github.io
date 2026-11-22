import {formatEventTime, formatLST} from './time.js';

export function addFact(parent, label) {
    const row = document.createElement('div');
    row.className = 'plot-fact';
    const term = document.createElement('span');
    term.className = 'plot-text plot-fact-label';
    term.setAttribute('role', 'term');
    term.textContent = label;
    const value = document.createElement('span');
    value.className = 'plot-text plot-fact-value';
    value.setAttribute('role', 'definition');
    row.append(term, value);
    parent.append(row);
    return value;
}

export function createObservingSummary(footer, night, getZone, getShowDates = () => false) {
    const facts = document.createElement('div');
    facts.className = 'plot-facts';
    facts.setAttribute('role', 'group');
    facts.setAttribute('aria-label', 'Observing summary');
    footer.append(facts);

    const visible = addFact(facts, 'Time visible');
    visible.textContent = night.visibleHours.toFixed(2) + ' h';
    visible.title = 'Unvignetted target with the Sun below −12°. Windows use 30-second samples and include brief Keck zenith exclusions.';
    const moon = addFact(facts, 'Min Moon sep.');
    moon.textContent = night.minMoonSep.toFixed(2) + '°';
    moon.title = 'Minimum target–Moon separation over the plotted time range.';

    const events = [[addFact(facts, 'Sunset'), night.sunsetTime], [addFact(facts, 'Sunrise'), night.sunriseTime]];
    for (const [i, window] of night.windows.entries()) {
        const label = 'Window ' + (i + 1);
        events.push([addFact(facts, label + ' start'), window.start]);
        events.push([addFact(facts, label + ' end'), window.end]);
    }
    if (night.windows.length === 0) addFact(facts, 'Observing windows').textContent = 'None';
    events.push([addFact(facts, 'Upper transit'), night.transitTime]);
    addFact(facts, 'Transit LST').textContent = night.transitLstHours == null ? '—' : formatLST(night.transitLstHours);

    function refresh() {
        const zone = getZone();
        const showDates = getShowDates();
        for (const [value, time] of events) value.textContent = formatEventTime(time, zone, showDates);
    }
    refresh();
    return {refresh};
}
