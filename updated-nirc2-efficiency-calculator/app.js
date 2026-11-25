import {minimumTint, observingTime, formatSeconds, formatDuration, subcPresets, legalHeights} from './efficiency.js';
import {createPanels, readsColors, subcColors, subcDashes, swatchBackground} from './plots.js';
import {renderEquation} from './equation.js';
import {createContour} from './contour.js';
import {createSnapSliders} from './sliders.js';

const $ = selector => document.querySelector(selector);
const inputs = {tint: $('#tint_input'), coadds: $('#coadds_input'), dithers: $('#dithers_input'), repeats: $('#repeats_input')};
const errors = {
    tint: 'Enter a tint greater than 0 s.',
    coadds: 'Enter a whole number of coadds.',
    dithers: 'Enter a whole number of dither positions.',
    repeats: 'Enter a whole number of repeats per dither.'
};
const xInput = $('#subc_x_input');
const yInput = $('#subc_y_input');
const compareRows = {reads: $('#compare_reads_row'), subc: $('#compare_subc_row')};
const compareDefaults = {reads: [2], subc: [1024, 768, 512, 256]};
const parts = ['integration', 'nirc2Overhead', 'aoOverhead'].map(key => ({
    key, value: $(`[data-part="${key}"] dd`), bar: $(`.time-bar [data-part="${key}"]`)
}));
const panels = createPanels($('#plot_panels'));
const contour = createContour($('#contour_panel'));
const sliders = createSnapSliders({tint: $('#tint_slider'), coadds: $('#coadds_slider')}, (key, value) => inputs[key].value = value);
let updateQueued = false;

const checked = name => $(`input[name="${name}"]:checked`)?.value;

// A toggle under each reads or subarray button adds that setting as a comparison line.
function buildCompareRow(mode, title, swatch) {
    for (const button of document.querySelectorAll(`input[name="${mode}"]`)) {
        const value = Number(button.value);
        const label = document.createElement('label');
        label.title = title(value);
        label.innerHTML = `<input type="checkbox" name="compare_${mode}" value="${value}" aria-label="${title(value)}"><i class="line-swatch"></i>`;
        label.firstChild.checked = compareDefaults[mode].includes(value);
        label.lastChild.style.background = swatch(value);
        compareRows[mode].append(label);
    }
}

function compareValues(mode, current) {
    const values = [];
    for (const input of document.querySelectorAll(`input[name="compare_${mode}"]`)) {
        input.disabled = Number(input.value) === current;
        if (input.checked) values.push(Number(input.value));
    }
    return values;
}

function subarrayError(x, y) {
    if (!Number.isInteger(x) || x < 32 || x > 1024 || x % 32) return 'Subarray X must be a multiple of 32 from 32 to 1024.';
    const heights = legalHeights(x);
    if (heights.includes(y)) return '';
    const nearest = [heights.findLast(height => height < y), heights.find(height => height > y)].filter(Boolean).map(height => `${x} × ${height}`);
    return `${x} × ${y} is not a legal subarray. The nearest legal ${nearest.length > 1 ? 'sizes are' : 'size is'} ${nearest.join(' and ')}.`;
}

function readSettings() {
    const settings = {
        model: checked('model'), reads: Number(checked('reads')), x: Number(xInput.value), y: Number(yInput.value),
        compareMode: checked('compare'), moveSpeed: checked('move')
    };
    $('#move_field').disabled = settings.model === 'original';
    settings.compareReads = compareValues('reads', settings.reads);
    settings.compareSubcs = compareValues('subc', subcPresets[settings.x] === settings.y ? settings.x : null);
    for (const [mode, row] of Object.entries(compareRows)) row.hidden = mode !== settings.compareMode;
    let error = '';
    for (const [key, input] of Object.entries(inputs)) {
        const value = Number(input.value);
        const valid = value > 0 && (key === 'tint' ? Number.isFinite(value) : Number.isInteger(value));
        input.setAttribute('aria-invalid', String(!valid));
        error ||= valid ? '' : errors[key];
        settings[key] = value;
    }
    const sizeError = subarrayError(settings.x, settings.y);
    for (const input of [xInput, yInput]) input.setAttribute('aria-invalid', String(Boolean(sizeError)));
    return {settings, error: error || sizeError};
}

function update() {
    updateQueued = false;
    const {settings, error} = readSettings();
    $('#results').classList.toggle('is-stale', Boolean(error));
    if (error) {
        $('#status').textContent = error;
        return;
    }
    const time = observingTime(settings);
    const minimum = minimumTint(settings);
    $('#status').textContent = settings.tint < minimum ? `Tint is below the ${formatSeconds(minimum)} minimum for this readout.` : '';
    $('#efficiency_value').textContent = time.efficiency.toFixed(1) + '%';
    $('#elapsed_value').textContent = formatDuration(time.elapsed);
    $('#elapsed_seconds').textContent = time.elapsed.toFixed(1) + ' s';
    $('#minimum_value').textContent = formatSeconds(minimum);
    for (const {key, value, bar} of parts) {
        value.textContent = formatDuration(time[key]);
        value.title = time[key].toFixed(1) + ' s';
        bar.style.flexGrow = time[key];
        bar.hidden = time[key] <= 0;
    }
    renderEquation($('#equation'), settings);
    panels.update(settings);
    contour.update(settings);
    sliders.update(settings);
}

// Redraw at most once per frame while sliders are dragged or values typed. Hidden pages get no frames.
function queueUpdate() {
    if (document.hidden) return update();
    if (updateQueued) return;
    updateQueued = true;
    requestAnimationFrame(update);
}

function syncSubarray(target) {
    if (target.name === 'subc') {
        xInput.value = target.value;
        yInput.value = subcPresets[target.value];
    } else if (target === xInput || target === yInput) {
        for (const button of document.querySelectorAll('input[name="subc"]')) {
            button.checked = button.value === xInput.value.trim() && subcPresets[button.value] === Number(yInput.value);
        }
    }
}

buildCompareRow('reads', reads => `Plot a line for ${reads} reads`, reads => readsColors[reads]);
buildCompareRow('subc', x => `Plot a line for ${x} × ${subcPresets[x]}`, x => swatchBackground(subcColors[x], subcDashes[x]));
$('#settings').addEventListener('input', event => {
    syncSubarray(event.target);
    queueUpdate();
});
update();
