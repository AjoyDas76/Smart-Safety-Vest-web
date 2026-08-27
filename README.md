# Phase-07 Mobile Application

## Objective

Build the supervisor monitoring application that displays the Smart Safety Vest data in real time on a mobile device. The app is a mobile-first, PWA-style web application that reads live data from Firebase (written by the Phase 6 IoT cloud module).

## Components

- Mobile web app (HTML/CSS/JS) - opens in any phone browser
- Firebase Realtime Database (data source)
- Leaflet.js (live GPS map)
- Firebase Auth (email/password login)

## Features / Sub-steps

| Step | Feature | Implementation |
|------|---------|----------------|
| 7.1 | User Authentication | Email/password sign-in via Firebase Auth (`js/app.js`) |
| 7.2 | Dashboard (Live Data) | Live sensor cards (temp/humidity/pressure/battery) |
| 7.3 | Live Worker Status | Status hero (NORMAL / FALL / SOS) with color coding |
| 7.4 | Live GPS Tracking | Leaflet map with live worker marker |
| 7.5 | Emergency Alerts | Alert banner + alert history list |
| 7.6 | Notification System | Browser notifications + vibration on status change |
| 7.7 | App Testing & Optimization | Responsive layout, lazy history loading, error handling |
| 7.8 | Mobile App Finalization | Installable (manifest.json), theme-colored, offline-friendly |

## Files

| File | Description |
|------|-------------|
| `index.html` | Single-page app shell (login + 4 tabs) |
| `css/style.css` | Mobile-first responsive styles |
| `js/app.js` | Firebase auth, live data listeners, map, alerts, notifications |
| `js/firebase-config.js` | **Firebase config placeholder - fill in your values** |
| `manifest.json` | PWA install manifest |
| `firebase.rules.json` | Realtime Database security rules |

## Setup

1. Complete Phase 6 (IoT Cloud) so data is flowing into Firebase.
2. Register a web app in the Firebase console.
3. Copy its `firebaseConfig` into `js/firebase-config.js`.
4. Open `index.html` in a phone browser (or host it).
5. Sign in with a Firebase Auth email/password user.
6. (Optional) Add the app to the home screen for fullscreen PWA mode.

## Security Rules

The included `firebase.rules.json` restricts:
- Workers can only write under `/devices/<their-uid>`.
- Supervisors can read all device data.
- History writes are device-scoped.
- Alerts are readable by authenticated users.

## Test Results

- Live sensor values update within seconds of the vest upload.
- Fall/SOS alerts trigger an immediate banner, browser notification, and vibration.
- Worker marker tracks the live GPS location on the map.

## Notes

- `FIREBASE_CONFIG` in `js/firebase-config.js` must be replaced with real values; never commit real keys.
- The app reads from the Phase 6 database schema (`/devices/<deviceId>/...`).
- Hosting the static files on Firebase Hosting or GitHub Pages makes the app shareable.
