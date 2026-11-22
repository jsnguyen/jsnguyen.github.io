(function (global) {
  "use strict";

  const KECK = { lat: 19.8263, lon: -155.4747 };
  const RAD = Math.PI / 180;

  function parseCoords(detail) {
    const match = String(detail || "").match(/^(\d{1,2})\s+(\d{1,2})\s+(\d+(?:\.\d+)?)\s+([+-])(\d{1,2})\s+(\d{1,2})\s+(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const [, rh, rm, rs, sign, dd, dm, ds] = match;
    const ra = (Number(rh) + Number(rm) / 60 + Number(rs) / 3600) * 15;
    const dec = (sign === "-" ? -1 : 1) * (Number(dd) + Number(dm) / 60 + Number(ds) / 3600);
    return { ra, dec };
  }

  function lst(ms) {
    const days = ms / 86400000 + 2440587.5 - 2451545;
    return (((280.46061837 + 360.98564736629 * days + KECK.lon) % 360) + 360) % 360;
  }

  function altAz({ ra, dec }, ms) {
    const ha = (lst(ms) - ra) * RAD;
    const lat = KECK.lat * RAD;
    const d = dec * RAD;
    const alt = Math.asin(Math.sin(d) * Math.sin(lat) + Math.cos(d) * Math.cos(lat) * Math.cos(ha));
    const az = Math.atan2(-Math.cos(d) * Math.sin(ha), Math.sin(d) * Math.cos(lat) - Math.cos(d) * Math.sin(lat) * Math.cos(ha));
    return { alt: alt / RAD, az: ((az / RAD) + 360) % 360 };
  }

  global.KeckPointing = { parseCoords, altAz, lst };
})(typeof window !== "undefined" ? window : globalThis);
