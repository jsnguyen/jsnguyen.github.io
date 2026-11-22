import {formatClock} from '../targetplotter-js/time.js';
import {setupCitySearch} from './city-search.js';
import {setupTileOrder} from './tile-order.js';

const day = 86400;
const keck = {latitude: 19.8286, longitude: -155.4742};
const defaultZones = ['Pacific/Honolulu', 'America/Los_Angeles', 'America/New_York', 'Europe/London'];
const grid = document.querySelector('#clocks');
const template = document.querySelector('#clock-tile');
const coordinates = document.querySelector('#lst-editor').content.querySelector('details');
const siteForm = coordinates.querySelector('form');
const picker = document.querySelector('#zone-picker');
const hours = document.querySelector('.hour-format');
let browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let cities = defaultZones.filter(zone => zone !== browserZone).slice(0, 3).map(zone => ({name: locationName(zone), zone}));
let tileOrder = [];
let hour12 = false;
let site = keck;
let tiles = [];
let timer;

try {
    const saved = JSON.parse(localStorage.getItem('timezones.preferences'));
    if (Array.isArray(saved?.zones)) cities = saved.zones.map(restoreCity).filter(Boolean);
    if (Array.isArray(saved?.order)) tileOrder = saved.order.filter(key => typeof key === 'string');
    const savedSite = saved?.site;
    if (Number.isFinite(savedSite?.latitude) && Math.abs(savedSite.latitude) <= 90 &&
        Number.isFinite(savedSite.longitude) && Math.abs(savedSite.longitude) <= 180) site = savedSite;
    hour12 = saved?.hours === 12;
} catch { /* Storage can be unavailable in private browsing. */ }

function savePreferences() {
    try {
        localStorage.setItem('timezones.preferences', JSON.stringify({zones: cities, hours: hour12 ? 12 : 24, site, order: tileOrder}));
    } catch { /* The clocks also work without storage. */ }
}

function hms(seconds, twelveHour = false) {
    const hour = Math.floor(seconds / 3600);
    const values = [twelveHour ? (hour % 12 || 12) : hour, Math.floor(seconds / 60) % 60, seconds % 60];
    return values.map(value => String(value).padStart(2, '0')).join(':');
}

function formatOffset(seconds, sidereal) {
    const value = Math.abs(seconds);
    const full = hms(value);
    let digits = full;
    if (!sidereal && value % 60 === 0) digits = full.slice(0, value % 3600 === 0 ? 2 : 5);
    return 'UTC ' + (seconds < 0 ? '−' : '+') + digits;
}

function readClock(zone, date) {
    if (zone === 'LST') {
        const localHours = (Astronomy.SiderealTime(date) + site.longitude / 15 + 24) % 24;
        return {seconds: Math.floor(localHours * 3600), offset: null};
    }
    const instant = date.getTime() / 1000;
    const clock = formatClock(instant, zone);
    // Include the local calendar date so offsets survive midnight and the date line.
    const local = Date.parse(clock.date + 'T' + clock.time + 'Z') / 1000;
    const seconds = (local % day + day) % day;
    return {seconds, offset: local - instant, date: clock.date, abbreviation: clock.zone};
}

function utcDifference(clock, utcSeconds) {
    if (clock.offset !== null) return clock.offset;
    const difference = clock.seconds - utcSeconds;
    return Math.abs(difference) > day / 2 ? difference - Math.sign(difference) * day : difference;
}

function locationName(zone) {
    if (zone === 'UTC' || zone === 'GMT' || zone.startsWith('Etc/')) return 'Local time';
    return zone.split('/').pop().replaceAll('_', ' ');
}

function restoreCity(value) {
    // Earlier preferences stored only the timezone identifier.
    const city = typeof value === 'string' ? {name: locationName(value), zone: value} : value;
    if (!city?.name || typeof city.name !== 'string' || typeof city.zone !== 'string') return null;
    try {
        new Intl.DateTimeFormat('en', {timeZone: city.zone});
        return city;
    } catch {
        return null;
    }
}

function siteName() {
    return site.latitude === keck.latitude && site.longitude === keck.longitude ? 'Keck' : 'Site';
}

function showCoordinates() {
    const {latitude, longitude} = site;
    siteForm.elements.latitude.value = latitude;
    siteForm.elements.longitude.value = longitude;
    const lat = Math.abs(latitude).toFixed(4) + '° ' + (latitude < 0 ? 'S' : 'N');
    const lon = Math.abs(longitude).toFixed(4) + '° ' + (longitude < 0 ? 'W' : 'E');
    const summary = coordinates.querySelector('summary');
    summary.textContent = siteName() + ' · ' + lat + ', ' + lon;
    summary.setAttribute('aria-label', 'Edit LST coordinates, ' + summary.textContent);
}

function setSite(newSite) {
    site = newSite;
    showCoordinates();
    savePreferences();
    coordinates.open = false;
    coordinates.querySelector('summary').focus();
    refresh();
}

function makeTile(key, title, zone, city) {
    const tile = template.content.firstElementChild.cloneNode(true);
    tile.dataset.clockKey = key;
    const heading = tile.querySelector('h2');
    const date = tile.querySelector('.clock-date');
    if (zone === 'LST') date.replaceWith(coordinates);
    if (city) {
        const button = tile.querySelector('button');
        button.hidden = false;
        button.setAttribute('aria-label', 'Remove ' + title);
        button.addEventListener('click', () => {
            cities = cities.filter(value => value !== city);
            tileOrder = tileOrder.filter(value => value !== key);
            savePreferences();
            buildClocks();
            picker.focus();
        });
    }
    const offset = tile.querySelector('.delta');
    offset.hidden = zone === 'UTC';
    if (zone === 'LST') offset.title = 'Shortest clock difference from UTC';
    return {element: tile, key, zone, title, heading, readout: tile.querySelector('.clock-time'), period: tile.querySelector('.period'), date, offset};
}

function buildClocks() {
    tiles = [
        makeTile('utc', 'UTC', 'UTC'),
        makeTile('lst', 'LST', 'LST'),
        makeTile('local', locationName(browserZone), browserZone)
    ];
    for (const city of cities) {
        if (city.zone === browserZone && city.name === locationName(browserZone)) continue;
        const key = JSON.stringify([city.name, city.zone, city.region ?? '']);
        tiles.push(makeTile(key, city.name, city.zone, city));
    }
    const order = new Map(tileOrder.map((key, index) => [key, index]));
    tiles.sort((a, b) => (order.get(a.key) ?? tileOrder.length) - (order.get(b.key) ?? tileOrder.length));
    grid.replaceChildren(...tiles.map(tile => tile.element));
    refresh();
}

function refresh() {
    clearTimeout(timer);
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const utcSeconds = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    for (const tile of tiles) {
        const clock = readClock(tile.zone, now);
        let heading = tile.title;
        if (tile.zone === 'LST') heading = siteName() + ' / LST';
        else if (clock.abbreviation !== tile.title) heading += ' / ' + clock.abbreviation;
        if (tile.heading.textContent !== heading) tile.heading.textContent = heading;
        tile.readout.textContent = hms(clock.seconds, hour12);
        tile.period.textContent = hour12 ? (clock.seconds < day / 2 ? ' AM' : ' PM') : '';
        if (clock.date) tile.date.textContent = clock.date;
        if (!tile.offset.hidden) tile.offset.textContent = formatOffset(utcDifference(clock, utcSeconds), tile.zone === 'LST');
    }
    if (!document.hidden) timer = setTimeout(refresh, 1000 - Date.now() % 1000);
}

setupTileOrder(grid, () => {
    tileOrder = Array.from(grid.children, tile => tile.dataset.clockKey);
    savePreferences();
});
setupCitySearch(picker.form, city => {
    if (city.zone === browserZone && city.name === locationName(browserZone)) return false;
    if (cities.some(saved => saved.name === city.name && saved.zone === city.zone && (!saved.region || saved.region === city.region))) return false;
    cities.push(city);
    savePreferences();
    buildClocks();
    return true;
});
hours.addEventListener('change', event => {
    hour12 = event.target.value === '12';
    savePreferences();
    refresh();
});
siteForm.addEventListener('submit', event => {
    event.preventDefault();
    setSite({latitude: siteForm.elements.latitude.valueAsNumber, longitude: siteForm.elements.longitude.valueAsNumber});
});
siteForm.querySelector('.use-keck').addEventListener('click', () => setSite(keck));
coordinates.addEventListener('toggle', () => {
    if (!coordinates.open) return;
    const anchor = coordinates.parentElement.getBoundingClientRect();
    const fitsBelow = anchor.bottom + 6 + siteForm.offsetHeight <= window.innerHeight;
    coordinates.classList.toggle('open-above', !fitsBelow && anchor.top > window.innerHeight - anchor.bottom);
});
document.addEventListener('pointerdown', event => {
    if (coordinates.open && !coordinates.contains(event.target)) coordinates.open = false;
});
coordinates.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !coordinates.open) return;
    coordinates.open = false;
    coordinates.querySelector('summary').focus();
});
function syncBrowserZone() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === browserZone) return refresh();
    browserZone = zone;
    buildClocks();
}
window.addEventListener('focus', syncBrowserZone);
document.addEventListener('visibilitychange', syncBrowserZone);
hours.querySelector('[value="' + (hour12 ? 12 : 24) + '"]').checked = true;
showCoordinates();
buildClocks();
