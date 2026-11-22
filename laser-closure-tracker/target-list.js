(function () {
  "use strict";

  function init() {
    const select = document.getElementById("targetSelect");
    const button = document.getElementById("targetButton");
    const popup = document.getElementById("targetPopup");
    const list = document.getElementById("targetList");
    if (!select || !button || !popup || !list) return;
    let scrubbing = false;

    const items = () => [...list.querySelectorAll("[role=option]")];
    const itemAt = (x, y) => document.elementFromPoint(x, y)?.closest("#targetList [role=option]");
    const isOpen = () => !popup.hidden;

    function mark(scroll) {
      items().forEach((item) => {
        const selected = item.dataset.value === select.value;
        item.setAttribute("aria-selected", String(selected));
        if (selected) list.setAttribute("aria-activedescendant", item.id);
        if (selected && scroll) list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2;
      });
    }

    function choose(item) {
      if (!item || item.dataset.value === select.value) return;
      select.value = item.dataset.value;
      select.dispatchEvent(new Event("change"));
      mark(false);
      item.scrollIntoView({ block: "nearest" });
    }

    function open() {
      if (button.disabled) return;
      popup.hidden = false;
      button.setAttribute("aria-expanded", "true");
      mark(true);
      list.focus({ preventScroll: true });
    }

    function close(focusButton = false) {
      if (!isOpen()) return;
      popup.hidden = true;
      button.setAttribute("aria-expanded", "false");
      if (focusButton) button.focus();
    }

    function build() {
      list.innerHTML = "";
      const options = [...select.options].filter((option) => option.value);
      button.disabled = !options.length;
      if (!options.length) close();
      options.forEach((option, index) => {
        const match = option.text.match(/^(.*) \((\d+) closures?\)$/);
        const item = Object.assign(document.createElement("div"), { id: `target-option-${index}` });
        item.setAttribute("role", "option");
        item.dataset.value = option.value;
        item.append(
          Object.assign(document.createElement("span"), { className: "target-name", textContent: match ? match[1] : option.text }),
          Object.assign(document.createElement("span"), { className: "target-count", textContent: match ? match[2] : "" })
        );
        list.append(item);
      });
      mark(false);
    }

    button.addEventListener("click", () => (isOpen() ? close() : open()));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      open();
    });

    list.addEventListener("click", (event) => {
      const item = event.target.closest("[role=option]");
      if (!item) return;
      choose(item);
      close(true);
    });
    list.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !event.target.closest("[role=option]")) return;
      scrubbing = true;
      choose(event.target.closest("[role=option]"));
    });
    window.addEventListener("pointermove", (event) => {
      if (!scrubbing) return;
      const rect = list.getBoundingClientRect();
      if (event.clientY < rect.top + 12) list.scrollTop -= 14;
      if (event.clientY > rect.bottom - 12) list.scrollTop += 14;
      const x = Math.min(rect.right - 4, Math.max(rect.left + 4, event.clientX));
      const y = Math.min(rect.bottom - 4, Math.max(rect.top + 4, event.clientY));
      choose(itemAt(x, y));
    });
    window.addEventListener("pointerup", () => (scrubbing = false));
    document.addEventListener("pointerdown", (event) => {
      if (isOpen() && !popup.contains(event.target) && !button.contains(event.target)) close();
    });

    list.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") {
        if (event.key !== "Tab") event.preventDefault();
        return close(event.key !== "Tab");
      }
      const all = items();
      const index = all.findIndex((item) => item.dataset.value === select.value);
      const page = Math.max(1, Math.floor(list.clientHeight / (all[0]?.offsetHeight || 30)));
      const next = { ArrowDown: index + 1, ArrowUp: index - 1, PageDown: index + page, PageUp: index - page, Home: 0, End: all.length - 1 }[event.key];
      if (next === undefined || !all.length) return;
      event.preventDefault();
      choose(all[Math.max(0, Math.min(all.length - 1, next))]);
    });

    new MutationObserver(build).observe(select, { childList: true });
    build();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
