// Half-night handoff, halfway between sunset and sunrise. Remove this file and its use in sun-times.js to drop it.
export function handoff(place, event, now) {
    if (event.name !== 'Sunrise') return null;
    const observer = new Astronomy.Observer(place.latitude, place.longitude, 0);
    const sunset = Astronomy.SearchRiseSet('Sun', observer, -1, new Date(event.date - 86400000), 1);
    const date = sunset && new Date(Math.floor((sunset.date.getTime() + event.date.getTime()) / 2000) * 1000);
    return date && date > now ? date : null;
}
