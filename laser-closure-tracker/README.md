# Laser Closure Tracker

A dependency-free static web app for uploaded laser clearing-house text files.

Host `index.html`, `styles.css`, and `app.js` together on any static website. The app parses files locally in the browser; no schedule data is uploaded to a server.

The time-zone selector defaults to the browser-detected time zone and includes a curated list of common IANA time zones. Pacific time (`America/Los_Angeles`) automatically labels schedule times as `PST` or `PDT` depending on the date.
