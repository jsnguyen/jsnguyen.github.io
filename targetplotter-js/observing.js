const keckLatitude = 19.8286;
const keckLongitude = -155.4742;
const radians = Math.PI / 180;
const siderealRate = 360 / 86164.0905; // Degrees per second.

// https://www2.keck.hawaii.edu/inst/common/TelLimits.html
function keckVisibility(alt, az) {
    if (alt < 0 || alt >= 89.5) return 0;
    if (az >= 185.3 && az < 332.8) return alt >= 36.8 ? 2 : 0;
    return alt >= 18 ? 2 : 1;
}

function ephemeris(unixTime, observer) {
    const time = Astronomy.MakeTime(new Date(unixTime * 1000));
    const sun = Astronomy.Equator('Sun', time, observer, true, true);
    const moon = Astronomy.Equator('Moon', time, observer, true, true);
    return { sun: sun.vec, moon: moon.vec };
}

function interpolateVector(start, end, fraction, time) {
    const x = start.x + fraction * (end.x - start.x);
    const y = start.y + fraction * (end.y - start.y);
    const z = start.z + fraction * (end.z - start.z);
    return new Astronomy.Vector(x, y, z, time);
}

function localSiderealHours(time, longitude) {
    return (Astronomy.SiderealTime(time) + longitude / 15 + 24) % 24;
}

function nightBounds(midnight, observer) {
    // A short polar night can fall entirely to one side of mean midnight.
    // Search from the preceding solar noon to the next for an ordered pair.
    const firstNoon = Astronomy.SearchHourAngle('Sun', observer, 0, midnight, -1).time;
    const lastNoon = Astronomy.SearchHourAngle('Sun', observer, 0, midnight, 1).time;
    const sunset = Astronomy.SearchRiseSet('Sun', observer, -1, firstNoon, lastNoon.ut - firstNoon.ut);
    const sunrise = Astronomy.SearchRiseSet('Sun', observer, 1, lastNoon, firstNoon.ut - lastNoon.ut);
    if (!sunset && !sunrise) {
        const sun = Astronomy.Equator('Sun', midnight, observer, true, true);
        const alt = Astronomy.Horizon(midnight, observer, sun.ra, sun.dec).altitude;
        const solarRadius = Math.asin(695700 / (sun.dist * Astronomy.KM_PER_AU)) / radians;
        const refraction = (34 / 60) * Astronomy.Atmosphere(observer.height).density;
        if (alt + solarRadius + refraction >= 0) throw new Error('The Sun stays above the horizon during polar day at this site.');
        throw new Error('The Sun stays below the horizon during polar night at this site.');
    }
    if (!sunset) throw new Error('This observing night has a sunrise but no preceding sunset between local solar noons.');
    if (!sunrise || sunrise.ut <= sunset.ut) throw new Error('This observing night has a sunset but no following sunrise before the next local solar noon.');
    return {sunsetTime: sunset.date.getTime() / 1000, sunriseTime: sunrise.date.getTime() / 1000};
}

function observingWindows(samples, isKeck, latitude, dec, transitTime) {
    const windows = [];
    let start = null;
    for (let i = 0; i < samples.length; i++) {
        const row = samples[i];
        const visible = row.visibility === 2 && row.sunAlt < -12;
        const boundary = i === 0 ? row.time : (row.time + samples[i - 1].time) / 2;
        if (visible && start === null) start = boundary;
        if (!visible && start !== null) {
            windows.push({ start, end: boundary });
            start = null;
        }
    }
    if (start !== null) windows.push({ start, end: samples[samples.length - 1].time });
    if (!isKeck || Math.abs(latitude - dec) >= 0.5 || samples.some(row => row.alt >= 89.5)) return windows;

    // A grazing transit can enter and leave Keck's zenith exclusion between samples.
    // Solve its hour angle at altitude 89.5 degrees and remove only the missed gap.
    const cosHourAngle = (Math.sin(89.5 * radians) - Math.sin(latitude * radians) * Math.sin(dec * radians)) / (Math.cos(latitude * radians) * Math.cos(dec * radians));
    const halfGap = Math.acos(Math.min(1, cosHourAngle)) / radians / siderealRate;
    const gapStart = transitTime - halfGap;
    const gapEnd = transitTime + halfGap;
    const corrected = [];
    for (const window of windows) {
        if (gapEnd <= window.start || gapStart >= window.end) {
            corrected.push(window);
        } else {
            if (window.start < gapStart) corrected.push({ start: window.start, end: gapStart });
            if (window.end > gapEnd) corrected.push({ start: gapEnd, end: window.end });
        }
    }
    return corrected;
}

function rotationDefined(alt, isKeck) {
    return !(isKeck && alt >= 89.5) && Math.cos(alt * radians) >= 1e-8;
}

function addParallacticAngles(samples, target, latitude, isKeck) {
    const cosLat = Math.cos(latitude * radians);
    const sinLatCosDec = Math.sin(latitude * radians) * Math.cos(target.dec * radians);
    const cosLatSinDec = cosLat * Math.sin(target.dec * radians);
    let previousNegative = null;
    let segment = 0;
    let offset = 0;
    for (const row of samples) {
        if (row.rate === null) {
            row.parallacticAngle = null;
            row.rotationSegment = null;
            previousNegative = null;
            continue;
        }

        const hourAngle = (row.lstHours - target.ra) * 15 * radians;
        const sinH = Math.sin(hourAngle);
        const cosH = Math.cos(hourAngle);
        const negative = sinH < 0;
        if (previousNegative !== null && previousNegative !== negative) {
            // At either meridian sin(H) changes sign. Check for an exclusion between samples.
            const upper = cosH > 0;
            const meridianAlt = upper ? 90 - Math.abs(latitude - target.dec) : Math.abs(latitude + target.dec) - 90;
            const meridianX = upper ? sinLatCosDec - cosLatSinDec : sinLatCosDec + cosLatSinDec;
            if (!rotationDefined(meridianAlt, isKeck)) previousNegative = null;
            // Only the negative x-axis is an atan2 wrap, even for fast near-zenith transits.
            else if (meridianX < 0) offset += negative ? 360 : -360;
        }
        if (previousNegative === null) {
            segment++;
            offset = 0;
        }
        row.parallacticAngle = Math.atan2(cosLat * sinH, sinLatCosDec - cosLatSinDec * cosH) / radians + offset;
        row.rotationSegment = segment;
        previousNegative = negative;
    }
}

export function intervalRotation(samples, firstIndex, secondIndex) {
    if (!Number.isInteger(firstIndex) || !Number.isInteger(secondIndex)) return null;
    const start = samples[Math.min(firstIndex, secondIndex)];
    const end = samples[Math.max(firstIndex, secondIndex)];
    if (!start || !end || start.rotationSegment == null || start.rotationSegment !== end.rotationSegment) return null;
    return end.parallacticAngle - start.parallacticAngle;
}

export function computeNight(raHours, decDegrees, dateISO, latitude = keckLatitude, longitude = keckLongitude) {
    const isKeck = Math.abs(latitude - keckLatitude) < 0.02 && Math.abs(longitude - keckLongitude) < 0.02;
    const observer = new Astronomy.Observer(latitude, longitude, isKeck ? 4000 : 0);
    const midnightHour = isKeck ? 10 : (24 - longitude / 15) % 24;
    const midnight = Astronomy.MakeTime(new Date(Date.parse(dateISO + 'T00:00:00Z') + Math.round(midnightHour * 3600000)));
    const {sunsetTime, sunriseTime} = nightBounds(midnight, observer);
    const duration = sunriseTime - sunsetTime;
    const sampleStep = 30;
    const ephemerisStep = 300;

    // A distant star gives the apparent direction of the input J2000 coordinates.
    // Its precession, nutation and aberration change negligibly over one night.
    Astronomy.DefineStar('Star1', raHours, decDegrees, 1000000);
    const center = Astronomy.MakeTime(new Date((sunsetTime + duration / 2) * 1000));
    const target = Astronomy.Equator('Star1', center, observer, true, true);
    const previousTransit = Astronomy.SearchHourAngle('Star1', observer, 0, center, -1).time;
    const nextTransit = Astronomy.SearchHourAngle('Star1', observer, 0, center, 1).time;
    // The nearest upper transit also falls inside the symmetric window whenever one does.
    const transit = center.ut - previousTransit.ut <= nextTransit.ut - center.ut ? previousTransit : nextTransit;
    const transitTime = transit.date.getTime() / 1000;
    const transitLstHours = localSiderealHours(transit, longitude);

    const sky = [];
    for (let i = 0; i <= Math.ceil(duration / ephemerisStep); i++) {
        sky.push(ephemeris(sunsetTime + i * ephemerisStep, observer));
    }

    function sampleAt(time) {
        const offset = time - sunsetTime;
        if (!Number.isFinite(time) || offset < 0 || offset > duration) return null;
        const astroTime = Astronomy.MakeTime(new Date(time * 1000));
        const lstHours = localSiderealHours(astroTime, longitude);
        const horizon = Astronomy.Horizon(astroTime, observer, target.ra, target.dec);
        const alt = horizon.altitude;
        const az = horizon.azimuth;
        const visibility = isKeck ? keckVisibility(alt, az) : (alt >= 0 ? 2 : 0);

        // Interpolate topocentric vectors to preserve RA wraps and close passes.
        const index = Math.min(Math.floor(offset / ephemerisStep), sky.length - 2);
        const left = sky[index];
        const right = sky[index + 1];
        const f = offset / ephemerisStep - index;
        const sun = Astronomy.EquatorFromVector(interpolateVector(left.sun, right.sun, f, astroTime));
        const sunAlt = Astronomy.Horizon(astroTime, observer, sun.ra, sun.dec).altitude;
        const moon = interpolateVector(left.moon, right.moon, f, astroTime);
        const moonEquator = Astronomy.EquatorFromVector(moon);
        const moonAlt = Astronomy.Horizon(astroTime, observer, moonEquator.ra, moonEquator.dec).altitude;
        const moonSep = Astronomy.AngleBetween(target.vec, moon);

        // Signed dq/dt for parallactic angle measured north through east.
        const rate = rotationDefined(alt, isKeck) ? -siderealRate * Math.cos(latitude * radians) * Math.cos(az * radians) / Math.cos(alt * radians) : null;
        return { time, lstHours, az, alt, rate, visibility, sunAlt, moonSep, moonAlt };
    }

    const samples = [];
    let minMoonSep = Infinity;
    for (let i = 0; i <= Math.ceil(duration / sampleStep); i++) {
        const row = sampleAt(Math.min(sunsetTime + i * sampleStep, sunriseTime));
        samples.push(row);
        minMoonSep = Math.min(minMoonSep, row.moonSep);
    }
    const windows = observingWindows(samples, isKeck, latitude, target.dec, transitTime);
    const visibleHours = windows.reduce((seconds, window) => seconds + (window.end - window.start), 0) / 3600;
    addParallacticAngles(samples, target, latitude, isKeck);
    return { samples, sampleAt, windows, visibleHours, minMoonSep, isKeck, transitTime, transitLstHours, sunsetTime, sunriseTime };
}
