(() => {
    const content = document.getElementById("content");
    if (!content) return;

    const panels = [...content.querySelectorAll("[role=\"tabpanel\"]")];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let running = null;

    function finishTransition() {
        if (!running) return;
        const transition = running;
        running = null;
        transition.animation.cancel();
        transition.current.classList.remove("card-deck__incoming");
    }

    content.addEventListener("cardchange", event => {
        const { previous, current, instant } = event.detail;
        finishTransition();
        if (!previous || previous === current || instant || reducedMotion.matches || typeof current.animate !== "function") return;

        const steps = panels.indexOf(current) - panels.indexOf(previous);
        const offset = -Math.sign(steps) * Math.min(32, current.clientWidth * 0.08);
        current.classList.add("card-deck__incoming");
        const animation = current.animate([{ transform: `translateX(${offset}px)` }, { transform: "translateX(0)" }], { duration: 360, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" });
        const transition = { current, animation };
        running = transition;
        animation.finished.then(() => {
            if (running === transition) finishTransition();
        }, () => {});
    });

    window.addEventListener("resize", finishTransition);
    reducedMotion.addEventListener("change", finishTransition);
})();
