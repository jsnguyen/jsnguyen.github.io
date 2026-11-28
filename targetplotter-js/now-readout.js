// Follows the current time each second while it is inside the plot, for the readout when the cursor is off the graph.
export function createNowReadout(times, show) {
    const listeners = new AbortController();
    const first = times[0];
    const last = times.at(-1);
    let timer;

    function refresh() {
        clearTimeout(timer);
        if (listeners.signal.aborted) return;
        const nowMs = Date.now();
        const now = Math.floor(nowMs / 1000);
        show(now >= first && now <= last ? now : null);
        if (document.hidden || now > last) return;
        const delay = now < first ? Math.min(Math.ceil(first) * 1000 - nowMs, 3600000) : 1000 - nowMs % 1000;
        timer = setTimeout(refresh, Math.max(1, Math.ceil(delay)));
    }

    document.addEventListener('visibilitychange', refresh, {signal: listeners.signal});
    return {
        refresh,
        destroy() {
            clearTimeout(timer);
            listeners.abort();
        }
    };
}
