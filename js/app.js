/* ============================================================
   Smart Safety Vest - Supervisor App Logic
   Consumes the Firebase Realtime Database written by the vest
   (Phase 6). Firebase config in js/firebase-config.js.
   ============================================================ */

'use strict';

let auth = null;
let database = null;
let map = null;
let marker = null;
let currentUser = null;

// Track previously seen status for change detection
let lastStatus = null;
let lastAlertKey = null;

const DEVICE_ID = 'vest-01';

/* ================= Firebase init ================= */

function initFirebase() {
  if (!FIREBASE_CONFIG || FIREBASE_CONFIG.apiKey.indexOf('YOUR_') === 0) {
    showToast('Set your Firebase config in js/firebase-config.js', true);
    return;
  }

  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  database = firebase.database();

  auth.onAuthStateChanged(handleAuthState);
}

/* ================= Auth ================= */

function handleAuthState(user) {
  if (user) {
    currentUser = user;
    showApp();
    initLiveData();
  } else {
    currentUser = null;
    showLogin();
  }
}

function showLogin() {
  document.getElementById('appView').classList.remove('active');
  document.getElementById('loginView').classList.add('active');
}

function showApp() {
  document.getElementById('loginView').classList.remove('active');
  document.getElementById('appView').classList.add('active');
  document.getElementById('userEmail').textContent = currentUser.email;
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');

  errEl.classList.add('hidden');

  if (!email || !password) {
    errEl.textContent = 'Enter email and password';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    errEl.textContent = 'Login failed: ' + e.message;
    errEl.classList.remove('hidden');
  }
}

async function handleLogout() {
  await auth.signOut();
}

/* ================= Live data ================= */

function initLiveData() {
  const base = database.ref('devices/' + DEVICE_ID);

  // Sensors
  base.child('sensors').on('value', snap => {
    const d = snap.val() || {};
    setText('tempValue', d.temperature != null ? d.temperature.toFixed(1) : '--');
    setText('humValue', d.humidity != null ? d.humidity.toFixed(1) : '--');
    setText('presValue', d.pressure != null ? d.pressure.toFixed(1) : '--');
  });

  // Location
  base.child('location').on('value', snap => {
    const d = snap.val() || {};
    if (d.lat && d.lng) {
      setText('gpsLat', d.lat.toFixed(6));
      setText('gpsLng', d.lng.toFixed(6));
      updateMap(d.lat, d.lng);
    }
    if (d.speed != null) setText('gpsSpeed', d.speed.toFixed(1) + ' km/h');
    if (d.timestamp) setText('gpsTime', formatTime(d.timestamp));
  });

  // Battery
  base.child('battery').on('value', snap => {
    const d = snap.val() || {};
    if (d.percent != null) setText('batValue', d.percent);
  });

  // Status
  base.child('status').on('value', snap => {
    const d = snap.val() || {};
    updateHero(d.state || 'NO DATA');
  });

  // Alerts - most recent
  base.child('alerts').on('value', snap => {
    const d = snap.val() || {};
    renderAlerts(base);
    if (d.fall) {
      showAlertBanner('FALL DETECTED - WORKER DOWN');
      notify('Fall Alert', 'A worker fall was detected!');
    } else if (d.sos) {
      showAlertBanner('SOS - WORKER NEEDS HELP');
      notify('SOS Alert', 'A worker pressed SOS!');
    } else {
      hideAlertBanner();
    }
  });

  // Alerts list
  renderAlerts(base);

  // History
  renderHistory();
}

function updateHero(status) {
  const hero = document.getElementById('workerHero');
  const stateEl = hero.querySelector('.hero-status');
  const metaEl = hero.querySelector('.hero-meta');

  stateEl.textContent = status;

  const now = new Date();
  metaEl.textContent = 'Updated ' + now.toLocaleTimeString();

  // Hero styling by state
  if (status === 'FALL') {
    hero.style.background = 'linear-gradient(135deg, var(--danger), #b91c1c)';
  } else if (status === 'SOS') {
    hero.style.background = 'linear-gradient(135deg, var(--warning), #d97706)';
  } else if (status === 'NORMAL') {
    hero.style.background = 'linear-gradient(135deg, var(--success), #16a34a)';
  } else {
    hero.style.background = 'linear-gradient(135deg, var(--primary), var(--primary-dark))';
  }

  // Status change notification
  if (lastStatus && lastStatus !== status &&
      (status === 'FALL' || status === 'SOS')) {
    notify('Worker status changed', 'Worker is now: ' + status);
  }
  lastStatus = status;
}

/* ================= Alerts rendering ================= */

function renderAlerts(base) {
  base.child('alerts').once('value').then(snap => {
    const d = snap.val() || {};
    const list = document.getElementById('alertsList');

    if (!d.timestamp) {
      list.innerHTML = '<div class="empty-state">No alerts yet</div>';
      return;
    }

    const items = [];
    if (d.fall) {
      items.push(alertItemHtml('FALL', d.timestamp, d.lat, d.lng));
    }
    if (d.sos) {
      items.push(alertItemHtml('SOS', d.timestamp, d.lat, d.lng));
    }

    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state">No alerts yet</div>';
    } else {
      list.innerHTML = items.join('');
    }
  });
}

function alertItemHtml(type, timestamp, lat, lng) {
  const cls = type.toLowerCase();
  const loc = (lat && lng)
    ? '<div class="alert-item-meta">' + lat.toFixed(6) + ', ' + lng.toFixed(6) + '</div>'
    : '';
  return '<div class="alert-item ' + cls + '">' +
    '<div class="alert-item-title">' + type + ' Alert</div>' +
    '<div class="alert-item-meta">' + formatTime(timestamp) + '</div>' +
    loc +
    '</div>';
}

/* ================= History rendering ================= */

function renderHistory() {
  database.ref('history/' + DEVICE_ID)
    .orderByKey()
    .limitToLast(50)
    .once('value')
    .then(snap => {
      const list = document.getElementById('historyList');
      const data = snap.val();

      if (!data) {
        list.innerHTML = '<div class="empty-state">No history yet</div>';
        return;
      }

      const keys = Object.keys(data).reverse();
      const html = keys.map(key => {
        const d = data[key];
        const t = (d.temperature != null) ? d.temperature.toFixed(1) + '°C' : '--';
        const h = (d.humidity != null) ? d.humidity.toFixed(0) + '%' : '--';
        return '<div class="alert-item">' +
          '<div class="alert-item-title">' + formatTime(parseInt(key)) + '</div>' +
          '<div class="alert-item-meta">' + t + '  |  ' + h + ' humidity</div>' +
          '</div>';
      }).join('');

      list.innerHTML = html;
    })
    .catch(() => {
      document.getElementById('historyList').innerHTML =
        '<div class="empty-state">Failed to load history</div>';
    });
}

/* ================= Map ================= */

function initMap(lat, lng) {
  if (map) return;

  map = L.map('mapContainer').setView([lat, lng], 17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  marker = L.marker([lat, lng]).addTo(map)
    .bindPopup('Worker location').openPopup();
}

function updateMap(lat, lng) {
  if (!map) {
    initMap(lat, lng);
    return;
  }
  marker.setLatLng([lat, lng]);
  map.panTo([lat, lng]);
}

/* ================= Notifications / toast ================= */

function showToast(message, isError) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.classList.add('hidden'); }, 3500);
}

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: body, icon: '🦺' });
  } else if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showAlertBanner(text) {
  const banner = document.getElementById('alertBanner');
  banner.classList.remove('hidden');
  document.getElementById('alertBannerText').textContent = text;
  // vibrate if supported
  if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
}

function hideAlertBanner() {
  document.getElementById('alertBanner').classList.add('hidden');
}

/* ================= Helpers ================= */

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function formatTime(ts) {
  if (!ts) return '--';
  return new Date(ts * 1000).toLocaleString();
}

/* ================= Tabs ================= */

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

/* ================= Events ================= */

document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);

document.getElementById('loginPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

/* ================= Boot ================= */

initTabs();
initFirebase();
