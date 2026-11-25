import {intervalRotation} from './observing.js';
import {addFact} from './summary.js';

export function createIntervalSelection(plots, samples, parent, eventTime) {
    const control = document.createElement('div');
    control.className = 'plot-interval';
    const hint = document.createElement('span');
    hint.className = 'plot-interval-hint';
    hint.textContent = 'Drag across a plot to measure elapsed time and field rotation. Click or tap to clear.';
    const facts = document.createElement('div');
    facts.className = 'plot-facts';
    facts.setAttribute('role', 'group');
    facts.setAttribute('aria-label', 'Measured interval');
    const startValue = addFact(facts, 'Interval start');
    const endValue = addFact(facts, 'Interval end');
    startValue.parentElement.classList.add('plot-interval-time');
    endValue.parentElement.classList.add('plot-interval-time');
    const elapsedValue = addFact(facts, 'Elapsed time');
    const rotationValue = addFact(facts, 'Net field rotation');
    const factText = facts.querySelectorAll('.plot-text');
    control.append(hint, facts);
    parent.append(control);

    const listeners = new AbortController();
    const options = {signal: listeners.signal};
    let selection = null;
    let drag = null;
    const bands = plots.map(plot => {
        const over = plot.over;
        const band = document.createElement('div');
        band.className = 'plot-interval-band';
        band.setAttribute('aria-hidden', 'true');
        over.prepend(band);

        function indexAt(clientX) {
            const rect = over.getBoundingClientRect();
            return plot.posToIdx(Math.max(0, Math.min(clientX - rect.left, rect.width)));
        }

        function matches(event) {
            return drag && drag.over === over && drag.id === event.pointerId;
        }

        function update(event) {
            if (!matches(event)) return;
            if (drag.end === null) {
                const dx = Math.abs(event.clientX - drag.x);
                const dy = Math.abs(event.clientY - drag.y);
                const touch = event.pointerType === 'touch';
                if (touch && dy >= drag.threshold && dy > dx) {
                    finish(false);
                    return;
                }
                if (dx < drag.threshold) return;
            }
            const index = indexAt(event.clientX);
            if (index !== drag.end) {
                drag.end = index;
                refresh();
            }
        }

        over.addEventListener('pointerdown', event => {
            if (!event.isPrimary) {
                if (drag && event.pointerType === 'touch') finish(false);
                return;
            }
            if (event.button !== 0) return;
            if (drag) finish(false);
            const capture = event.target.closest('.plot-now-marker') || over;
            const threshold = event.pointerType === 'touch' ? 6 : 3;
            drag = {over, capture, id: event.pointerId, x: event.clientX, y: event.clientY, start: indexAt(event.clientX), end: null, threshold};
            capture.setPointerCapture(event.pointerId);
        }, options);
        over.addEventListener('pointermove', update, options);
        over.addEventListener('pointerup', event => {
            update(event);
            if (matches(event)) finish(drag.end !== null || Math.abs(event.clientY - drag.y) < drag.threshold);
        }, options);
        function cancel(event) {
            if (matches(event)) finish(false);
        }
        over.addEventListener('pointercancel', cancel, options);
        over.addEventListener('lostpointercapture', cancel, options);
        return band;
    });

    function finish(commit) {
        const {capture, id, start, end} = drag;
        if (commit) selection = end === null ? null : [start, end];
        drag = null;
        if (capture.hasPointerCapture(id)) capture.releasePointerCapture(id);
        if (commit || end !== null) refresh();
    }

    function refresh() {
        const preview = drag !== null && drag.end !== null;
        const range = preview ? [drag.start, drag.end] : selection;
        hint.hidden = Boolean(range);
        facts.hidden = !range;
        const complete = Boolean(range) && !preview;
        factText.forEach(element => element.classList.toggle('plot-text', complete));
        const first = range ? Math.min(...range) : 0;
        const last = range ? Math.max(...range) : 0;
        plots.forEach((plot, i) => {
            const band = bands[i];
            band.hidden = !range;
            band.classList.toggle('is-complete', complete);
            band.classList.toggle('is-preview', preview);
            if (!range) return;
            const left = plot.valToPos(samples[first].time, 'x');
            const right = plot.valToPos(samples[last].time, 'x');
            band.style.left = left + 'px';
            band.style.width = (right - left) + 'px';
        });
        if (!range) return;
        const start = samples[first].time;
        const end = samples[last].time;
        startValue.textContent = eventTime(start);
        endValue.textContent = eventTime(end);
        elapsedValue.textContent = Number(((end - start) / 60).toFixed(2)) + ' min';
        const angle = intervalRotation(samples, first, last);
        rotationValue.textContent = angle == null ? 'unavailable' : (angle > 0 ? '+' : '') + angle.toFixed(1) + '°';
    }

    refresh();
    return {
        refresh,
        get completedFacts() { return selection && drag?.end == null ? facts : null; },
        destroy() {
            listeners.abort();
            if (drag) finish(false);
            bands.forEach(band => band.remove());
            control.remove();
        }
    };
}
