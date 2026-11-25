import {computeNight, isKeckSite} from './observing.js';
import {renderPlot} from './plot.js';
import {renderEmptyPlot} from './empty-plot.js';
import {createTargetHistory} from './history.js';

const targetName = document.querySelector('#target_name_input');
const raInput = document.querySelector('#ra_input');
const decInput = document.querySelector('#dec_input');
const dateInput = document.querySelector('#date_input');
const dateToday = document.querySelector('#date_today');
const axisMode = document.querySelector('#axis_mode');
const showDates = document.querySelector('#show_dates');
const use12Hour = document.querySelector('#use_12_hour');
const nowToggle = document.querySelector('#show_current_time');
const nowStatus = document.querySelector('#now_status');
const timeZoneInput = document.querySelector('#timezone_input');
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
timeZoneInput.querySelector('[value="auto"]').title = browserZone;
const latInput = document.querySelector('#lat_input');
const lonInput = document.querySelector('#lon_input');
const saveButton = document.querySelector('#save_button');
const chart = document.querySelector('#chart');
const plotSurface = document.querySelector('#plot-surface');
const plotDetails = document.querySelector('#plot-details');
const status = document.querySelector('#status');
const inputs = [targetName, raInput, decInput, dateInput, latInput, lonInput];

function parseAngle(value, isRA) {
    const limit = isRA ? 24 : 90;
    const error = isRA ? 'Enter RA in hours, from 0 to 24 (HH MM SS).' : 'Enter Dec in degrees, from −90 to +90 (DD MM SS).';
    const input = value.trim().replace(/^−/, '-');
    const unitForm = input.match(/^([+-]?[\d.]+)\s*([hd°])(?:\s*([\d.]+)\s*[m′'](?:\s*([\d.]+)\s*[s″"])?)?$/i);
    let parts;
    if (unitForm) {
        if ((unitForm[2].toLowerCase() === 'h') !== isRA) throw new Error(error);
        parts = [unitForm[1], unitForm[3], unitForm[4]].filter(part => part !== undefined);
    } else {
        parts = input.includes(':') ? input.split(/\s*:\s*/) : input.split(/\s+/);
    }
    if (parts.length > 3 || !/^[+-]?\d+(\.\d+)?$/.test(parts[0])) throw new Error(error);
    if (parts.slice(1).some(part => !/^\d+(\.\d+)?$/.test(part) || Number(part) >= 60)) throw new Error(error);
    if (parts.slice(0, -1).some(part => part.includes('.'))) throw new Error(error);

    const [whole, minutes = 0, seconds = 0] = parts.map(Number);
    const angle = Math.abs(whole) + minutes / 60 + seconds / 3600;
    if (angle > limit || (isRA && input.startsWith('-'))) throw new Error(error);
    if (isRA) return angle % 24;
    return input.startsWith('-') ? -angle : angle;
}

function formatAngle(value, isRA) {
    let tenths = Math.round(Math.abs(value) * 36000);
    if (isRA) tenths %= 24 * 36000;
    const whole = String(Math.floor(tenths / 36000)).padStart(2, '0');
    const minutes = String(Math.floor(tenths / 600) % 60).padStart(2, '0');
    const seconds = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
    const sign = isRA ? '' : (value < 0 ? '-' : '+');
    return `${sign}${whole} ${minutes} ${seconds}`;
}

function siteDegrees(input, label, limit) {
    const value = input.value.trim();
    const degrees = Number(value);
    if (!value || !Number.isFinite(degrees) || Math.abs(degrees) > limit) throw new Error(`Enter ${label} in degrees, from −${limit} to +${limit}.`);
    return degrees;
}

const defaultTarget = {name: targetName.defaultValue, ra: raInput.defaultValue, dec: decInput.defaultValue};
const coordinateCache = new Map([[defaultTarget.name, defaultTarget]]);
let identified = defaultTarget;
let lookup = null;
let lookupTimer;
let plotTimer;
let plotted = null;
let placeholder = null;
let dateStatusTimer;
const targetHistory = createTargetHistory(document.querySelector('#target_history'), ({name}) => {
    targetName.value = name;
    changeTargetName(true);
});

function displayTimeZone() {
    return timeZoneInput.value === 'auto' ? browserZone : timeZoneInput.value;
}

function updateDateStatus() {
    clearTimeout(dateStatusTimer);
    const instant = Date.now();
    const now = Math.floor(instant / 1000);
    const today = new Date(instant).toISOString().slice(0, 10);
    const inPlot = plotted && now >= plotted.start && now <= plotted.end;
    dateToday.hidden = dateInput.value !== today;
    if (plotted) plotted.view.setToday(plotted.date === today);
    // Preserve the notice's space while the plot is being replaced.
    nowStatus.style.visibility = plotted ? '' : 'hidden';
    if (plotted || !nowToggle.checked) nowStatus.textContent = nowToggle.checked && !inPlot ? 'Current time is outside the plotted hours.' : '';

    // Update at UTC midnight or when the current time enters or leaves this plot.
    const boundaries = [(Math.floor(now / 86400) + 1) * 86400];
    if (plotted) boundaries.push(plotted.start, plotted.end + 1);
    const next = Math.min(...boundaries.filter(time => time > now));
    dateStatusTimer = setTimeout(updateDateStatus, next * 1000 - instant);
}

function observingSite() {
    const date = dateInput.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !dateInput.validity.valid) throw new Error('Enter an observing date.');
    return {date, lat: siteDegrees(latInput, 'latitude', 90), lon: siteDegrees(lonInput, 'longitude', 180)};
}

function showEmptyPlot() {
    placeholder?.destroy();
    let night = null;
    try {
        const {date, lat, lon} = observingSite();
        // Any target gives the night's times and Sun altitudes.
        night = computeNight(0, 0, date, lat, lon);
    } catch {
        // The blank plot then has no times or sky.
    }
    const settings = {axisMode: axisMode.value, zone: displayTimeZone(), showDates: showDates.checked, use12Hour: use12Hour.checked};
    placeholder = renderEmptyPlot(chart, night, isKeckSite(Number(latInput.value), Number(lonInput.value)), settings, nowToggle);
}

function hideEmptyPlot() {
    placeholder?.destroy();
    placeholder = null;
}

function discardPlot(showEmpty = true) {
    clearTimeout(plotTimer);
    if (plotted) chart.style.minHeight = chart.getBoundingClientRect().height + 'px';
    plotted?.view.destroy();
    plotted = null;
    saveButton.disabled = true;
    if (showEmpty) showEmptyPlot();
    updateDateStatus();
}

function settlePlotHeight(view, anchor, previousTop) {
    // uPlot sizes its canvases after construction. Keep the controls steady until then.
    requestAnimationFrame(() => {
        if (plotted?.view !== view || !chart.style.minHeight) return;
        plotSurface.style.minHeight = '';
        chart.style.minHeight = '';
        if (previousTop > window.innerHeight) return;
        const shift = anchor.getBoundingClientRect().top - previousTop;
        if (Math.abs(shift) < 1) return;
        window.scrollBy({top: shift, behavior: 'instant'});
        // At the top of the page the browser cannot scroll up to absorb a shorter plot.
        const shortfall = previousTop - anchor.getBoundingClientRect().top;
        if (shortfall > 1) chart.style.minHeight = (chart.getBoundingClientRect().height + shortfall) + 'px';
    });
}

function makePlot(rememberTarget = true) {
    const name = targetName.value.trim();
    if (name && (name !== identified?.name || raInput.value !== identified.ra || decInput.value !== identified.dec)) {
        if (lookup?.name !== name) changeTargetName(true);
        return;
    }
    const anchor = document.activeElement?.closest('.input-container') ? targetName : saveButton;
    const previousTop = anchor.getBoundingClientRect().top;
    discardPlot(false);
    try {
        const ra = parseAngle(raInput.value, true);
        const dec = parseAngle(decInput.value, false);
        const {date, lat, lon} = observingSite();

        const title = name || `RA ${formatAngle(ra, true)}, Dec ${formatAngle(dec, false)}`;
        const base = name.replace(/\s+/g, '_').replace(/[<>:"/\\|?*]/g, '') || 'target';
        const night = computeNight(ra, dec, date, lat, lon);
        status.textContent = '';
        hideEmptyPlot();
        const view = renderPlot(chart, night, title, date, displayTimeZone(), nowToggle, {axisMode: axisMode.value, showDates: showDates.checked, use12Hour: use12Hour.checked});
        plotted = {view, date, start: Math.ceil(night.samples[0].time), end: Math.floor(night.samples.at(-1).time), inputs: inputs.map(input => input.value.trim()), filename: `${base}_${date}.png`};
        if (name && rememberTarget) targetHistory.remember(name, identified.ra, identified.dec, true);
        saveButton.disabled = false;
        updateDateStatus();
        settlePlotHeight(view, anchor, previousTop);
    } catch (error) {
        discardPlot(false);
        plotSurface.replaceChildren();
        plotDetails.replaceChildren();
        showEmptyPlot();
        status.textContent = error.message;
    }
}

function resolverCoordinates(ra, dec) {
    if (!ra?.trim() || !dec?.trim()) return null;
    const raHours = Number(ra) / 15;
    const decDegrees = Number(dec);
    if (!Number.isFinite(raHours) || !Number.isFinite(decDegrees) || raHours < 0 || raHours >= 24 || Math.abs(decDegrees) > 90) return null;
    return {ra: raHours, dec: decDegrees};
}

async function fetchCoordinates(name, signal) {
    const query = '~A?' + encodeURIComponent(name);
    const mirror = 'https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/';
    const cds = 'https://cds.unistra.fr/cgi-bin/nph-sesame/';
    for (const [endpoint, format] of [[mirror, '-ox/'], [mirror, ''], [cds, '']]) {
        try {
            const attempt = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
            const response = await fetch(endpoint + format + query, {signal: attempt});
            if (!response.ok) throw new Error('The target resolver is unavailable.');
            const body = await response.text();
            if (format) {
                const xml = new DOMParser().parseFromString(body, 'application/xml');
                for (const resolver of xml.querySelectorAll('Resolver')) {
                    const coords = resolverCoordinates(resolver.querySelector('jradeg')?.textContent, resolver.querySelector('jdedeg')?.textContent);
                    if (coords) return coords;
                }
            } else {
                for (const line of body.split('\n')) {
                    const match = /^%J\s+(\S+)\s+(\S+)/.exec(line);
                    const coords = match && resolverCoordinates(match[1], match[2]);
                    if (coords) return coords;
                }
            }
        } catch (error) {
            if (signal.aborted) throw error;
        }
    }
    throw new Error('Target name not found.');
}

function cancelLookup() {
    clearTimeout(lookupTimer);
    lookup?.controller.abort();
    lookup = null;
}

async function resolveTarget() {
    clearTimeout(lookupTimer);
    const name = targetName.value.trim();
    if (!name || lookup?.name === name) return;
    cancelLookup();
    const request = {name, controller: new AbortController()};
    lookup = request;
    status.textContent = `Resolving ${name}…`;
    try {
        const saved = targetHistory.find(name);
        let target = coordinateCache.get(name) || (saved?.verified ? saved : null);
        if (!target) {
            const coords = await fetchCoordinates(name, request.controller.signal);
            target = {name, ra: formatAngle(coords.ra, true), dec: formatAngle(coords.dec, false)};
        }
        if (lookup !== request || targetName.value.trim() !== name) return;
        coordinateCache.set(name, target);
        identified = target;
        raInput.value = target.ra;
        decInput.value = target.dec;
        makePlot();
    } catch {
        if (lookup === request) status.textContent = `Could not resolve ${name}. Check the name or enter coordinates.`;
    } finally {
        if (lookup === request) lookup = null;
    }
}

function changeTargetName(immediate = false) {
    cancelLookup();
    discardPlot();
    identified = null;
    raInput.value = '';
    decInput.value = '';
    const name = targetName.value.trim();
    status.textContent = name ? `Resolving ${name}…` : 'Enter a target name or coordinates.';
    if (!name) return;
    if (immediate) resolveTarget();
    else lookupTimer = setTimeout(resolveTarget, 350);
}

targetName.addEventListener('input', () => changeTargetName());
for (const input of [raInput, decInput, dateInput, latInput, lonInput]) {
    input.addEventListener('input', () => {
        if (input === raInput || input === decInput) {
            cancelLookup();
            identified = null;
            targetName.value = '';
        }
        discardPlot();
        if (targetName.value.trim() && !identified) return;
        status.textContent = 'Updating plot…';
        plotTimer = setTimeout(makePlot, 350);
    });
}
timeZoneInput.addEventListener('change', () => plotted?.view.setTimeZone(displayTimeZone()));
axisMode.addEventListener('change', () => plotted?.view.setAxisMode(axisMode.value));
showDates.addEventListener('change', () => plotted?.view.setShowDates(showDates.checked));
use12Hour.addEventListener('change', () => plotted?.view.setUse12Hour(use12Hour.checked));
for (const input of [timeZoneInput, axisMode, showDates, use12Hour]) input.addEventListener('change', () => { if (placeholder) showEmptyPlot(); });
nowToggle.addEventListener('change', updateDateStatus);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateDateStatus(); });
targetName.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        makePlot();
    }
});
saveButton.addEventListener('click', () => {
    if (!plotted) return;
    if (inputs.some((input, i) => input.value.trim() !== plotted.inputs[i])) {
        makePlot();
        return;
    }
    plotted.view.save(plotted.filename);
});

dateInput.value = new Date().toISOString().slice(0, 10);
// Seed a new history without moving the default target to the top on every visit.
makePlot(targetHistory.isNew);
