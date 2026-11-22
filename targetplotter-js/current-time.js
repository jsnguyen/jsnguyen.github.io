export function createCurrentTimeMarker(plots, times, checkbox, onInspect) {
    const listeners = new AbortController();
    const options = {signal: listeners.signal};
    const first = times[0];
    const last = times.at(-1);
    let pinned = false;
    let timer;
    const markers = plots.map((plot, index) => {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'plot-now-marker';
        marker.setAttribute('aria-label', 'Inspect current time');
        marker.title = 'Inspect current time';
        if (index === 0) {
            const label = document.createElement('span');
            label.textContent = 'Now';
            marker.append(label);
        }
        plot.over.append(marker);

        // Keep native touch scrolling. A drag or canceled tap should leave the readout alone.
        let down = null;
        let dragged = false;
        function checkMovement(event) {
            const threshold = event.pointerType === 'touch' ? 6 : 3;
            if (down && Math.max(Math.abs(event.clientX - down.x), Math.abs(event.clientY - down.y)) >= threshold) dragged = true;
        }
        marker.addEventListener('pointerdown', event => {
            dragged = !event.isPrimary || event.button !== 0;
            down = {x: event.clientX, y: event.clientY};
        }, options);
        marker.addEventListener('pointermove', checkMovement, options);
        marker.addEventListener('pointerup', event => {
            checkMovement(event);
            down = null;
        }, options);
        marker.addEventListener('pointercancel', () => {
            dragged = true;
            down = null;
        }, options);
        marker.addEventListener('click', event => {
            event.stopPropagation();
            if (event.detail && dragged) return;
            if (marker.hidden) return;
            pinned = true;
            refresh();
        }, options);
        return marker;
    });

    function unpin() {
        if (!pinned) return;
        pinned = false;
        onInspect(null);
    }

    function refresh() {
        clearTimeout(timer);
        if (listeners.signal.aborted) return;
        const nowMs = Date.now();
        const now = Math.floor(nowMs / 1000);
        const visible = checkbox.checked && now >= first && now <= last;
        const percent = 100 * (now - first) / (last - first);
        markers.forEach(marker => {
            marker.hidden = !visible;
            if (visible) marker.style.left = percent + '%';
        });
        // Anchor the badge inside the plot at either edge and center it at mid-window.
        if (visible) markers[0].firstElementChild.style.transform = 'translateX(-' + percent + '%)';
        if (!visible) unpin();
        else if (pinned) onInspect(now);
        if (!checkbox.checked || document.hidden || now > last) return;
        const delay = now < first ? Math.min(Math.ceil(first) * 1000 - nowMs, 3600000) : 1000 - nowMs % 1000;
        timer = setTimeout(refresh, Math.max(1, Math.ceil(delay)));
    }

    checkbox.addEventListener('change', refresh, options);
    document.addEventListener('visibilitychange', refresh, options);
    refresh();
    return {
        refresh,
        isPinned() { return pinned; },
        unpin,
        destroy() {
            clearTimeout(timer);
            listeners.abort();
            pinned = false;
            markers.forEach(marker => marker.remove());
        }
    };
}
