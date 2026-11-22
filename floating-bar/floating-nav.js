// Include with <script src="floating-nav.js" defer></script>. Edit the section IDs below to retarget the links.
// Set data-motion on the script to "spring" (default), "glide", or "stretch".
(function mountDock(script = document.currentScript) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => mountDock(script), { once: true });
        return;
    }
    if (document.querySelector(".floating-nav")) return;

    const items = [
        { ids: ["intro"], label: "Home", icon: '<path d="m3.5 10 8.5-7 8.5 7v9a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/><path d="M9 21v-8h6v8"/>' },
        { ids: ["tools", "apps"], label: "Apps", icon: '<rect x="3.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.5"/><rect x="14.5" y="14.5" width="6" height="6" rx="1.5"/>' },
        { ids: ["projects", "research"], label: "Research", icon: '<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="11" ry="3.5" transform="rotate(-35 12 12)"/><path d="M19 3v3m-1.5-1.5h3"/>' },
        { ids: ["publications"], label: "Papers", icon: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8m-8 4h5"/>' },
    ];
    const sections = [];
    const nav = document.createElement("nav");
    nav.className = "floating-nav";
    nav.setAttribute("aria-label", "Primary");
    nav.innerHTML = '<div class="floating-nav__track"><span class="floating-nav__indicator" aria-hidden="true"></span></div>';
    const track = nav.querySelector(".floating-nav__track");
    const indicator = nav.querySelector(".floating-nav__indicator");

    for (const item of items) {
        const section = item.ids.map(id => document.getElementById(id)).find(Boolean);
        if (!section) continue;
        sections.push(section);
        const link = document.createElement("a");
        link.className = "floating-nav__link";
        link.href = `#${section.id}`;
        link.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${item.icon}</svg><span>${item.label}</span>`;
        track.append(link);
    }
    if (!sections.length) return;
    const links = [...track.querySelectorAll("a")];
    const tabbed = sections.every(section => section.getAttribute("role") === "tabpanel");

    const style = document.createElement("style");
    style.textContent = `
.floating-nav, .floating-nav-spacer {
    --floating-nav-gap: 24px;
}

@media (max-width: 600px) {
    .floating-nav, .floating-nav-spacer {
        --floating-nav-gap: 16px;
    }
}

.floating-nav {
    position: fixed;
    z-index: 100;
    left: 50%;
    bottom: calc(var(--floating-nav-gap) + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    width: min(480px, calc(100% - 24px));
    box-sizing: border-box;
    padding: 6px;
    border: 1px solid rgba(255, 255, 255, 0.26);
    border-radius: 30px;
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.03)), rgba(32, 28, 50, 0.68);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    backdrop-filter: blur(24px) saturate(160%);
    box-shadow: 0 12px 40px rgba(6, 4, 17, 0.35), 0 2px 6px rgba(6, 4, 17, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.26), inset 0 -1px 0 rgba(255, 255, 255, 0.07);
    font-family: "Stack Sans Text", system-ui, sans-serif;
    -webkit-tap-highlight-color: transparent;
}

.floating-nav__track {
    position: relative;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    isolation: isolate;
}

.floating-nav__indicator {
    position: absolute;
    z-index: -1;
    top: 0;
    left: 0;
    width: 25%;
    height: 100%;
    box-sizing: border-box;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: linear-gradient(150deg, rgba(242, 230, 255, 0.24), rgba(215, 198, 255, 0.1));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 3px 12px rgba(9, 5, 21, 0.12);
    pointer-events: none;
    will-change: transform;
}

.floating-nav__link {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    min-height: 70px;
    border-radius: 22px;
    color: #c0b9d2;
    text-decoration: none;
    font-size: 11px;
    font-weight: 400;
    line-height: 1.3;
    touch-action: manipulation;
    transition: color 160ms ease, background-color 160ms ease;
}

.floating-nav__link:visited {
    color: #c0b9d2;
}

.floating-nav__link + .floating-nav__link::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.16);
    pointer-events: none;
}

.floating-nav__link:is([aria-selected="true"], [aria-current="location"]) {
    color: #ffffff;
}

.floating-nav__link svg {
    width: 21px;
    height: 21px;
    flex-shrink: 0;
    transform-origin: 50% 75%;
    transition: transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.floating-nav__link:is([aria-selected="true"], [aria-current="location"]) svg {
    transform: translateY(-1px) scale(1.08);
}

.floating-nav__link:active svg {
    transform: scale(0.88);
    transition-duration: 90ms;
}

.floating-nav__link:focus-visible {
    outline: 2px solid #e2d5ff;
    outline-offset: -3px;
}

/* Leave room to scroll the page footer above the dock. */
.floating-nav-spacer {
    height: calc(84px + 2 * var(--floating-nav-gap) + env(safe-area-inset-bottom, 0px));
}

@media (hover: hover) {
    .floating-nav__link:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.05);
    }
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .floating-nav {
        background: rgba(42, 36, 61, 0.97);
    }
}

@media (prefers-reduced-motion: reduce) {
    .floating-nav__link, .floating-nav__link svg {
        transition: none;
    }
}
`;
    document.head.append(style);
    // Mount outside the page's scrolling and transformed content.
    document.body.append(nav);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeIndex = -1;
    let tween;

    function moveIndicator(instant = false) {
        const link = links[activeIndex];
        const destination = link.offsetLeft;
        const end = `translateX(${destination}px)`;
        if (!instant && indicator.style.transform === end) return;

        // A second click can arrive mid-tween. Start it at the currently visible position and shape.
        const start = getComputedStyle(indicator).transform;
        tween?.cancel();
        indicator.style.transform = end;
        indicator.style.width = `${link.offsetWidth}px`;
        if (instant || reducedMotion.matches || !indicator.animate) return;

        const from = new DOMMatrixReadOnly(start).m41;
        const distance = destination - from;
        const mode = script?.dataset.motion || "spring";
        const frames = [{ transform: start, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)" }];
        let duration = 300;
        if (mode === "spring") {
            const overshoot = Math.sign(distance) * Math.min(5, Math.abs(distance) * 0.08);
            frames.push({ transform: `translateX(${destination + overshoot}px)`, offset: 0.66, easing: "ease-in-out" });
            duration = 420;
        } else if (mode === "stretch") {
            frames[0].easing = "cubic-bezier(0.38, 0, 0.68, 0.42)";
            frames.push({ transform: `translateX(${from + distance * 0.5}px) scale(1.18, 0.92)`, offset: 0.44, easing: "cubic-bezier(0.24, 0.55, 0.26, 1)" });
            duration = 390;
        }
        frames.push({ transform: end });
        tween = indicator.animate(frames, { duration });
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

    function handlePanelLink(event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest("a[href]");
        if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
        if (link.origin !== window.location.origin || link.pathname !== window.location.pathname || link.search !== window.location.search) return;
        const index = links.findIndex(tab => tab.hash === link.hash);
        if (index < 0 || !sections[index]) return;
        event.preventDefault();
        selectPanel(index, { updateHistory: true, focusPanel: !nav.contains(link) });
    }

    function enableTab(link, index) {
        link.id = `tab-${sections[index].id}`;
        link.setAttribute("role", "tab");
        link.setAttribute("aria-controls", sections[index].id);
        link.addEventListener("keydown", event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const lastIndex = links.length - 1;
            const nextIndex = { ArrowRight: (index + 1) % links.length, ArrowLeft: (index + lastIndex) % links.length, Home: 0, End: lastIndex, Enter: index, " ": index }[event.key];
            if (nextIndex === undefined) return;
            event.preventDefault();
            selectPanel(nextIndex, { updateHistory: true });
            links[nextIndex].focus({ preventScroll: true });
        });
    }

    function syncHash() {
        const index = links.findIndex(link => link.hash === window.location.hash);
        if (index >= 0) selectPanel(index);
        else if (!window.location.hash) selectPanel(0);
    }

    function syncScroll() {
        let index = 0;
        for (let i = 1; i < sections.length; i++) {
            if (sections[i].getBoundingClientRect().top <= window.innerHeight / 4) index = i;
        }
        if (window.scrollY > 0 && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight) index = links.length - 1;
        if (index === activeIndex) return;
        const initial = activeIndex < 0;
        links[activeIndex]?.removeAttribute("aria-current");
        activeIndex = index;
        links[index].setAttribute("aria-current", "location");
        moveIndicator(initial);
    }

    if (tabbed) {
        track.setAttribute("role", "tablist");
        track.setAttribute("aria-label", "Content");
        links.forEach(enableTab);
        document.addEventListener("click", handlePanelLink);
        window.addEventListener("hashchange", syncHash);
        window.addEventListener("popstate", syncHash);
        const initialHash = window.location.hash;
        const initialIndex = links.findIndex(link => link.hash === initialHash);
        selectPanel(initialIndex < 0 ? 0 : initialIndex, { instant: true });
        if (initialIndex >= 0) window.addEventListener("load", () => {
            if (window.location.hash === initialHash) resetScroll();
        }, { once: true });
    } else {
        const spacer = document.createElement("div");
        spacer.className = "floating-nav-spacer";
        spacer.setAttribute("aria-hidden", "true");
        nav.before(spacer);
        window.addEventListener("scroll", syncScroll, { passive: true });
        window.addEventListener("resize", syncScroll);
        syncScroll();
    }

    window.addEventListener("resize", () => moveIndicator(true));
    reducedMotion.addEventListener("change", () => moveIndicator(true));
    if ("ResizeObserver" in window) new ResizeObserver(() => moveIndicator(true)).observe(track);
})();
