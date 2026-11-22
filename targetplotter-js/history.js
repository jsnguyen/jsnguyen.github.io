const storageKey = 'targetplotter-js.recentTargets';
const limit = 15;

function validTarget(target) {
    return target && [target.name, target.ra, target.dec].every(value => typeof value === 'string' && value.trim());
}

function sameTarget(left, right) {
    if (left.name === right.name) return true;
    return left.name.toLowerCase() === right.name.toLowerCase() && left.ra === right.ra && left.dec === right.dec;
}

export function createTargetHistory(list, onSelect) {
    let records = [];
    let isNew = true;
    let storage;
    try {
        storage = window.localStorage;
    } catch {
        // Storage can be disabled; keep history for this page session.
    }

    function readStored() {
        if (!storage) return;
        let raw;
        try {
            raw = storage.getItem(storageKey);
            isNew = raw === null;
        } catch {
            storage = null;
            return;
        }
        try {
            const loaded = JSON.parse(raw);
            records = Array.isArray(loaded) ? loaded.filter(validTarget).slice(0, limit).map(record => ({...record, verified: record.verified === true})) : [];
        } catch {
            records = [];
        }
    }

    function save() {
        isNew = false;
        if (storage) {
            try {
                storage.setItem(storageKey, JSON.stringify(records));
            } catch {
                storage = null;
            }
        }
        render();
    }

    function render() {
        const focused = document.activeElement;
        const focusedRow = list.contains(focused) ? focused.closest('li') : null;
        const previousIndex = Array.from(list.children).indexOf(focusedRow);
        const items = records.map(record => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = record.name;
            button.title = `${record.name} · RA ${record.ra}, Dec ${record.dec}`;
            button.addEventListener('click', () => onSelect({...record}));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'remove-target';
            remove.textContent = '×';
            remove.title = `Remove ${record.name} from recent targets`;
            remove.setAttribute('aria-label', remove.title);
            remove.addEventListener('click', () => {
                readStored();
                records = records.filter(target => !sameTarget(target, record));
                save();
            });
            item.append(button, remove);
            return item;
        });
        list.replaceChildren(...items);
        if (focusedRow) {
            const sameRow = items.find(item => item.firstElementChild.textContent === focusedRow.firstElementChild.textContent);
            const nextRow = sameRow || items[Math.min(previousIndex, items.length - 1)];
            let next = document.querySelector('#target_name_input');
            if (nextRow) next = focused.classList.contains('remove-target') ? nextRow.lastElementChild : nextRow.firstElementChild;
            next?.focus({preventScroll: true});
        }
    }

    readStored();
    render();
    window.addEventListener('storage', event => {
        if (storage && event.storageArea === storage && (event.key === storageKey || event.key === null)) {
            readStored();
            render();
        }
    });

    return {
        get size() { return records.length; },
        get isNew() { return isNew; },
        find(name) {
            const record = records.find(target => target.name === name);
            return record && {...record};
        },
        remember(name, ra, dec, verified = false) {
            const target = {name, ra, dec, verified: verified === true};
            if (!validTarget(target)) return;
            target.name = name.trim();
            readStored();
            records = [target, ...records.filter(record => !sameTarget(target, record))].slice(0, limit);
            save();
            list.scrollTop = 0;
        }
    };
}
