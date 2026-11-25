const offsets = {PST: -8, PDT: -7, HST: -10, UTC: 0};
const formatters = new Map();

function zoneFormatter(zone) {
    if (!formatters.has(zone)) {
        try {
            const options = {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short'};
            formatters.set(zone, new Intl.DateTimeFormat('en-US', options));
        } catch (error) {
            if (!(error instanceof RangeError)) throw error;
            formatters.set(zone, null);
        }
    }
    return formatters.get(zone);
}

export function formatClock(unixSeconds, zone = 'UTC') {
    if (!Object.hasOwn(offsets, zone)) {
        const formatter = zoneFormatter(zone);
        if (formatter) {
            const parts = Object.fromEntries(formatter.formatToParts(Math.round(unixSeconds) * 1000).map(({type, value}) => [type, value]));
            return {date: parts.year.padStart(4, '0') + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute + ':' + parts.second, zone: parts.timeZoneName};
        }
        zone = 'UTC';
    }
    const seconds = Math.round(unixSeconds) + offsets[zone] * 3600;
    const iso = new Date(seconds * 1000).toISOString();
    return {date: iso.slice(0, 10), time: iso.slice(11, 19), zone};
}

export function formatClockTime(time, use12Hour = false) {
    if (!use12Hour) return time;
    const hour = Number(time.slice(0, 2));
    return (hour % 12 || 12) + time.slice(2) + (hour < 12 ? ' AM' : ' PM');
}

export function formatEventTime(unixSeconds, zone, showDates = false, use12Hour = false) {
    if (unixSeconds == null) return '—';
    const clock = formatClock(unixSeconds, zone);
    return (showDates ? clock.date + ' ' : '') + formatClockTime(clock.time, use12Hour) + ' ' + clock.zone;
}

export function formatTimeRange(start, end, zone) {
    const first = formatClock(start, zone);
    const last = formatClock(end, zone);
    const startZone = first.zone === last.zone ? '' : ' ' + first.zone;
    const endDate = first.date === last.date ? '' : last.date + ' ';
    return first.date + ' ' + first.time + startZone + ' – ' + endDate + last.time + ' ' + last.zone;
}

export function formatLST(hours) {
    const seconds = Math.round(hours * 3600) % 86400;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds / 60) % 60;
    return [h, m, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
