# Smart Safety Vest — Command Dashboard (Web)

Premium web dashboard for the **Smart Safety Vest** project. It reads live worker
data from the **Firebase Realtime Database** (written by the Phase 6 gateway
firmware) and shows:

- Real-time worker activity/status (Standing / Walking / Running / Lying / Fall)
- Live temperature, humidity and atmospheric pressure (BME280)
- Battery voltage & remaining charge
- Interactive map with the worker's live GPS position (Leaflet + OpenStreetMap)
- Fall / SOS / environmental-danger alerts with sound + banner + ack
- Temperature & humidity history charts
- Firebase Auth sign-in (Phase 6.7 / 7.1)

## Files

| File | Purpose |
|---|---|
| `index.html` | Dashboard markup |
| `css/styles.css` | Premium dark theme |
| `js/config.example.js` | Firebase config template (copy to `config.js`) |
| `js/config.js` | Local config (gitignored) — **demo mode by default** |
| `js/app.js` | Dashboard logic (auth, live data, map, charts, alerts) |

## Setup

1. Open the dashboard locally or deploy it as a static site
   (`python3 -m http.server 8000` inside `web-dashboard/`).
2. Copy `js/config.example.js` to `js/config.js`.
3. Fill in your Firebase web-app config (console → Project settings → Your apps).
4. Set `demoMode: false` once the Phase 6 gateway is running.

> `js/config.js` is gitignored so real keys are never committed.

## Demo Mode

`config.js` ships with `demoMode: true`, which shows a **simulated worker**
(walking/running, random sensor values, a simulated fall + SOS a few seconds
in) — no Firebase account needed. Use it to preview the UI immediately.

## Data Model

The dashboard binds to this Firebase layout (written by the gateway firmware):

```
devices/<deviceId>/
  status          "NORMAL" | "SOS" | "FALL" | "DANGER" | "LOW_BATTERY"
  statusCode      0..4
  activity        "STANDING" | "WALKING" | "RUNNING" | "LYING"
  latitude, longitude
  temperature, humidity, pressure
  batteryVoltage, batteryPercent
  rssi, snr
  lastSeen        server timestamp

alerts/<pushId>/
  deviceId, type ("FALL"|"SOS"|"DANGER"|"LOW_BATTERY"),
  latitude, longitude, timestamp, acknowledged
```

Phase 6 provides status/location/link data; Phase 9 adds environment, activity
and battery fields to the same nodes (the dashboard renders them automatically).
