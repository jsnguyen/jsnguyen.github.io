let catalog;

function normalize(text) {
    return text.normalize('NFD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

async function loadCities() {
    const response = await fetch(new URL('./cities.json?v=2', import.meta.url));
    if (!response.ok) throw new Error('Could not load the city list.');
    const data = await response.json();
    const supported = Intl.supportedValuesOf?.('timeZone');
    const resolved = new Map((supported ?? []).map(zone => [zone, zone]));
    function resolveZone(zone) {
        if (!resolved.has(zone)) {
            try {
                resolved.set(zone, new Intl.DateTimeFormat('en', {timeZone: zone}).resolvedOptions().timeZone);
            } catch {
                resolved.set(zone, null);
            }
        }
        return resolved.get(zone);
    }

    const countries = new Intl.DisplayNames(['en'], {type: 'region'});
    const regions = data.regions.map(([id, country, state]) => ({
        zone: resolveZone(id),
        region: state ? state + ', ' + country : country,
        qualifiers: new Set(normalize([country, countries.of(country), state, data.states[state]].filter(Boolean).join(' ')).split(' '))
    }));
    // The source rows are already ordered by population.
    const cities = [];
    const zoneCities = new Map();
    for (const [name, index, latitude, longitude, asciiName] of data.cities) {
        const location = regions[index];
        if (!location.zone) continue;
        const key = normalize(name);
        const keys = asciiName ? [key, normalize(asciiName)] : [key];
        const city = {name, ...location, keys, latitude, longitude};
        cities.push(city);
        for (const alias of keys) {
            const id = location.zone + '/' + alias.replace(/ city$/, '');
            if (!zoneCities.has(id)) zoneCities.set(id, city);
        }
    }

    const zoneCountries = new Map(Object.entries(data.zoneCountries).map(([id, country]) => [resolveZone(id), country]));
    const timeZones = new Set([...(supported ?? []), ...Object.keys(data.zoneCountries)]);
    for (const id of timeZones) {
        const zone = resolveZone(id);
        if (!zone) continue;
        const name = id.split('/').pop().replaceAll('_', ' ');
        const key = normalize(name);
        let city = zoneCities.get(zone + '/' + key);
        if (!city) {
            const country = data.zoneCountries[id] ?? zoneCountries.get(zone);
            const state = data.zoneStates[id] ?? data.zoneStates[zone];
            const region = state ? state + ', US' : country || id.split('/')[0];
            const qualifiers = new Set(normalize([region, country && countries.of(country), data.states[state]].filter(Boolean).join(' ')).split(' '));
            city = {name, region, zone, qualifiers, keys: []};
            cities.push(city);
            zoneCities.set(zone + '/' + key, city);
        }
        if (!city.keys.includes(key)) city.keys.push(key);
        (city.paths ??= []).push(normalize(id));
    }
    return cities;
}

function matchRank(city, name, qualifiers, zoneQuery) {
    if (!qualifiers.every(word => city.qualifiers.has(word))) return -1;
    if (zoneQuery) {
        if (city.paths?.includes(name)) return 0;
        return city.paths?.some(path => path.startsWith(name)) ? 1 : -1;
    }
    let rank = 4;
    for (const key of city.keys) {
        if (key === name) return 0;
        if (name.startsWith(key + ' ') && name.slice(key.length + 1).split(' ').every(word => city.qualifiers.has(word))) return 0;
        if (key.startsWith(name)) rank = Math.min(rank, 1);
        else if (key.includes(' ' + name)) rank = Math.min(rank, 2);
        else if (key.includes(name)) rank = Math.min(rank, 3);
    }
    return rank === 4 ? -1 : rank;
}

function getCatalog() {
    if (!catalog) catalog = loadCities().catch(error => { catalog = null; throw error; });
    return catalog;
}

export async function findCity({name, zone, region}) {
    const key = normalize(name);
    const cities = await getCatalog();
    return cities.find(city => city.zone === zone && (!region || city.region === region) && city.keys.includes(key) && Number.isFinite(city.latitude)) ?? null;
}

export async function searchCities(query) {
    const [name, ...location] = query.split(',').map(normalize);
    if (!name) return [];
    const qualifiers = location.join(' ').split(' ').filter(Boolean);
    const zoneQuery = query.includes('/');
    const matches = [[], [], [], []];
    const seen = new Set();
    for (const city of await getCatalog()) {
        const rank = matchRank(city, name, qualifiers, zoneQuery);
        if (rank < 0 || matches[rank].length === 8) continue;
        const id = city.name + '/' + city.region + '/' + city.zone;
        if (seen.has(id)) continue;
        seen.add(id);
        matches[rank].push({name: city.name, region: city.region, zone: city.zone});
        if (matches[0].length === 8) break;
    }
    return matches.flat().slice(0, 8);
}
