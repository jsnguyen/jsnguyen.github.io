// Starlist tab beside the recent targets, imported from a Keck-format starlist file.
// Each line holds a name, RA (hh mm ss.ss), Dec (dd mm ss.s), equinox and optional keywords.
// https://www2.keck.hawaii.edu/observing/starlist.html
const storageKey = 'targetplotter-js.starlist';
const sexagesimal = String.raw`\d{1,2}[\s:]+\d{1,2}[\s:]+\d{1,2}(?:\.\d*)?`;
const linePattern = new RegExp(String.raw`^(.+)\s+(${sexagesimal})\s+([+\-−]?${sexagesimal})(?:\s|$)`);

function validTarget(target) {
    return target && [target.name, target.ra, target.dec].every(value => typeof value === 'string' && value.trim());
}

function count(number, noun) {
    return `${number} ${noun}${number === 1 ? '' : 's'}`;
}

function parseStarlist(text) {
    const targets = [];
    let skipped = 0;
    for (const line of text.split(/\r?\n/)) {
        const content = line.replace(/#.*/, '').trim();
        if (!content) continue;
        const match = linePattern.exec(content);
        if (!match) {
            skipped++;
            continue;
        }
        const [name, ra, dec] = match.slice(1).map(value => value.trim().replace(/[\s:]+/g, ' '));
        targets.push({name, ra, dec});
    }
    return {targets, skipped};
}

export function createStarlist(historyList, onSelect) {
    let storage;
    try {
        storage = window.localStorage;
    } catch {
        // Storage can be disabled; keep the starlist for this page session.
    }
    let starlist = readStored();

    const header = document.createElement('div');
    header.className = 'target-list-header';
    const tabs = document.createElement('div');
    tabs.className = 'target-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Target lists');
    const list = document.createElement('ul');
    list.id = 'starlist';
    const historyTab = addTab('history_tab', 'History', historyList);
    const starlistTab = addTab('starlist_tab', 'Starlist', list);
    const importButton = addAction('Import', 'Import a Keck-format starlist file');
    const clearButton = addAction('Clear', 'Remove the imported starlist');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.hidden = true;
    header.prepend(tabs);
    header.append(fileInput);
    document.querySelector('#target_history_label').replaceWith(header);
    historyList.after(list);

    function readStored() {
        try {
            const stored = JSON.parse(storage?.getItem(storageKey) ?? 'null');
            if (stored && typeof stored.file === 'string' && Array.isArray(stored.targets)) return {...stored, targets: stored.targets.filter(validTarget)};
        } catch {
            // Ignore an unreadable starlist.
        }
        return null;
    }

    function save() {
        try {
            if (starlist) storage?.setItem(storageKey, JSON.stringify(starlist));
            else storage?.removeItem(storageKey);
        } catch {
            // A full or disabled storage keeps the starlist for this page session.
        }
    }

    function addTab(id, text, panel) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.id = id;
        tab.textContent = text;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', id);
        tab.addEventListener('click', () => select(tab));
        tabs.append(tab);
        return tab;
    }

    function addAction(text, title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'starlist-action';
        button.textContent = text;
        button.title = title;
        header.append(button);
        return button;
    }

    function select(tab) {
        for (const [each, panel] of [[historyTab, historyList], [starlistTab, list]]) {
            each.setAttribute('aria-selected', each === tab);
            panel.hidden = each !== tab;
        }
    }

    function render() {
        const targets = starlist?.targets || [];
        starlistTab.title = starlist ? `${starlist.file}: ${count(targets.length, 'target')}, ${count(starlist.skipped, 'line')} skipped` : '';
        clearButton.hidden = !starlist;
        list.dataset.empty = starlist ? `No targets found in ${starlist.file}` : 'No starlist imported';
        list.replaceChildren(...targets.map(target => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = target.name;
            button.title = `${target.name} · RA ${target.ra}, Dec ${target.dec}`;
            button.addEventListener('click', () => onSelect({...target}));
            item.append(button);
            return item;
        }));
    }

    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        starlist = {file: file.name, ...parseStarlist(await file.text())};
        save();
        render();
        select(starlistTab);
    });
    clearButton.addEventListener('click', () => {
        starlist = null;
        save();
        render();
        select(historyTab);
    });

    render();
    select(starlist?.targets.length ? starlistTab : historyTab);
}
