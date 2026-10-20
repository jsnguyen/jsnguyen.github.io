(() => {
    const nav = document.querySelector(".floating-nav");
    if (!nav) return;

    const track = nav.querySelector(".floating-nav__track");
    const indicator = nav.querySelector(".floating-nav__indicator");
    const links = [...nav.querySelectorAll(".floating-nav__link")];
    const sections = links.map(link => document.getElementById(link.hash.slice(1)));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeIndex = -1;
    let position = 0;
    let velocity = 0;
    let destination = 0;
    let squeeze = 0;
    let squeezeVelocity = 0;
    let frame = 0;
    let previousTime = 0;

    function drawIndicator() {
        const pinch = reducedMotion.matches ? 0 : Math.max(-0.18, Math.min(squeeze, 1));
        indicator.style.transform = `translateX(${position}px) scale(${1 + pinch * 0.12}, ${1 - pinch * 0.42})`;
    }

    function animateIndicator(time) {
        const elapsed = Math.min((time - previousTime) / 1000 || 1 / 60, 0.032);
        previousTime = time;

        // Small steps keep the spring steady, including when a click changes its destination.
        const gap = Math.max(1, links[1].offsetLeft - links[0].offsetLeft);
        const steps = Math.ceil(elapsed / 0.008);
        const step = elapsed / steps;
        for (let index = 0; index < steps; index += 1) {
            velocity += ((destination - position) * 420 - velocity * 27) * step;
            position += velocity * step;

            // Each gap acts like a narrower opening; the shape spring pops back after passing it.
            const squeezeTarget = Math.sin(Math.PI * (position - links[0].offsetLeft) / gap) ** 6;
            squeezeVelocity += ((squeezeTarget - squeeze) * 1100 - squeezeVelocity * 30) * step;
            squeeze += squeezeVelocity * step;
        }
        if (Math.abs(destination - position) < 0.08 && Math.abs(velocity) < 0.08 && Math.abs(squeeze) < 0.001 && Math.abs(squeezeVelocity) < 0.01) {
            position = destination;
            velocity = 0;
            squeeze = 0;
            squeezeVelocity = 0;
            frame = 0;
        } else {
            frame = requestAnimationFrame(animateIndicator);
        }
        drawIndicator();
    }

    function moveIndicator(instant = false) {
        const link = links[activeIndex];
        destination = link.offsetLeft;
        indicator.style.width = `${link.offsetWidth}px`;
        if (instant || reducedMotion.matches) {
            cancelAnimationFrame(frame);
            frame = 0;
            position = destination;
            velocity = 0;
            squeeze = 0;
            squeezeVelocity = 0;
            drawIndicator();
        } else if (!frame) {
            previousTime = performance.now();
            frame = requestAnimationFrame(animateIndicator);
        }
    }

    function resetScroll() {
        window.scrollTo({ top: 0, behavior: "instant" });
    }

    function selectPanel(index, options = {}) {
        const section = sections[index];
        if (!section) return;
        const changed = index !== activeIndex;
        const previous = sections[activeIndex];
        const hiddenFocus = changed && previous?.contains(document.activeElement);
        activeIndex = index;
        links.forEach((link, linkIndex) => {
            const selected = linkIndex === index;
            link.setAttribute("aria-selected", String(selected));
            link.tabIndex = selected ? 0 : -1;
            if (sections[linkIndex]) sections[linkIndex].hidden = !selected;
        });
        if (options.updateHistory && window.location.hash !== links[index].hash) history.pushState(null, "", links[index].hash);
        if (options.focusPanel || hiddenFocus) section.focus({ preventScroll: true });
        if (changed) {
            resetScroll();
            requestAnimationFrame(resetScroll);
            section.parentElement.dispatchEvent(new CustomEvent("cardchange", { detail: { previous, current: section, instant: options.instant } }));
        }
        moveIndicator(options.instant);
    }

    document.addEventListener("click", event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest("a[href]");
        if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
        if (link.origin !== window.location.origin || link.pathname !== window.location.pathname || link.search !== window.location.search) return;
        const index = links.findIndex(tab => tab.hash === link.hash);
        if (index < 0 || !sections[index]) return;
        event.preventDefault();
        selectPanel(index, { updateHistory: true, focusPanel: !nav.contains(link) });
    });

    links.forEach((link, index) => {
        link.addEventListener("keydown", event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const lastIndex = links.length - 1;
            const nextIndex = { ArrowRight: (index + 1) % links.length, ArrowLeft: (index + lastIndex) % links.length, Home: 0, End: lastIndex, Enter: index, " ": index }[event.key];
            if (nextIndex === undefined) return;
            event.preventDefault();
            selectPanel(nextIndex, { updateHistory: true });
            links[nextIndex].focus({ preventScroll: true });
        });
    });

    function syncHash() {
        const index = links.findIndex(link => link.hash === window.location.hash);
        if (index >= 0) selectPanel(index);
        else if (!window.location.hash) selectPanel(0);
    }

    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    window.addEventListener("resize", () => moveIndicator(true));
    reducedMotion.addEventListener("change", () => moveIndicator(true));
    if ("ResizeObserver" in window) new ResizeObserver(() => moveIndicator(true)).observe(track);

    const initialHash = window.location.hash;
    const initialIndex = links.findIndex(link => link.hash === window.location.hash);
    selectPanel(initialIndex < 0 ? 0 : initialIndex, { instant: true });
    if (initialIndex >= 0) window.addEventListener("load", () => {
        if (window.location.hash === initialHash) resetScroll();
    }, { once: true });
})();
