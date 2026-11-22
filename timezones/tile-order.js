export function setupTileOrder(grid, onReorder) {
    let drag;
    let frame;

    function tileAt(element) {
        const tile = element?.closest('article.clock-tile');
        return tile?.parentElement === grid ? tile : null;
    }

    function move(tile, target) {
        const forward = tile.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING;
        grid.insertBefore(tile, forward ? target.nextElementSibling : target);
        onReorder();
    }

    function showTarget() {
        const {tile, x, y, startX, startY, scrollY} = drag;
        tile.style.translate = (x - startX) + 'px ' + (y - startY + window.scrollY - scrollY) + 'px';
        const target = tileAt(document.elementFromPoint(x, y));
        if (target === drag.target) return;
        drag.target?.classList.remove('tile-drop-target');
        drag.target = target;
        target?.classList.add('tile-drop-target');
    }

    function scrollAtEdge() {
        frame = null;
        const y = drag.y;
        const step = y < 50 ? -Math.ceil((50 - y) / 4) : Math.ceil(Math.max(0, y + 50 - window.innerHeight) / 4);
        if (!step) return;
        const previous = window.scrollY;
        window.scrollBy(0, step);
        if (previous === window.scrollY) return;
        showTarget();
        frame = requestAnimationFrame(scrollAtEdge);
    }

    function finish(commit) {
        if (!drag) return;
        const {tile, target, id} = drag;
        drag = null;
        cancelAnimationFrame(frame);
        frame = null;
        target?.classList.remove('tile-drop-target');
        tile.classList.remove('tile-dragging');
        tile.style.removeProperty('translate');
        if (grid.hasPointerCapture(id)) grid.releasePointerCapture(id);
        if (commit && tile.parentElement === grid && target?.parentElement === grid) move(tile, target);
    }

    grid.addEventListener('pointerdown', event => {
        if (drag || !event.isPrimary || event.button !== 0) return;
        const tile = tileAt(event.target);
        if (!tile || event.target.closest('a, button, input, select, textarea, label, details, [contenteditable]')) return;
        if (event.pointerType !== 'mouse' && !event.target.closest('header')) return;
        event.preventDefault();
        drag = {tile, id: event.pointerId, startX: event.clientX, startY: event.clientY, scrollY: window.scrollY};
        grid.setPointerCapture(event.pointerId);
    });

    grid.addEventListener('pointermove', event => {
        if (drag?.id !== event.pointerId) return;
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (!drag.started) {
            if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
            drag.started = true;
            drag.tile.classList.add('tile-dragging');
        }
        showTarget();
        if (!frame) frame = requestAnimationFrame(scrollAtEdge);
    });

    grid.addEventListener('pointerup', event => {
        if (drag?.id !== event.pointerId) return;
        if (drag.started) {
            drag.x = event.clientX;
            drag.y = event.clientY;
            showTarget();
        }
        finish(true);
    });
    grid.addEventListener('pointercancel', event => { if (drag?.id === event.pointerId) finish(false); });
    grid.addEventListener('lostpointercapture', event => { if (drag?.id === event.pointerId) finish(false); });
    window.addEventListener('blur', () => finish(false));
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && drag) finish(false);
    });

    grid.addEventListener('keydown', event => {
        const tile = tileAt(event.target);
        if (!tile || event.target !== tile || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const target = event.key === 'ArrowLeft' ? tile.previousElementSibling : tile.nextElementSibling;
        if (tileAt(target)) {
            move(tile, target);
            tile.focus();
        }
    });
}
