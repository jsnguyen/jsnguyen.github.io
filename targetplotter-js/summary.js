import {formatLST} from './time.js';

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

export function createObservingSummary(footer, night, eventTime) {
    const facts = document.createElement('div');
    facts.className = 'plot-facts';
    facts.setAttribute('role', 'group');
    facts.setAttribute('aria-label', 'Observing summary');
    footer.append(facts);

    const visible = addFact(facts, 'Time visible');
    visible.textContent = night.visibleHours.toFixed(2) + ' h';
    visible.title = 'Unvignetted time with the Sun below −12°, estimated from 30-second samples and corrected for the Keck zenith exclusion.';
    const moon = addFact(facts, 'Min Moon sep.');
    moon.textContent = night.minMoonSep.toFixed(2) + '°';
    moon.title = 'Minimum target–Moon separation over the plotted time range.';

    const events = [
        [addFact(facts, 'Sunset'), night.sunsetTime],
        [addFact(facts, 'Sunrise'), night.sunriseTime],
        [addFact(facts, 'Transit'), night.transitTime]
    ];
    addFact(facts, 'Transit LST').textContent = night.transitLstHours == null ? '—' : formatLST(night.transitLstHours);
    events.push([addFact(facts, 'Rise'), night.riseTime], [addFact(facts, 'Set'), night.setTime]);

    function refresh() {
        for (const [value, time] of events) value.textContent = eventTime(time);
    }
    refresh();
    return {refresh};
}
