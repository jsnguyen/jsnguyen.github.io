(function (global) {
  "use strict";

  const DAY = 86400;
  const FALLBACK_ZONE = "America/Los_Angeles";
  const state = { schedule: null, targetId: "", date: "", zone: FALLBACK_ZONE, timer: null };
  const TZ_GROUPS = {
    Common: ["UTC", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York"],
    Americas: [
      "America/Vancouver",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      "America/Toronto",
      "America/Mexico_City",
      "America/Bogota",
      "America/Lima",
      "America/Santiago",
      "America/Argentina/Buenos_Aires",
      "America/Sao_Paulo",
    ],
    Europe: [
      "Europe/London",
      "Europe/Dublin",
      "Europe/Lisbon",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Amsterdam",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Zurich",
      "Europe/Stockholm",
      "Europe/Athens",
      "Europe/Helsinki",
    ],
    "Africa and Middle East": ["Africa/Cairo", "Africa/Johannesburg", "Asia/Jerusalem", "Asia/Dubai"],
    Asia: [
      "Asia/Kolkata",
      "Asia/Bangkok",
      "Asia/Singapore",
      "Asia/Hong_Kong",
      "Asia/Shanghai",
      "Asia/Tokyo",
      "Asia/Seoul",
      "Asia/Taipei",
    ],
    Oceania: ["Australia/Perth", "Australia/Adelaide", "Australia/Brisbane", "Australia/Sydney", "Pacific/Auckland"],
  };

  const $ = (id) => document.getElementById(id);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  const setText = (id, value) => {
    const node = $(id);
    if (node) node.textContent = value;
  };

  function timeToSeconds(value) {
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
  }

  function secondsToUtcClock(seconds) {
    const value = ((Math.floor(seconds) % DAY) + DAY) % DAY;
    return `${pad(Math.floor(value / 3600))}:${pad(Math.floor((value % 3600) / 60))}:${pad(value % 60)}`;
  }

  function formatDuration(totalSeconds) {
    if (!Number.isFinite(totalSeconds)) return "--";
    const sign = totalSeconds < 0 ? "-" : "";
    const seconds = Math.max(0, Math.round(Math.abs(totalSeconds)));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours) return `${sign}${hours} hr ${pad(minutes)} min ${pad(rest)} sec`;
    if (minutes) return `${sign}${minutes} min ${pad(rest)} sec`;
    return `${sign}${rest} sec`;
  }

  function inferDateFromFileName(fileName) {
    const matches = [...String(fileName || "").matchAll(/(\d{6})(?!.*\d)/g)];
    if (!matches.length) return "";
    const digits = matches.at(-1)[1];
    const fullYear = Number(digits.slice(0, 2)) >= 70 ? `19${digits.slice(0, 2)}` : `20${digits.slice(0, 2)}`;
    const date = `${fullYear}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
    return dateToUtcMs(date) === null ? "" : date;
  }

  const todayUtcDate = () => new Date().toISOString().slice(0, 10);

  function dateToUtcMs(dateString) {
    const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, year, month, day] = match.map(Number);
    const ms = Date.UTC(year, month - 1, day);
    const date = new Date(ms);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? ms
      : null;
  }

  function targetHeader(line) {
    const text = line.trim();
    const coords = text.match(
      /^(.*?)\s+\d{1,2}\s+\d{1,2}\s+\d+(?:\.\d+)?\s+[+-]\d{1,2}\s+\d{1,2}\s+\d+(?:\.\d+)?(.*)$/
    );
    if (coords && coords[1].trim()) {
      return { name: coords[1].replace(/\s+/g, " ").trim(), detail: text.slice(coords[1].length).replace(/\s+/g, " ").trim() };
    }
    const parts = text.split(/\s{2,}/);
    return { name: (parts[0] || text).replace(/\s+/g, " ").trim(), detail: parts.slice(1).join(" ").trim() };
  }

  function withClosures(target) {
    let dayOffset = 0;
    let previousStart = -Infinity;
    const opens = target.opens.map((open) => {
      while (open.startSec + dayOffset * DAY < previousStart - 3600) dayOffset += 1;
      const startSec = open.startSec + dayOffset * DAY;
      const endSec = open.endSec + dayOffset * DAY + (open.endSec < open.startSec ? DAY : 0);
      previousStart = startSec;
      return { ...open, startSec, endSec };
    });
    const closures = opens.flatMap((open, index) => {
      const duration = Number.isFinite(open.closureSec) ? open.closureSec : opens[index + 1]?.startSec - open.endSec;
      return Number.isFinite(duration) && duration > 0
        ? [{ index: index + 1, startSec: open.endSec, endSec: open.endSec + duration, durationSec: duration }]
        : [];
    });
    return { ...target, opens, closures: closures.map((closure, index) => ({ ...closure, index: index + 1 })) };
  }

  function parseSchedule(text, fileName = "") {
    const targets = [];
    let current = null;
    const interval =
      /^\s*(\d{1,2}:\d{2}:\d{2})\s+(\d{1,2}:\d{2}:\d{2})\s+open\(min:sec\)\s+(\d+):(\d{2})(?:\s+Closure\(sec\)\s+(\d+))?/i;

    String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .forEach((line, lineIndex) => {
        const match = line.match(interval);
        if (match && current) {
          current.opens.push({
            startSec: timeToSeconds(match[1]),
            endSec: timeToSeconds(match[2]),
            openDurationSec: Number(match[3]) * 60 + Number(match[4]),
            closureSec: match[5] === undefined ? null : Number(match[5]),
            line: lineIndex + 1,
          });
          return;
        }

        const text = line.trim();
        if (!text || /^UT\s+Start/i.test(text) || /^First\s+\d+\s+objects:/i.test(text)) return;
        const header = targetHeader(line);
        current = { id: `target-${targets.length}`, line: lineIndex + 1, name: header.name, detail: header.detail, opens: [] };
        targets.push(current);
      });

    const parsedTargets = targets.map(withClosures).filter((target) => target.opens.length);
    if (!parsedTargets.length) throw new Error("No target windows were found in this file.");
    return { fileName, inferredDate: inferDateFromFileName(fileName), targets: parsedTargets };
  }

  function detectedZone() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_ZONE;
    return validZone(zone) ? zone : FALLBACK_ZONE;
  }

  function validZone(zone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  function populateZones(select, detected) {
    select.innerHTML = "";
    const seen = new Set();
    const addOption = (parent, zone) => {
      if (seen.has(zone) || !validZone(zone)) return;
      seen.add(zone);
      parent.append(new Option(zone, zone));
    };
    if (!Object.values(TZ_GROUPS).some((zones) => zones.includes(detected))) {
      const group = document.createElement("optgroup");
      group.label = "Browser time zone";
      addOption(group, detected);
      select.append(group);
    }
    Object.entries(TZ_GROUPS).forEach(([label, zones]) => {
      const group = document.createElement("optgroup");
      group.label = label;
      zones.forEach((zone) => addOption(group, zone));
      select.append(group);
    });
    state.zone = seen.has(detected) ? detected : FALLBACK_ZONE;
    select.value = state.zone;
  }

  function zonedParts(ms, zone = state.zone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
    return Object.fromEntries(formatter.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  }

  function formatInZone(ms, zone = state.zone, includeDate = true) {
    if (!Number.isFinite(ms)) return "--";
    const parts = zonedParts(ms, zone);
    const date = includeDate ? `${parts.year}-${parts.month}-${parts.day} ` : "";
    const hour = parts.hour === "24" ? "00" : parts.hour;
    return `${date}${hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`;
  }

  function formatDateInZone(ms, zone = state.zone) {
    if (!Number.isFinite(ms)) return "--";
    const parts = zonedParts(ms, zone);
    return `${parts.year}-${parts.month}-${parts.day} ${parts.timeZoneName}`;
  }

  function formatUtc(ms) {
    const date = new Date(ms);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(
      date.getUTCMinutes()
    )}:${pad(date.getUTCSeconds())} UTC`;
  }

  function selectedTarget() {
    return state.schedule?.targets.find((target) => target.id === state.targetId) || state.schedule?.targets[0] || null;
  }

  function analyze(target, nowMs) {
    const baseMs = dateToUtcMs(state.date);
    if (!target || !Number.isFinite(baseMs)) return null;
    const addMs = (window) => ({ ...window, startMs: baseMs + window.startSec * 1000, endMs: baseMs + window.endSec * 1000 });
    const opens = target.opens.map(addMs);
    const closures = target.closures.map(addMs);
    const active = closures.find((closure) => nowMs >= closure.startMs && nowMs < closure.endMs) || null;
    const next = closures.find((closure) => closure.startMs > nowMs) || null;
    const lastEnd = Math.max(opens.at(-1)?.endMs ?? -Infinity, closures.at(-1)?.endMs ?? -Infinity);
    const totalSec = closures.reduce((sum, closure) => sum + closure.durationSec, 0);
    return {
      opens,
      closures,
      active,
      next,
      activeClosure: active,
      nextClosure: next,
      startMs: opens[0]?.startMs,
      endMs: lastEnd,
      scheduleStartMs: opens[0]?.startMs,
      scheduleEndMs: lastEnd,
      totalSec,
      totalClosureSec: totalSec,
    };
  }

  function optionList(select, options, placeholder) {
    select.innerHTML = "";
    if (!options.length) {
      select.disabled = true;
      select.append(new Option(placeholder, ""));
      return;
    }
    select.disabled = false;
    options.forEach(([label, value]) => select.append(new Option(label, value)));
  }

  function renderTargets() {
    optionList(
      $("targetSelect"),
      state.schedule?.targets.map((target) => [`${target.name} (${target.closures.length} closures)`, target.id]) || [],
      "No targets loaded"
    );
    $("targetSelect").value = state.targetId;
  }

  function renderTimeline(analysis, nowMs) {
    const timeline = $("timeline");
    timeline.innerHTML = "";
    if (!analysis?.opens.length) {
      timeline.append(Object.assign(document.createElement("div"), { className: "timeline-empty", textContent: "No schedule loaded" }));
      return;
    }

    const spanMs = Math.max(1, analysis.endMs - analysis.startMs);
    const track = Object.assign(document.createElement("div"), { className: "timeline-track" });
    const band = (className, startMs, endMs, title = "") => {
      const node = document.createElement("div");
      node.className = className;
      node.title = title;
      node.style.left = `${Math.max(0, ((startMs - analysis.startMs) / spanMs) * 100)}%`;
      node.style.width = `${Math.max(0.18, ((endMs - startMs) / spanMs) * 100)}%`;
      track.append(node);
    };

    analysis.opens.forEach((open) => band("open-band", open.startMs, open.endMs, `Open ${formatInZone(open.startMs)} to ${formatInZone(open.endMs)}`));
    analysis.closures.forEach((closure) => {
      const cls = ["closure-band", closure === analysis.active ? "active" : "", closure === analysis.next ? "next" : ""].filter(Boolean).join(" ");
      band(cls, closure.startMs, closure.endMs, `Closure ${formatInZone(closure.startMs)} to ${formatInZone(closure.endMs)}`);
    });
    if (nowMs >= analysis.startMs && nowMs <= analysis.endMs) band("now-marker", nowMs, nowMs + 1);

    const axis = Object.assign(document.createElement("div"), { className: "axis" });
    axis.append(span(formatInZone(analysis.startMs, state.zone, false)), span(formatInZone(analysis.endMs, state.zone, false)));
    track.append(axis);
    timeline.append(track);
  }

  const span = (text) => Object.assign(document.createElement("span"), { textContent: text });
  const cell = (text) => Object.assign(document.createElement("td"), { textContent: text });

  function renderRows(analysis) {
    const tbody = $("closureRows");
    tbody.innerHTML = "";
    if (!analysis?.closures.length) {
      const row = document.createElement("tr");
      const empty = cell("No closures found for this target.");
      empty.colSpan = 6;
      row.append(empty);
      tbody.append(row);
      return;
    }

    analysis.closures.forEach((closure) => {
      const row = document.createElement("tr");
      if (closure === analysis.active) row.className = "active-row";
      if (closure === analysis.next) row.className = "next-row";
      row.append(
        cell(closure.index),
        cell(formatInZone(closure.startMs)),
        cell(formatInZone(closure.endMs)),
        cell(formatDuration(closure.durationSec)),
        cell(formatUtc(closure.startMs)),
        cell(formatUtc(closure.endMs))
      );
      tbody.append(row);
    });
  }

  function render() {
    const nowMs = Date.now();
    const target = selectedTarget();
    const analysis = analyze(target, nowMs);

    setText("nowDisplay", formatInZone(nowMs, state.zone, false));
    setText("nowDate", formatDateInZone(nowMs));
    setText("targetName", target?.name || "No target selected");
    setText("targetDetail", target?.detail || "--");
    setText("tableMeta", analysis ? `${analysis.closures.length} closures, ${formatDuration(analysis.totalSec)} total.` : "--");
    document.querySelector("laser-animation")?.setAttribute("laser-state", analysis?.active ? "off" : "on");
    renderTimeline(analysis, nowMs);
    renderRows(analysis);

    if (!analysis) return renderSummary("Next closure in", "--", "--", "--", "--", "--");
    if (analysis.active) {
      return renderSummary(
        "Current closure ends in",
        formatDuration((analysis.active.endMs - nowMs) / 1000),
        "Closure is active now.",
        "Active now",
        `Started ${formatInZone(analysis.active.startMs)}.`,
        formatDuration(analysis.active.durationSec),
        `Ends at ${formatInZone(analysis.active.endMs)}.`
      );
    }
    if (analysis.next) {
      return renderSummary(
        "Next closure in",
        formatDuration((analysis.next.startMs - nowMs) / 1000),
        "Next listed closure for the selected target.",
        formatInZone(analysis.next.startMs, state.zone, false),
        `UTC ${secondsToUtcClock(analysis.next.startSec)}.`,
        formatDuration(analysis.next.durationSec),
        `Ends at ${formatInZone(analysis.next.endMs)}.`
      );
    }
    return renderSummary("Next closure", "None left", "No later closures remain in this UT schedule.", "None left", "--", "--", "--");
  }

  function renderSummary(label, countdown, detail, start, startDetail, duration, durationDetail = "--") {
    setText("nextCountdownLabel", label);
    setText("nextCountdown", countdown);
    setText("nextDetail", detail);
    setText("nextValue", start);
    setText("nextStartDetail", startDetail);
    setText("durationValue", duration);
    setText("durationDetail", durationDetail);
  }

  function setTheme(theme) {
    const isDark = theme !== "light";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    $("themeToggle").textContent = isDark ? "Light mode" : "Dark mode";
    $("themeToggle").setAttribute("aria-pressed", String(isDark));
    localStorage.setItem("laserClosureTheme", isDark ? "dark" : "light");
    document.querySelector("laser-animation")?.redraw();
  }

  function applySchedule(schedule, fileName) {
    state.schedule = schedule;
    state.targetId = schedule.targets[0].id;
    state.date = schedule.inferredDate || todayUtcDate();
    $("scheduleDate").disabled = false;
    $("scheduleDate").value = state.date;
    setText("fileName", fileName || "Uploaded schedule");
    setText("fileMeta", `${schedule.targets.length} targets loaded${schedule.inferredDate ? `; date inferred as ${schedule.inferredDate} UT` : ""}.`);
    renderTargets();
    render();
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applySchedule(parseSchedule(String(reader.result || ""), file.name), file.name);
      } catch (error) {
        state.schedule = null;
        state.targetId = "";
        setText("fileName", file.name);
        setText("fileMeta", error.message || "Could not parse this file.");
        renderTargets();
        render();
      }
    };
    reader.readAsText(file);
  }

  function init() {
    setTheme(localStorage.getItem("laserClosureTheme") || "dark");
    populateZones($("zoneSelect"), detectedZone());
    $("themeToggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
    $("chooseFile").addEventListener("click", () => $("fileInput").click());
    $("fileInput").addEventListener("change", () => $("fileInput").files[0] && readFile($("fileInput").files[0]));
    $("targetSelect").addEventListener("change", (event) => {
      state.targetId = event.target.value;
      render();
    });
    $("scheduleDate").addEventListener("change", (event) => {
      state.date = event.target.value || todayUtcDate();
      render();
    });
    $("zoneSelect").addEventListener("change", (event) => {
      state.zone = event.target.value;
      render();
    });

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      $("dropZone").addEventListener(eventName, (event) => {
        event.preventDefault();
        $("dropZone").classList.toggle("dragging", eventName === "dragenter" || eventName === "dragover");
        if (eventName === "drop" && event.dataTransfer.files[0]) readFile(event.dataTransfer.files[0]);
      });
    });

    state.timer = setInterval(render, 1000);
    render();
  }

  global.LaserClosureTracker = { analyzeTarget: (target, date, now) => ((state.date = date), analyze(target, now)), formatDuration, inferDateFromFileName, parseSchedule, secondsToUtcClock, timeToSeconds };
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
})(typeof window !== "undefined" ? window : globalThis);
