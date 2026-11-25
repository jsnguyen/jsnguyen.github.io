// Visible time left tonight, shown beside the total while the current time is shown on today's plot.
export function createRemainingTime(value, windows, nowToggle) {
    const listeners = new AbortController();
    const options = {signal: listeners.signal};
    const total = value.textContent;
    let isToday = false;
    let timer;

    function refresh() {
        clearTimeout(timer);
        value.textContent = total;
        if (!isToday || !nowToggle.checked) return;
        const now = Date.now() / 1000;
        const seconds = windows.reduce((sum, window) => sum + Math.max(0, window.end - Math.max(window.start, now)), 0);
        value.textContent = total + ' (' + (seconds / 3600).toFixed(2) + ' h left)';
        if (seconds > 0 && !document.hidden) timer = setTimeout(refresh, 1000);
    }

    nowToggle.addEventListener('change', refresh, options);
    document.addEventListener('visibilitychange', refresh, options);
    return {
        setToday(today) {
            isToday = today;
            refresh();
        },
        destroy() {
            clearTimeout(timer);
            listeners.abort();
        }
    };
}
