import {findCity} from './cities.js';
import {handoff} from './handoff.js';

const banner = document.querySelector('.sun-banner');
const places = new Map();

function hm(seconds, hour12) {
    const hour = Math.floor(seconds / 3600);
    const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    if (!hour12) return String(hour).padStart(2, '0') + ':' + minutes;
    return String(hour % 12 || 12).padStart(2, '0') + ':' + minutes + (hour < 12 ? '\u00a0AM' : '\u00a0PM');
}

function duration(seconds) {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return 'under 1 min';
    const hours = Math.floor(minutes / 60);
    return (hours ? hours + ' hr ' : '') + minutes % 60 + ' min';
}

function nextEvent(place, now) {
    const observer = new Astronomy.Observer(place.latitude, place.longitude, 0);
    const rise = Astronomy.SearchRiseSet('Sun', observer, +1, now, 1);
    const set = Astronomy.SearchRiseSet('Sun', observer, -1, now, 1);
    const event = rise && (!set || rise.date < set.date) ? {name: 'Sunrise', time: rise} : set && {name: 'Sunset', time: set};
    // Whole seconds keep the event time and the countdown in step.
    return event && {name: event.name, date: new Date(Math.floor(event.time.date / 1000) * 1000)};
}

// UTC and LST follow the site. City clocks use their own city, found once in the city list.
function placeOf(tile, site) {
    if (tile.zone === 'UTC' || tile.zone === 'LST') return site;
    const id = tile.key + '|' + tile.zone;
    if (!places.has(id)) {
        places.set(id, null);
        findCity(tile.city ?? {name: tile.title, zone: tile.zone}).then(city => places.set(id, city), () => {});
    }
    return places.get(id);
}

export function showSunTimes(tiles, now, site, hour12, clockSeconds) {
    const siteEvent = nextEvent(site, now);
    banner.hidden = !siteEvent;
    const siteHandoff = siteEvent && handoff(site, siteEvent, now);
    if (siteEvent) banner.textContent = (siteHandoff ? 'Handoff in ' + duration((siteHandoff - now) / 1000) + ' · ' : '') + siteEvent.name + ' in ' + duration((siteEvent.date - now) / 1000);
    for (const tile of tiles) {
        if (!tile.sun) {
            tile.sun = document.createElement('p');
            tile.sun.className = 'sun-time';
            tile.element.querySelector('.readout').after(tile.sun);
        }
        const place = placeOf(tile, site);
        const event = place && nextEvent(place, now);
        tile.sun.hidden = !event;
        const split = event && handoff(place, event, now);
        if (event) tile.sun.textContent = (split ? 'Handoff\u00a0' + hm(clockSeconds(tile.zone, split), hour12) + ' · ' : '') + event.name + '\u00a0' + hm(clockSeconds(tile.zone, event.date), hour12);
    }
}
