# Laser Closure Tracker

A static web app for uploaded laser clearing-house text files.

Host `index.html`, `styles.css`, `app.js`, `pointing.js`, `keck-scene.js`, and `vendor/` together on any static website. The app parses files locally in the browser; no schedule data is uploaded to a server.

The time-zone selector defaults to the browser-detected time zone and includes a curated list of common IANA time zones. Pacific time (`America/Los_Angeles`) automatically labels schedule times as `PST` or `PDT` depending on the date.

The 3D view (`keck-scene.js`, built on the vendored three.js 0.187.0) shows the laser on only while the current time is inside an open window for the selected target. Keck II points at the target's altitude and azimuth from Mauna Kea, computed in `pointing.js` from the RA and Dec in the target header.
