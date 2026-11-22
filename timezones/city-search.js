import {searchCities} from './cities.js';

export function setupCitySearch(form, addCity) {
    const input = form.querySelector('input');
    const list = form.querySelector('[role="listbox"]');
    const status = form.querySelector('[role="status"]');
    let matches = [];
    let active = 0;
    let version = 0;
    let pending;

    function closeList() {
        version++;
        matches = [];
        active = 0;
        list.replaceChildren();
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }

    function highlight(index) {
        list.children[active]?.setAttribute('aria-selected', 'false');
        active = index;
        const option = list.children[active];
        option.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', option.id);
        if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
        if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }

    async function updateMatches() {
        closeList();
        status.textContent = '';
        const query = input.value.trim();
        if (!query) return;
        const request = version;
        let results;
        try {
            results = await searchCities(query);
        } catch {
            if (request === version) status.textContent = 'City search could not load. Try again.';
            return;
        }
        if (request !== version) return;
        matches = results;
        if (!matches.length) {
            status.textContent = 'No matching city.';
            return;
        }
        for (const [index, city] of matches.entries()) {
            const option = document.createElement('li');
            option.id = 'city-match-' + index;
            option.setAttribute('role', 'option');
            option.textContent = city.name;
            const region = document.createElement('small');
            region.textContent = ' ' + city.region;
            option.append(region);
            option.addEventListener('click', () => choose(city));
            list.append(option);
        }
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        highlight(0);
    }

    function choose(city) {
        const added = addCity(city);
        input.value = '';
        closeList();
        input.focus();
        status.textContent = city.name + (added ? ' added.' : ' is already shown.');
    }

    input.addEventListener('input', () => { pending = updateMatches(); });
    input.addEventListener('focus', () => { if (input.value) pending = updateMatches(); });
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeList();
            status.textContent = '';
        }
        if (!matches.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        highlight((active + step + matches.length) % matches.length);
    });
    list.addEventListener('mousedown', event => event.preventDefault());
    form.addEventListener('focusout', event => { if (!form.contains(event.relatedTarget)) closeList(); });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!input.value.trim()) return input.focus();
        if (!pending || (!matches.length && list.hidden)) pending = updateMatches();
        const request = version;
        await pending;
        if (request === version && matches.length) choose(matches[active]);
    });
}
