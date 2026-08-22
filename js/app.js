/* ============================================================
   Smart Safety Vest — Command Dashboard (app.js)
   - Firebase Auth + Realtime Database (compat SDK)
   - Optional demo mode with a simulated worker
   - Live map (Leaflet), charts (Chart.js), alerts feed
   ============================================================ */

(function () {
  'use strict';

  // ---------- configuration ----------
  const CFG = window.FIREBASE_CONFIG || { demoMode: true };
  const DEVICE_ID = new URLSearchParams(location.search).get('device') || '1';
  const DB_PATH = 'devices/' + DEVICE_ID;
  const ALERT_SOUND_TYPES = ['FALL', 'SOS', 'DANGER'];
  const CHART_POINTS = 40;

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    overlay: $('login-overlay'), app: $('app'),
    loginForm: $('login-form'), loginEmail: $('login-email'),
    loginPassword: $('login-password'), loginError: $('login-error'),
    demoLogin: $('demo-login'), logoutBtn: $('logout-btn'),
    userEmail: $('user-email'),
    connStatus: $('connection-status'), connText: $('connection-text'),
    clock: $('clock'),
    alertBanner: $('alert-banner'), alertBannerText: $('alert-banner-text'),
    ackBanner: $('ack-banner'),
    activity: $('activity-badge'), workerOnline: $('worker-online'),
    flagFall: $('flag-fall'), flagSos: $('flag-sos'),
    flagDanger: $('flag-danger'), flagBattery: $('flag-battery'),
    temp: $('sensor-temp'), hum: $('sensor-hum'), pres: $('sensor-pres'),
    batt: $('sensor-batt'), battFill: $('battery-fill'), battLabel: $('battery-label'),
    trendTemp: $('trend-temp'), trendHum: $('trend-hum'), trendPres: $('trend-pres'),
    coords: $('coords'), alertsList: $('alerts-list'),
    clearAlerts: $('clear-alerts'),
  };

  // ---------- state ----------
  let firebaseApp = null;
  let db = null;
  let map = null;
  let workerMarker = null;
  let accuracyCircle = null;
  let lastLat = null, lastLng = null;
  let unackedBanner = null;
  const recentAlerts = [];

  // ---------- audio beep (Web Audio) ----------
  let audioCtx = null;
  function beep(freq = 880, ms = 260, times = 2) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < times; i++) {
        const t = audioCtx.currentTime + i * (ms / 1000) * 1.6;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
        osc.start(t); osc.stop(t + ms / 1000);
      }
    } catch (e) { /* audio not available */ }
  }

  // ---------- clock ----------
  function tickClock() {
    const d = new Date();
    el.clock.textContent = d.toLocaleTimeString('en-GB');
  }
  setInterval(tickClock, 1000);
  tickClock();

  // ============================================================
  //  Firebase (real) + demo (simulated) unified behind an
  //  interface of onWorker(callback) / onAlerts(callback)
  // ============================================================

  function initFirebase() {
    if (CFG.demoMode) {
      el.connText.textContent = 'Demo Mode';
      el.connStatus.classList.add('online');
      return;
    }
    firebaseApp = firebase.initializeApp({
      apiKey: CFG.apiKey, authDomain: CFG.authDomain,
      databaseURL: CFG.databaseURL, projectId: CFG.projectId,
      storageBucket: CFG.storageBucket,
      messagingSenderId: CFG.messagingSenderId, appId: CFG.appId,
    });
    db = firebase.database();
  }

  function watchWorker(callback) {
    if (CFG.demoMode) { startDemo(callback); return; }
    db.ref(DB_PATH).on('value', (snap) => callback(snap.val() || {}));
    db.ref(DB_PATH + '/lastSeen').on('value', () => {
      el.connStatus.classList.add('online');
      el.connText.textContent = 'Live';
    });
  }

  function watchAlerts(callback) {
    if (CFG.demoMode) return; // demo worker drives its own alerts
    db.ref('alerts').orderByChild('timestamp').limitToLast(30)
      .on('child_added', (snap) => callback(snap.key, snap.val()));
  }

  // ============================================================
  //  Render helpers
  // ============================================================

  const activityClass = (a) => {
    if (['FALL', 'FALL DETECTED'].includes(a)) return 'danger';
    if (['LYING', 'LEFT LEAN', 'RIGHT LEAN', 'FORWARD LEAN', 'BACKWARD LEAN', 'SOS'].includes(a)) return 'warn';
    return '';
  };

  function setFlag(flagEl, on, warn) {
    flagEl.classList.toggle(warn ? 'warn-on' : 'on', on);
  }

  function fmtTime(epoch) {
    if (!epoch) return '—';
    const d = new Date(epoch);
    return d.toLocaleTimeString('en-GB');
  }

  function renderWorker(data) {
    // ---- activity / status ----
    let activity = (data.activity || '—').toUpperCase();
    let statusText = (data.status || 'NORMAL').toUpperCase();
    if (statusText === 'FALL' || statusText === 'SOS' || statusText === 'DANGER') {
      activity = statusText;
    }
    el.activity.textContent = activity;
    el.activity.className = 'activity-badge ' + activityClass(activity);

    const lastSeen = data.lastSeen;
    el.workerOnline.textContent = lastSeen
      ? 'Online · last update ' + fmtTime(lastSeen)
      : 'Waiting for first packet…';

    // ---- safety flags ----
    setFlag(el.flagFall, statusText === 'FALL');
    setFlag(el.flagSos, statusText === 'SOS');
    setFlag(el.flagDanger, statusText === 'DANGER');
    setFlag(el.flagBattery, (data.batteryPercent != null && data.batteryPercent <= 15) || statusText === 'LOW_BATTERY', true);

    // ---- sensors ----
    const setSensor = (id, val, decimals, na = '--') => {
      const node = $(id);
      node.textContent = (val == null || isNaN(val) || val < -999) ? na : Number(val).toFixed(decimals);
    };
    setSensor('sensor-temp', data.temperature, 1);
    setSensor('sensor-hum', data.humidity, 0);
    setSensor('sensor-pres', data.pressure, 1);
    setSensor('sensor-batt', data.batteryVoltage, 2);

    // ---- trend hints ----
    setTrend(el.trendTemp, data.temperature, { high: 40, low: 0 });
    setTrend(el.trendHum, data.humidity, { high: 85 });
    setTrend(el.trendPres, data.pressure, { low: 970 });

    // ---- battery bar ----
    let bp = data.batteryPercent;
    if (bp != null && !isNaN(bp)) {
      el.battFill.style.width = Math.max(0, Math.min(100, bp)) + '%';
      el.battFill.classList.toggle('low', bp <= 15);
      el.battLabel.textContent = bp <= 15 ? 'LOW BATTERY — charge required' : bp + '% remaining';
    }

    // ---- map ----
    updateMap(data.latitude, data.longitude, statusText);
  }

  function setTrend(node, val, { high = null, low = null } = {}) {
    if (val == null || isNaN(val)) { node.textContent = '—'; node.className = 'trend'; return; }
    if (high != null && val > high) { node.textContent = 'HIGH / dangerous'; node.className = 'trend alert'; return; }
    if (low != null && val < low) { node.textContent = 'LOW / dangerous'; node.className = 'trend alert'; return; }
    node.textContent = 'within safe range'; node.className = 'trend';
  }

  // ============================================================
  //  Map
  // ============================================================

  function initMap() {
    map = L.map('map', { zoomControl: true }).setView([23.685, 90.356], 13); // Dhaka default
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    workerMarker = L.marker([23.685, 90.356], {
      icon: L.divIcon({ className: '', html: '<div class="worker-marker"></div>', iconSize: [22, 22] }),
    }).addTo(map).bindPopup('<b>Worker ' + DEVICE_ID + '</b><br>No GPS fix yet');
  }

  function updateMap(lat, lng, status) {
    const valid = (lat != null && lng != null && !isNaN(lat) && !isNaN(lng) && Math.abs(lat) > 0.000001);
    if (!valid) {
      el.coords.textContent = 'Waiting for GPS fix…';
      return;
    }
    const danger = ['FALL', 'SOS', 'DANGER'].includes(status);
    workerMarker.setLatLng([lat, lng]);
    workerMarker.setIcon(L.divIcon({
      className: '', html: '<div class="worker-marker' + (danger ? ' danger' : '') + '"></div>', iconSize: [22, 22],
    }));
    workerMarker.setPopupContent('<b>Worker ' + DEVICE_ID + '</b><br>' + status);
    el.coords.textContent = lat.toFixed(6) + ', ' + lng.toFixed(6) + '  (' + (danger ? 'ALERT' : 'normal') + ')';

    if (lastLat == null || Math.abs(lat - lastLat) > 0.0005 || Math.abs(lng - lastLng) > 0.0005) {
      map.setView([lat, lng], Math.max(map.getZoom(), 15));
    }
    if (accuracyCircle) { map.removeLayer(accuracyCircle); }
    accuracyCircle = L.circle([lat, lng], { radius: 15, color: danger ? '#f87171' : '#22d3ee', fillOpacity: 0.08 }).addTo(map);

    lastLat = lat; lastLng = lng;
  }

  // ============================================================
  //  Alerts
  // ============================================================

  function addAlert(key, alert) {
    const type = (alert.type || 'INFO').toUpperCase();
    const item = document.createElement('li');
    item.className = 'alert-item ' + type.toLowerCase();
    item.innerHTML =
      '<span class="type">' + type + '</span>' +
      '<span>Worker ' + alert.deviceId +
      (alert.latitude ? ' · ' + Number(alert.latitude).toFixed(4) + ', ' + Number(alert.longitude).toFixed(4) : '') +
      '</span><span class="time">' + fmtTime(alert.timestamp) + '</span>';
    el.alertsList.prepend(item);

    const empty = el.alertsList.querySelector('.alert-empty');
    if (empty) empty.remove();
    while (el.alertsList.children.length > 30) el.alertsList.lastChild.remove();

    if (ALERT_SOUND_TYPES.includes(type)) {
      beep(type === 'FALL' ? 520 : 920);
      showBanner(type, alert, key);
      showToast(type, alert);
    }
  }

  function showBanner(type, alert, key) {
    unackedBanner = { type, key };
    el.alertBanner.classList.remove('hidden');
    el.alertBanner.classList.add('critical');
    el.alertBannerText.textContent =
      (type === 'FALL' ? '⚠ FALL DETECTED' : type === 'SOS' ? '🚨 SOS EMERGENCY' : '⚠ ENVIRONMENTAL DANGER') +
      ' — Worker ' + alert.deviceId + ' requires attention!';
  }

  function showToast(type, alert) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<span class="toast-ico">' +
      (type === 'FALL' ? '🛑' : type === 'SOS' ? '🚨' : '⚠️') +
      '</span><span><b>' + type + '</b> alert for worker ' + alert.deviceId + '</span>';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }

  function acknowledgeBanner() {
    el.alertBanner.classList.add('hidden');
    el.alertBanner.classList.remove('critical');
    if (unackedBanner && !CFG.demoMode) {
      db.ref('alerts/' + unackedBanner.key + '/acknowledged').set(true).catch(() => {});
    }
    unackedBanner = null;
  }

  // ============================================================
  //  Charts
  // ============================================================

  function makeChart(canvasId, label, color) {
    return new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: { labels: [], datasets: [{
        label, data: [], borderColor: color, backgroundColor: color + '22',
        fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
      }] },
      options: {
        responsive: true, animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9ca3af', font: { size: 10 } } },
        },
      },
    });
  }

  const charts = {
    temp: makeChart('chart-temp', 'Temperature °C', '#22d3ee'),
    hum: makeChart('chart-hum', 'Humidity %', '#818cf8'),
  };

  function pushChart(chart, value, label) {
    if (value == null || isNaN(value)) return;
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(Number(value));
    if (chart.data.labels.length > CHART_POINTS) {
      chart.data.labels.shift(); chart.data.datasets[0].data.shift();
    }
    chart.update();
  }

  function onWorkerSample(data) {
    const t = new Date().toLocaleTimeString('en-GB');
    pushChart(charts.temp, data.temperature, t);
    pushChart(charts.hum, data.humidity, t);
  }

  // ============================================================
  //  Demo simulation
  // ============================================================
  function startDemo(onWorker) {
    let lat = 23.6850, lng = 90.3560, step = 0;
    const worker = {
      deviceId: Number(DEVICE_ID), status: 'NORMAL',
      activity: 'STANDING', latitude: lat, longitude: lng,
      temperature: 25, humidity: 55, pressure: 1013,
      batteryVoltage: 3.9, batteryPercent: 82,
      rssi: -92, snr: 6.5,
    };
    const push = () => {
      step++;
      const t = Date.now();
      worker.lastSeen = t;
      onWorker({ ...worker });
      onWorkerSample(worker);
      if (CFG.demoMode) { el.connText.textContent = 'Demo Mode'; el.connStatus.classList.add('online'); }
    };
    push(); // immediate first sample so the UI populates right away
    setInterval(() => {
      // simple random-walk simulation
      lat += (Math.random() - 0.5) * 0.0009;
      lng += (Math.random() - 0.5) * 0.0009;
      worker.latitude = lat; worker.longitude = lng;
      worker.temperature = 24 + Math.random() * 3 + Math.sin(step / 20);
      worker.humidity = 52 + Math.random() * 10;
      worker.pressure = 1010 + Math.random() * 6;
      const states = ['STANDING', 'STANDING', 'WALKING', 'WALKING', 'RUNNING', 'LYING'];
      worker.activity = states[Math.floor(Math.random() * states.length)];
      worker.batteryVoltage = 3.85 + Math.random() * 0.1;
      worker.batteryPercent = Math.max(0, 82 - step * 0.01);
      worker.rssi = -90 - Math.random() * 8;
      worker.snr = 5 + Math.random() * 4;
      push();
    }, 3000);

    // demo: simulate a fall + SOS alert a few seconds in
    setTimeout(() => {
      worker.status = 'FALL';
      worker.activity = 'FALL';
      push();
      addAlert('demo-fall' + Date.now(), {
        deviceId: Number(DEVICE_ID), type: 'FALL',
        latitude: lat, longitude: lng, timestamp: Date.now(),
      });
      setTimeout(() => { worker.status = 'NORMAL'; worker.activity = 'STANDING'; push(); }, 8000);
    }, 12000);

    setTimeout(() => {
      worker.status = 'SOS';
      push();
      addAlert('demo-sos' + Date.now(), {
        deviceId: Number(DEVICE_ID), type: 'SOS',
        latitude: lat, longitude: lng, timestamp: Date.now(),
      });
      setTimeout(() => { worker.status = 'NORMAL'; push(); }, 8000);
    }, 30000);
  }

  // ============================================================
  //  Auth + boot
  // ============================================================
  function showApp() {
    el.overlay.classList.add('hidden');
    el.app.classList.remove('hidden');
  }

  async function signIn(email, password) {
    el.loginError.textContent = '';
    if (CFG.demoMode) { showApp(); return; }
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
      showApp();
    } catch (err) {
      el.loginError.textContent = err.message || 'Sign-in failed.';
    }
  }

  el.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    signIn(el.loginEmail.value.trim(), el.loginPassword.value);
  });

  el.demoLogin.addEventListener('click', () => { showApp(); });

  el.logoutBtn.addEventListener('click', async () => {
    if (CFG.demoMode) return;
    try { await firebase.auth().signOut(); } catch (e) {}
    location.reload();
  });

  el.ackBanner.addEventListener('click', acknowledgeBanner);
  el.clearAlerts.addEventListener('click', () => {
    el.alertsList.innerHTML = '<li class="alert-empty">No alerts yet</li>';
  });

  // ---------- boot ----------
  window.addEventListener('DOMContentLoaded', () => {
    initFirebase();

    if (CFG.demoMode) {
      initMap();
      watchWorker(renderWorker);
      showApp();
      return;
    }

    // real Firebase: wait for auth state, then start
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        el.userEmail.textContent = user.email;
        showApp();
        initMap();
        watchWorker(renderWorker);
        watchAlerts((key, a) => addAlert(key, a));
        db.ref('alerts').once('value').then(() => {}).catch(() => {});
      } else {
        el.overlay.classList.remove('hidden');
      }
    });

    // connection monitoring
    const connectedRef = firebase.database().ref('.info/connected');
    connectedRef.on('value', (snap) => {
      if (snap.val() === true) {
        el.connStatus.classList.add('online'); el.connText.textContent = 'Live';
      } else {
        el.connStatus.classList.remove('online'); el.connText.textContent = 'Offline';
      }
    });
  });
})();
