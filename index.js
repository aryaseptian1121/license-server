const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());
// Dashboard served inline (no public/ folder needed)

// =====================================================
// DATABASE FILES
// =====================================================
const USERS_FILE = path.join(__dirname, "users.json");
const LICENSES_FILE = path.join(__dirname, "licenses.json");
const LOGS_FILE = path.join(__dirname, "logs.json");

// =====================================================
// INIT DATABASE (AUTO-CREATE IF NOT EXISTS)
// =====================================================
const initDB = () => {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = [
      { id: 1, username: "admin", password: "admin123", role: "admin", createdAt: new Date().toISOString() }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    console.log("[DB] users.json berhasil dibuat otomatis.");
  }

  if (!fs.existsSync(LICENSES_FILE)) {
    const defaultLicenses = [
      {
        key: "ABC-123-FREE",
        type: "free",
        status: "active",
        maxDevices: 1,
        expiresAt: null,
        createdAt: new Date().toISOString()
      },
      {
        key: "RBA-PRO-2025",
        type: "pro",
        status: "active",
        maxDevices: 5,
        expiresAt: "2026-12-31T23:59:59.000Z",
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(defaultLicenses, null, 2));
    console.log("[DB] licenses.json berhasil dibuat otomatis.");
  }

  if (!fs.existsSync(LOGS_FILE)) {
    fs.writeFileSync(LOGS_FILE, JSON.stringify([], null, 2));
    console.log("[DB] logs.json berhasil dibuat otomatis.");
  }
};

// =====================================================
// HELPERS: READ / WRITE JSON
// =====================================================
const readJSON = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
};

const writeJSON = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// =====================================================
// HELPERS: LOGGING
// =====================================================
const addLog = (action, detail, ip = "-") => {
  const logs = readJSON(LOGS_FILE);
  logs.push({
    id: Date.now(),
    action,
    detail,
    ip,
    timestamp: new Date().toISOString()
  });
  // Simpan maksimal 500 log terakhir
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  writeJSON(LOGS_FILE, logs);
};

// =====================================================
// HELPERS: GENERATE LICENSE KEY
// =====================================================
const generateLicenseKey = (type = "free") => {
  const prefix = type === "pro" ? "PRO" : "FREE";
  const rand = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `RBA-${prefix}-${rand}`;
};

// =====================================================
// IN-MEMORY: DEVICE MONITORING
// =====================================================
let devices = {};
// Format: { deviceId: { lastSeen, username, licenseKey, ip } }

// =====================================================
// MIDDLEWARE: API KEY SEDERHANA (OPSIONAL)
// =====================================================
// Uncomment jika ingin proteksi route admin
// const ADMIN_SECRET = process.env.ADMIN_SECRET || "rba-secret-key";
// const requireAdminKey = (req, res, next) => {
//   const key = req.headers["x-admin-key"];
//   if (key !== ADMIN_SECRET) return res.status(403).json({ success: false, message: "Forbidden" });
//   next();
// };

// =====================================================
// ROUTE 1: DASHBOARD (embedded HTML — no public/ folder needed)
// =====================================================
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>RBA Studio — License Server</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --bg:       #080c10;
      --surface:  #0d1117;
      --card:     #111820;
      --border:   #1e2d3d;
      --accent:   #00d4ff;
      --green:    #00ff88;
      --red:      #ff4060;
      --yellow:   #ffd060;
      --muted:    #3d5068;
      --text:     #c9d8e8;
      --text-dim: #5c7a96;
      --font-ui:  'Syne', sans-serif;
      --font-mono:'JetBrains Mono', monospace;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-ui);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* ─── GRID BG ─── */
    body::before {
      content: '';
      position: fixed; inset: 0; z-index: 0;
      background-image:
        linear-gradient(rgba(0,212,255,.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,212,255,.03) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
    }

    /* ─── TOPBAR ─── */
    .topbar {
      position: sticky; top: 0; z-index: 100;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 32px;
      height: 60px;
      background: rgba(8,12,16,.85);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border);
    }
    .logo {
      display: flex; align-items: center; gap: 12px;
      font-size: 18px; font-weight: 800; letter-spacing: -0.5px;
    }
    .logo-icon {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, var(--accent), #0060ff);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 900; color: #fff;
    }
    .badge-online {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 12px;
      background: rgba(0,255,136,.08);
      border: 1px solid rgba(0,255,136,.25);
      border-radius: 20px;
      font-size: 12px; font-weight: 600; color: var(--green);
      font-family: var(--font-mono);
    }
    .badge-online .dot {
      width: 7px; height: 7px;
      background: var(--green);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%,100%{opacity:1;transform:scale(1)}
      50%{opacity:.4;transform:scale(.7)}
    }
    .topbar-right {
      display: flex; align-items: center; gap: 16px;
      font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);
    }
    #clock { color: var(--accent); }

    /* ─── LAYOUT ─── */
    .layout {
      position: relative; z-index: 1;
      max-width: 1400px; margin: 0 auto;
      padding: 28px 32px;
      display: flex; flex-direction: column; gap: 24px;
    }

    /* ─── STAT CARDS ─── */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 22px 24px;
      position: relative;
      overflow: hidden;
      transition: border-color .2s, transform .2s;
    }
    .stat-card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0;
      height: 2px;
    }
    .stat-card.blue::before  { background: linear-gradient(90deg,var(--accent),transparent); }
    .stat-card.green::before { background: linear-gradient(90deg,var(--green),transparent); }
    .stat-card.red::before   { background: linear-gradient(90deg,var(--red),transparent); }
    .stat-card.yellow::before{ background: linear-gradient(90deg,var(--yellow),transparent); }
    .stat-card:hover { border-color: var(--muted); transform: translateY(-2px); }
    .stat-label {
      font-size: 11px; font-weight: 600; letter-spacing: 1.5px;
      text-transform: uppercase; color: var(--text-dim);
      margin-bottom: 12px;
    }
    .stat-value {
      font-size: 38px; font-weight: 800; line-height: 1;
      font-family: var(--font-mono);
    }
    .stat-card.blue  .stat-value { color: var(--accent); }
    .stat-card.green .stat-value { color: var(--green); }
    .stat-card.red   .stat-value { color: var(--red); }
    .stat-card.yellow.stat-value { color: var(--yellow); }
    .stat-card.yellow .stat-value { color: var(--yellow); }
    .stat-sub {
      margin-top: 8px; font-size: 12px; color: var(--text-dim);
      font-family: var(--font-mono);
    }
    .stat-icon {
      position: absolute; right: 20px; top: 50%;
      transform: translateY(-50%);
      font-size: 32px; opacity: .08;
    }

    /* ─── TABS ─── */
    .tabs {
      display: flex; gap: 4px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 5px;
      width: fit-content;
    }
    .tab-btn {
      padding: 8px 20px;
      border-radius: 8px;
      border: none; cursor: pointer;
      font-family: var(--font-ui); font-size: 13px; font-weight: 600;
      color: var(--text-dim);
      background: transparent;
      transition: all .2s;
    }
    .tab-btn.active {
      background: var(--border);
      color: var(--accent);
    }
    .tab-btn:hover:not(.active) { color: var(--text); }

    /* ─── PANEL ─── */
    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
    }
    .panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 24px;
      border-bottom: 1px solid var(--border);
    }
    .panel-title {
      font-size: 14px; font-weight: 700; letter-spacing: .5px;
    }
    .panel-actions { display: flex; gap: 8px; align-items: center; }

    /* ─── BUTTONS ─── */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 16px;
      border-radius: 8px; border: none; cursor: pointer;
      font-family: var(--font-ui); font-size: 12px; font-weight: 600;
      transition: all .2s;
    }
    .btn-primary {
      background: var(--accent); color: #000;
    }
    .btn-primary:hover { background: #33ddff; transform: translateY(-1px); }
    .btn-danger {
      background: rgba(255,64,96,.12);
      border: 1px solid rgba(255,64,96,.3);
      color: var(--red);
    }
    .btn-danger:hover { background: rgba(255,64,96,.25); }
    .btn-ghost {
      background: var(--border);
      color: var(--text);
    }
    .btn-ghost:hover { background: var(--muted); }
    .btn-success {
      background: rgba(0,255,136,.1);
      border: 1px solid rgba(0,255,136,.25);
      color: var(--green);
    }
    .btn-success:hover { background: rgba(0,255,136,.2); }

    /* ─── TABLE ─── */
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%; border-collapse: collapse;
      font-size: 13px;
    }
    thead th {
      padding: 12px 20px;
      text-align: left;
      font-size: 11px; font-weight: 600;
      letter-spacing: 1.2px; text-transform: uppercase;
      color: var(--text-dim);
      border-bottom: 1px solid var(--border);
    }
    tbody tr {
      border-bottom: 1px solid rgba(30,45,61,.5);
      transition: background .15s;
    }
    tbody tr:hover { background: rgba(0,212,255,.03); }
    tbody tr:last-child { border-bottom: none; }
    td { padding: 13px 20px; font-family: var(--font-mono); font-size: 12px; }

    /* ─── BADGES ─── */
    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 600;
      font-family: var(--font-mono);
    }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; }
    .badge-online-s  { background:rgba(0,255,136,.1);  border:1px solid rgba(0,255,136,.3); color:var(--green); }
    .badge-offline-s { background:rgba(255,64,96,.1);  border:1px solid rgba(255,64,96,.3);  color:var(--red); }
    .badge-active    { background:rgba(0,212,255,.1);  border:1px solid rgba(0,212,255,.3);  color:var(--accent); }
    .badge-revoked   { background:rgba(255,64,96,.1);  border:1px solid rgba(255,64,96,.3);  color:var(--red); }
    .badge-free      { background:rgba(93,113,131,.15);border:1px solid var(--border);        color:var(--text-dim); }
    .badge-pro       { background:rgba(255,208,96,.1); border:1px solid rgba(255,208,96,.3); color:var(--yellow); }
    .badge-admin     { background:rgba(0,212,255,.1);  border:1px solid rgba(0,212,255,.3);  color:var(--accent); }
    .badge-user      { background:rgba(93,113,131,.15);border:1px solid var(--border);        color:var(--text-dim); }

    /* ─── EMPTY STATE ─── */
    .empty {
      padding: 60px 20px;
      text-align: center;
      color: var(--text-dim);
    }
    .empty-icon { font-size: 40px; margin-bottom: 12px; opacity: .4; }
    .empty p { font-size: 13px; }
    .empty code {
      display: inline-block; margin-top: 6px;
      background: var(--border); padding: 3px 10px; border-radius: 6px;
      font-family: var(--font-mono); font-size: 12px; color: var(--accent);
    }

    /* ─── LOG ENTRIES ─── */
    .log-entry {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 12px 20px;
      border-bottom: 1px solid rgba(30,45,61,.5);
      font-family: var(--font-mono); font-size: 12px;
      transition: background .15s;
    }
    .log-entry:hover { background: rgba(0,212,255,.03); }
    .log-entry:last-child { border-bottom: none; }
    .log-time { color: var(--text-dim); min-width: 90px; }
    .log-action { min-width: 160px; }
    .log-detail { color: var(--text-dim); flex: 1; }
    .log-ip { color: var(--muted); min-width: 110px; text-align: right; }

    /* ─── MODAL ─── */
    .modal-overlay {
      display: none; position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,.7); backdrop-filter: blur(4px);
      align-items: center; justify-content: center;
    }
    .modal-overlay.open { display: flex; }
    .modal {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      width: 420px; max-width: 95vw;
      animation: slideUp .2s ease;
    }
    @keyframes slideUp {
      from { opacity:0; transform: translateY(20px); }
      to   { opacity:1; transform: translateY(0); }
    }
    .modal h3 { font-size: 16px; font-weight: 700; margin-bottom: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-label {
      display: block; font-size: 11px; font-weight: 600;
      letter-spacing: 1px; text-transform: uppercase;
      color: var(--text-dim); margin-bottom: 6px;
    }
    .form-input, .form-select {
      width: 100%; padding: 10px 14px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; color: var(--text);
      font-family: var(--font-mono); font-size: 13px;
      outline: none; transition: border-color .2s;
    }
    .form-input:focus, .form-select:focus { border-color: var(--accent); }
    .form-select option { background: var(--surface); }
    .modal-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }

    /* ─── REFRESH INDICATOR ─── */
    .refresh-bar {
      height: 2px; background: var(--border);
      border-radius: 2px; overflow: hidden;
      width: 100px;
    }
    .refresh-progress {
      height: 100%; background: var(--accent);
      border-radius: 2px;
      animation: refill 10s linear infinite;
    }
    @keyframes refill { from{width:100%} to{width:0%} }

    /* ─── TOAST ─── */
    .toast-wrap {
      position: fixed; bottom: 24px; right: 24px;
      display: flex; flex-direction: column; gap: 8px;
      z-index: 300;
    }
    .toast {
      padding: 12px 18px;
      background: var(--card); border: 1px solid var(--border);
      border-radius: 10px; font-size: 13px;
      display: flex; align-items: center; gap: 8px;
      animation: slideIn .3s ease;
      box-shadow: 0 8px 32px rgba(0,0,0,.4);
      max-width: 300px;
    }
    @keyframes slideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
    .toast.success { border-color: rgba(0,255,136,.3); }
    .toast.error   { border-color: rgba(255,64,96,.3); }

    /* ─── SECTION HIDDEN ─── */
    .tab-section { display: none; }
    .tab-section.active { display: flex; flex-direction: column; gap: 24px; }

    /* ─── SEARCH ─── */
    .search-input {
      padding: 7px 14px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; color: var(--text);
      font-family: var(--font-mono); font-size: 12px;
      outline: none; width: 200px; transition: border-color .2s;
    }
    .search-input:focus { border-color: var(--accent); }

    /* ─── TAG ROW ─── */
    .tag { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); }

    /* scrollbar */
    ::-webkit-scrollbar { width:5px; height:5px; }
    ::-webkit-scrollbar-track { background: var(--surface); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius:3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--muted); }
  </style>
</head>
<body>

<!-- TOPBAR -->
<header class="topbar">
  <div class="logo">
    <div class="logo-icon">R</div>
    RBA Studio
    <div class="badge-online" id="serverBadge">
      <div class="dot"></div> Server Online
    </div>
  </div>
  <div class="topbar-right">
    <div class="refresh-bar"><div class="refresh-progress" id="refreshBar"></div></div>
    <span>Auto-refresh: 10s</span>
    <span>|</span>
    <span id="clock">--:--:--</span>
  </div>
</header>

<!-- MAIN -->
<main class="layout">

  <!-- STATS -->
  <div class="stats-row">
    <div class="stat-card blue">
      <div class="stat-label">Total Terdaftar</div>
      <div class="stat-value" id="statTotal">0</div>
      <div class="stat-sub">device</div>
      <div class="stat-icon">📡</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Online Sekarang</div>
      <div class="stat-value" id="statOnline">0</div>
      <div class="stat-sub">aktif &lt;15 detik</div>
      <div class="stat-icon">🟢</div>
    </div>
    <div class="stat-card red">
      <div class="stat-label">Offline</div>
      <div class="stat-value" id="statOffline">0</div>
      <div class="stat-sub">tidak merespon</div>
      <div class="stat-icon">🔴</div>
    </div>
    <div class="stat-card yellow">
      <div class="stat-label">Total License</div>
      <div class="stat-value" id="statLicense">0</div>
      <div class="stat-sub">terdaftar</div>
      <div class="stat-icon">🔑</div>
    </div>
  </div>

  <!-- TABS -->
  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('devices')">📡 Devices</button>
    <button class="tab-btn" onclick="switchTab('licenses')">🔑 Licenses</button>
    <button class="tab-btn" onclick="switchTab('users')">👥 Users</button>
    <button class="tab-btn" onclick="switchTab('logs')">📋 Activity Log</button>
  </div>

  <!-- ── TAB: DEVICES ── -->
  <div class="tab-section active" id="tab-devices">
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">Daftar Device</div>
        <div class="panel-actions">
          <input class="search-input" placeholder="Cari device..." oninput="filterDevices(this.value)" />
          <button class="btn btn-danger" onclick="resetDevices()">🗑 Reset Semua</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Device ID</th>
              <th>User</th>
              <th>License</th>
              <th>IP Address</th>
              <th>Terakhir Aktif</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="devicesBody">
            <tr><td colspan="7"><div class="empty"><div class="empty-icon">📡</div><p>Memuat data...</p></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ── TAB: LICENSES ── -->
  <div class="tab-section" id="tab-licenses">
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">Manajemen License</div>
        <div class="panel-actions">
          <button class="btn btn-primary" onclick="openModal('addLicense')">+ Buat License</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>License Key</th>
              <th>Tipe</th>
              <th>Status</th>
              <th>Max Device</th>
              <th>Kadaluarsa</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="licensesBody">
            <tr><td colspan="7"><div class="empty"><div class="empty-icon">🔑</div><p>Memuat data...</p></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ── TAB: USERS ── -->
  <div class="tab-section" id="tab-users">
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">Manajemen User</div>
        <div class="panel-actions">
          <button class="btn btn-primary" onclick="openModal('addUser')">+ Tambah User</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="usersBody">
            <tr><td colspan="4"><div class="empty"><div class="empty-icon">👥</div><p>Memuat data...</p></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ── TAB: LOGS ── -->
  <div class="tab-section" id="tab-logs">
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">Activity Log</div>
        <div class="panel-actions">
          <select class="form-select" style="width:160px;padding:7px 12px;font-size:12px" onchange="loadLogs(this.value)">
            <option value="">Semua Aksi</option>
            <option value="LOGIN_SUCCESS">Login Sukses</option>
            <option value="LOGIN_FAILED">Login Gagal</option>
            <option value="VALIDATE_SUCCESS">Validate Sukses</option>
            <option value="VALIDATE_FAILED">Validate Gagal</option>
            <option value="LICENSE_CREATED">License Dibuat</option>
            <option value="LICENSE_REVOKED">License Direvoke</option>
            <option value="USER_CREATED">User Dibuat</option>
          </select>
          <button class="btn btn-danger" onclick="clearLogs()">🗑 Hapus Log</button>
        </div>
      </div>
      <div id="logsContainer">
        <div class="empty"><div class="empty-icon">📋</div><p>Memuat log...</p></div>
      </div>
    </div>
  </div>

</main>

<!-- ─────────── MODALS ─────────── -->

<!-- Add License -->
<div class="modal-overlay" id="modal-addLicense">
  <div class="modal">
    <h3>🔑 Buat License Baru</h3>
    <div class="form-group">
      <label class="form-label">Tipe</label>
      <select class="form-select" id="lic-type">
        <option value="free">Free</option>
        <option value="pro">Pro</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Max Devices</label>
      <input class="form-input" type="number" id="lic-max" value="1" min="1" max="100"/>
    </div>
    <div class="form-group">
      <label class="form-label">Kadaluarsa (kosongkan = selamanya)</label>
      <input class="form-input" type="date" id="lic-exp"/>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal('addLicense')">Batal</button>
      <button class="btn btn-primary" onclick="createLicense()">Buat License</button>
    </div>
  </div>
</div>

<!-- Add User -->
<div class="modal-overlay" id="modal-addUser">
  <div class="modal">
    <h3>👤 Tambah User Baru</h3>
    <div class="form-group">
      <label class="form-label">Username</label>
      <input class="form-input" type="text" id="usr-name" placeholder="username"/>
    </div>
    <div class="form-group">
      <label class="form-label">Password</label>
      <input class="form-input" type="password" id="usr-pass" placeholder="min. 6 karakter"/>
    </div>
    <div class="form-group">
      <label class="form-label">Role</label>
      <select class="form-select" id="usr-role">
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal('addUser')">Batal</button>
      <button class="btn btn-primary" onclick="createUser()">Tambah User</button>
    </div>
  </div>
</div>

<!-- Change Password -->
<div class="modal-overlay" id="modal-changePass">
  <div class="modal">
    <h3>🔒 Ganti Password</h3>
    <input type="hidden" id="cp-username"/>
    <div class="form-group">
      <label class="form-label">Password Baru</label>
      <input class="form-input" type="password" id="cp-pass" placeholder="min. 6 karakter"/>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal('changePass')">Batal</button>
      <button class="btn btn-primary" onclick="changePassword()">Simpan</button>
    </div>
  </div>
</div>

<!-- TOASTS -->
<div class="toast-wrap" id="toastWrap"></div>

<script>
  const BASE = '';

  // ── CLOCK ──
  function updateClock() {
    document.getElementById('clock').textContent =
      new Date().toLocaleTimeString('id-ID');
  }
  setInterval(updateClock, 1000); updateClock();

  // ── TAB ──
  let activeTab = 'devices';
  function switchTab(t) {
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-'+t).classList.add('active');
    event.target.classList.add('active');
    activeTab = t;
    if(t==='devices')  loadDevices();
    if(t==='licenses') loadLicenses();
    if(t==='users')    loadUsers();
    if(t==='logs')     loadLogs();
  }

  // ── TOAST ──
  function toast(msg, type='success') {
    const wrap = document.getElementById('toastWrap');
    const el = document.createElement('div');
    el.className = \`toast \${type}\`;
    el.innerHTML = \`<span>\${type==='success'?'✅':'❌'}</span> \${msg}\`;
    wrap.appendChild(el);
    setTimeout(()=>el.remove(), 3500);
  }

  // ── MODAL ──
  function openModal(id) { document.getElementById('modal-'+id).classList.add('open'); }
  function closeModal(id) { document.getElementById('modal-'+id).classList.remove('open'); }
  document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if(e.target===o) o.classList.remove('open'); })
  );

  // ── TIME FORMAT ──
  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff/1000);
    if(s<60) return \`\${s}d lalu\`;
    if(s<3600) return \`\${Math.floor(s/60)}m lalu\`;
    if(s<86400) return \`\${Math.floor(s/3600)}j lalu\`;
    return new Date(iso).toLocaleDateString('id-ID');
  }
  function fmtDate(iso) {
    if(!iso) return '<span style="color:var(--text-dim)">Selamanya</span>';
    return new Date(iso).toLocaleDateString('id-ID');
  }

  // ── ACTION COLORS ──
  function actionColor(a) {
    if(a.includes('SUCCESS')||a.includes('CREATED')||a.includes('ACTIVATED')) return 'var(--green)';
    if(a.includes('FAILED')||a.includes('REVOKED')||a.includes('DELETED')) return 'var(--red)';
    if(a.includes('CHANGED')) return 'var(--yellow)';
    return 'var(--accent)';
  }

  // ── LOAD DEVICES ──
  let allDevices = {};
  async function loadDevices() {
    try {
      const r = await fetch(BASE+'/devices');
      const d = await r.json();
      allDevices = d.devices || {};
      document.getElementById('statTotal').textContent   = d.total ?? 0;
      document.getElementById('statOnline').textContent  = d.online ?? 0;
      document.getElementById('statOffline').textContent = d.offline ?? 0;
      renderDevices(allDevices);
    } catch(e) { console.error(e); }
  }

  function renderDevices(devs) {
    const tbody = document.getElementById('devicesBody');
    const entries = Object.entries(devs);
    if(!entries.length) {
      tbody.innerHTML = \`<tr><td colspan="7"><div class="empty">
        <div class="empty-icon">📡</div>
        <p>Belum ada device terdaftar. Kirim POST ke</p>
        <code>/online</code>
      </div></td></tr>\`;
      return;
    }
    tbody.innerHTML = entries.map(([id, d]) => {
      const online = Date.now() - new Date(d.lastSeen).getTime() < 15000;
      return \`<tr>
        <td><span class="badge \${online?'badge-online-s':'badge-offline-s'}">
          <span class="badge-dot" style="background:\${online?'var(--green)':'var(--red)'}"></span>
          \${online?'Online':'Offline'}
        </span></td>
        <td style="color:var(--text)">\${id}</td>
        <td>\${d.username||'—'}</td>
        <td style="color:var(--accent);font-size:11px">\${d.licenseKey||'—'}</td>
        <td>\${d.ip||'—'}</td>
        <td style="color:var(--text-dim)">\${timeAgo(d.lastSeen)}</td>
        <td><button class="btn btn-danger" style="padding:4px 10px;font-size:11px"
          onclick="deleteDevice('\${id}')">Hapus</button></td>
      </tr>\`;
    }).join('');
  }

  function filterDevices(q) {
    const filtered = {};
    for(const [id,d] of Object.entries(allDevices)) {
      if(id.includes(q)||(d.username||'').includes(q)||(d.ip||'').includes(q))
        filtered[id]=d;
    }
    renderDevices(filtered);
  }

  async function deleteDevice(id) {
    if(!confirm(\`Hapus device "\${id}"?\`)) return;
    const r = await fetch(BASE+'/devices/'+id, {method:'DELETE'});
    const d = await r.json();
    toast(d.message, d.success?'success':'error');
    loadDevices();
  }

  async function resetDevices() {
    if(!confirm('Hapus semua device dari memory?')) return;
    const devs = Object.keys(allDevices);
    for(const id of devs) await fetch(BASE+'/devices/'+id, {method:'DELETE'});
    toast('Semua device dihapus.');
    loadDevices();
  }

  // ── LOAD LICENSES ──
  async function loadLicenses() {
    const r = await fetch(BASE+'/licenses');
    const d = await r.json();
    document.getElementById('statLicense').textContent = d.total ?? 0;
    const tbody = document.getElementById('licensesBody');
    if(!d.licenses?.length) {
      tbody.innerHTML = \`<tr><td colspan="7"><div class="empty"><div class="empty-icon">🔑</div><p>Belum ada license.</p></div></td></tr>\`;
      return;
    }
    tbody.innerHTML = d.licenses.map(l => \`<tr>
      <td style="color:var(--accent);letter-spacing:.5px">\${l.key}</td>
      <td><span class="badge \${l.type==='pro'?'badge-pro':'badge-free'}">\${l.type.toUpperCase()}</span></td>
      <td><span class="badge \${l.status==='active'?'badge-active':'badge-revoked'}">\${l.status}</span></td>
      <td style="color:var(--text)">\${l.maxDevices}</td>
      <td>\${fmtDate(l.expiresAt)}</td>
      <td style="color:var(--text-dim)">\${fmtDate(l.createdAt)}</td>
      <td style="display:flex;gap:6px">
        \${l.status==='active'
          ? \`<button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="revokeLicense('\${l.key}')">Revoke</button>\`
          : \`<button class="btn btn-success" style="padding:4px 10px;font-size:11px" onclick="activateLicense('\${l.key}')">Aktifkan</button>\`
        }
      </td>
    </tr>\`).join('');
  }

  async function createLicense() {
    const type = document.getElementById('lic-type').value;
    const maxDevices = parseInt(document.getElementById('lic-max').value);
    const exp = document.getElementById('lic-exp').value;
    const body = { type, maxDevices };
    if(exp) body.expiresAt = new Date(exp).toISOString();
    const r = await fetch(BASE+'/licenses', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const d = await r.json();
    toast(d.message, d.success?'success':'error');
    if(d.success) { closeModal('addLicense'); loadLicenses(); }
  }

  async function revokeLicense(key) {
    if(!confirm(\`Revoke license "\${key}"?\`)) return;
    const r = await fetch(BASE+'/licenses/'+key+'/revoke', {method:'PATCH'});
    const d = await r.json();
    toast(d.message, d.success?'success':'error');
    loadLicenses();
  }

  async function activateLicense(key) {
    const r = await fetch(BASE+'/licenses/'+key+'/activate', {method:'PATCH'});
    const d = await r.json();
    toast(d.message, d.success?'success':'error');
    loadLicenses();
  }

  // ── LOAD USERS ──
  async function loadUsers() {
    const r = await fetch(BASE+'/users');
    const d = await r.json();
    const tbody = document.getElementById('usersBody');
    if(!d.users?.length) {
      tbody.innerHTML = \`<tr><td colspan="4"><div class="empty"><div class="empty-icon">👥</div><p>Belum ada user.</p></div></td></tr>\`;
      return;
    }
    tbody.innerHTML = d.users.map(u => \`<tr>
      <td style="color:var(--text);font-weight:600">\${u.username}</td>
      <td><span class="badge \${u.role==='admin'?'badge-admin':'badge-user'}">\${u.role}</span></td>
      <td style="color:var(--text-dim)">\${fmtDate(u.createdAt)}</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px"
          onclick="openChangePass('\${u.username}')">🔒 Password</button>
        \${u.username!=='admin' ? \`<button class="btn btn-danger" style="padding:4px 10px;font-size:11px"
          onclick="deleteUser('\${u.username}')">Hapus</button>\` : ''}
      </td>
    </tr>\`).join('');
  }

  async function createUser() {
    const username = document.getElementById('usr-name').value.trim();
    const password = document.getElementById('usr-pass').value;
    const role = document.getElementById('usr-role').value;
    if(!username||!password) { toast('Username & password wajib diisi','error'); return; }
    const r = await fetch(BASE+'/users', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username,password,role})
    });
    const d = await r.json();
    toast(d.message, d.success?'success':'error');
    if(d.success) { closeModal('addUser'); loadUsers(); }
  }

  async function deleteUser(username) {
    if(!confirm(\`Hapus user "\${username}"?\`)) return;
    const r = await fetch(BASE+'/users/'+username, {method:'DELETE'});
    const d = await r.json();
    toast(d.message, d.success?'success':'error');
    loadUsers();
  }

  function openChangePass(username) {
    document.getElementById('cp-username').value = username;
    document.getElementById('cp-pass').value = '';
    openModal('changePass');
  }

  async function changePassword() {
    const username = document.getElementById('cp-username').value;
    const newPassword = document.getElementById('cp-pass').value;
    if(newPassword.length < 6) { toast('Password min. 6 karakter','error'); return; }
    const r = await fetch(BASE+'/users/'+username+'/password', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({newPassword})
    });
    const d = await r.json();
    toast(d.message, d.success?'success':'error');
    if(d.success) closeModal('changePass');
  }

  // ── LOAD LOGS ──
  async function loadLogs(filter='') {
    const url = BASE+'/logs?limit=100'+(filter?'&action='+filter:'');
    const r = await fetch(url);
    const d = await r.json();
    const cont = document.getElementById('logsContainer');
    if(!d.logs?.length) {
      cont.innerHTML = \`<div class="empty"><div class="empty-icon">📋</div><p>Belum ada log.</p></div>\`;
      return;
    }
    cont.innerHTML = d.logs.map(l => \`
      <div class="log-entry">
        <span class="log-time">\${new Date(l.timestamp).toLocaleTimeString('id-ID')}</span>
        <span class="log-action" style="color:\${actionColor(l.action)}">\${l.action}</span>
        <span class="log-detail">\${l.detail}</span>
        <span class="log-ip">\${l.ip}</span>
      </div>
    \`).join('');
  }

  async function clearLogs() {
    if(!confirm('Hapus semua log?')) return;
    const r = await fetch(BASE+'/logs', {method:'DELETE'});
    const d = await r.json();
    toast(d.message, d.success?'success':'error');
    loadLogs();
  }

  // ── AUTO REFRESH ──
  function refresh() {
    if(activeTab==='devices')  loadDevices();
    if(activeTab==='licenses') loadLicenses();
    if(activeTab==='users')    loadUsers();
    if(activeTab==='logs')     loadLogs();
    // reset progress bar animation
    const bar = document.getElementById('refreshBar');
    bar.style.animation='none'; bar.offsetHeight;
    bar.style.animation='refill 10s linear infinite';
  }
  setInterval(refresh, 10000);

  // ── INIT ──
  loadDevices();
  loadLicenses();
</script>
</body>
</html>
`;

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(DASHBOARD_HTML);
});

app.get("/api/status", (req, res) => {
  const now = Date.now();
  const onlineCount = Object.values(devices).filter(
    (d) => now - new Date(d.lastSeen).getTime() < 15000
  ).length;

  res.json({
    status: "online",
    message: "RBA Development License Server is Online 🚀",
    serverTime: new Date().toISOString(),
    onlineDevices: onlineCount,
    totalDevices: Object.keys(devices).length
  });
});

// =====================================================
// ROUTE 2: LOGIN USER
// =====================================================
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
  }

  const users = readJSON(USERS_FILE);
  const user = users.find(
    (u) => u.username === username && u.password === password
  );

  if (user) {
    addLog("LOGIN_SUCCESS", `User '${username}' berhasil login`, ip);
    return res.json({
      success: true,
      message: "Login berhasil.",
      user: { id: user.id, username: user.username, role: user.role }
    });
  }

  addLog("LOGIN_FAILED", `Percobaan login gagal untuk '${username}'`, ip);
  res.status(401).json({ success: false, message: "Akses Ditolak: Username atau Password salah!" });
});

// =====================================================
// ROUTE 3: VALIDASI LICENSE KEY
// =====================================================
app.post("/validate", (req, res) => {
  const { license_key, deviceId } = req.body;
  const ip = req.ip;

  if (!license_key) {
    return res.status(400).json({ valid: false, message: "license_key wajib diisi." });
  }

  const licenses = readJSON(LICENSES_FILE);
  const license = licenses.find((l) => l.key === license_key);

  if (!license) {
    addLog("VALIDATE_FAILED", `License tidak ditemukan: ${license_key}`, ip);
    return res.json({ valid: false, message: "License key tidak valid." });
  }

  if (license.status !== "active") {
    addLog("VALIDATE_FAILED", `License tidak aktif: ${license_key}`, ip);
    return res.json({ valid: false, message: `License berstatus '${license.status}'.` });
  }

  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    addLog("VALIDATE_FAILED", `License kadaluarsa: ${license_key}`, ip);
    return res.json({ valid: false, message: "License sudah kadaluarsa." });
  }

  addLog("VALIDATE_SUCCESS", `License valid: ${license_key} | Device: ${deviceId || "-"}`, ip);
  res.json({
    valid: true,
    message: "License aktif dan valid.",
    license: {
      key: license.key,
      type: license.type,
      maxDevices: license.maxDevices,
      expiresAt: license.expiresAt
    }
  });
});

// =====================================================
// ROUTE 4: DEVICE PING ONLINE
// =====================================================
app.post("/online", (req, res) => {
  const { deviceId, username, licenseKey } = req.body;
  const ip = req.ip;

  if (!deviceId) {
    return res.status(400).json({ success: false, message: "deviceId wajib diisi." });
  }

  devices[deviceId] = {
    lastSeen: new Date().toISOString(),
    username: username || "unknown",
    licenseKey: licenseKey || "-",
    ip
  };

  console.log(`[ONLINE] Device: ${deviceId} | User: ${username || "-"} | IP: ${ip}`);
  res.json({ success: true, message: "Device tercatat online." });
});

// =====================================================
// ROUTE 5: LIST SEMUA DEVICE + STATUS ONLINE/OFFLINE
// =====================================================
app.get("/devices", (req, res) => {
  const now = Date.now();
  const result = {};
  let onlineCount = 0;

  for (const [id, data] of Object.entries(devices)) {
    const isOnline = now - new Date(data.lastSeen).getTime() < 15000;
    if (isOnline) onlineCount++;
    result[id] = { ...data, status: isOnline ? "online" : "offline" };
  }

  res.json({
    total: Object.keys(devices).length,
    online: onlineCount,
    offline: Object.keys(devices).length - onlineCount,
    devices: result
  });
});

// =====================================================
// ROUTE 6: HAPUS DEVICE DARI MEMORY
// =====================================================
app.delete("/devices/:deviceId", (req, res) => {
  const { deviceId } = req.params;

  if (!devices[deviceId]) {
    return res.status(404).json({ success: false, message: "Device tidak ditemukan." });
  }

  delete devices[deviceId];
  res.json({ success: true, message: `Device '${deviceId}' berhasil dihapus.` });
});

// =====================================================
// ROUTE 7: LIST SEMUA LICENSE
// =====================================================
app.get("/licenses", (req, res) => {
  const licenses = readJSON(LICENSES_FILE);
  res.json({ total: licenses.length, licenses });
});

// =====================================================
// ROUTE 8: TAMBAH LICENSE BARU
// =====================================================
app.post("/licenses", (req, res) => {
  const { type, maxDevices, expiresAt } = req.body;
  const ip = req.ip;

  const newLicense = {
    key: generateLicenseKey(type || "free"),
    type: type || "free",
    status: "active",
    maxDevices: maxDevices || 1,
    expiresAt: expiresAt || null,
    createdAt: new Date().toISOString()
  };

  const licenses = readJSON(LICENSES_FILE);
  licenses.push(newLicense);
  writeJSON(LICENSES_FILE, licenses);

  addLog("LICENSE_CREATED", `License baru dibuat: ${newLicense.key}`, ip);
  res.status(201).json({ success: true, message: "License berhasil dibuat.", license: newLicense });
});

// =====================================================
// ROUTE 9: REVOKE / NONAKTIFKAN LICENSE
// =====================================================
app.patch("/licenses/:key/revoke", (req, res) => {
  const { key } = req.params;
  const ip = req.ip;

  const licenses = readJSON(LICENSES_FILE);
  const idx = licenses.findIndex((l) => l.key === key);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: "License tidak ditemukan." });
  }

  licenses[idx].status = "revoked";
  writeJSON(LICENSES_FILE, licenses);

  addLog("LICENSE_REVOKED", `License direvoke: ${key}`, ip);
  res.json({ success: true, message: `License '${key}' berhasil direvoke.` });
});

// =====================================================
// ROUTE 10: AKTIFKAN KEMBALI LICENSE
// =====================================================
app.patch("/licenses/:key/activate", (req, res) => {
  const { key } = req.params;
  const ip = req.ip;

  const licenses = readJSON(LICENSES_FILE);
  const idx = licenses.findIndex((l) => l.key === key);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: "License tidak ditemukan." });
  }

  licenses[idx].status = "active";
  writeJSON(LICENSES_FILE, licenses);

  addLog("LICENSE_ACTIVATED", `License diaktifkan kembali: ${key}`, ip);
  res.json({ success: true, message: `License '${key}' berhasil diaktifkan.` });
});

// =====================================================
// ROUTE 11: LIST SEMUA USER
// =====================================================
app.get("/users", (req, res) => {
  const users = readJSON(USERS_FILE).map(({ password, ...u }) => u); // Sembunyikan password
  res.json({ total: users.length, users });
});

// =====================================================
// ROUTE 12: TAMBAH USER BARU
// =====================================================
app.post("/users", (req, res) => {
  const { username, password, role } = req.body;
  const ip = req.ip;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
  }

  const users = readJSON(USERS_FILE);

  if (users.find((u) => u.username === username)) {
    return res.status(409).json({ success: false, message: "Username sudah digunakan." });
  }

  const newUser = {
    id: Date.now(),
    username,
    password,
    role: role || "user",
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJSON(USERS_FILE, users);

  addLog("USER_CREATED", `User baru: ${username} (${role || "user"})`, ip);
  const { password: _, ...safeUser } = newUser;
  res.status(201).json({ success: true, message: "User berhasil dibuat.", user: safeUser });
});

// =====================================================
// ROUTE 13: HAPUS USER
// =====================================================
app.delete("/users/:username", (req, res) => {
  const { username } = req.params;
  const ip = req.ip;

  if (username === "admin") {
    return res.status(403).json({ success: false, message: "User 'admin' tidak boleh dihapus." });
  }

  const users = readJSON(USERS_FILE);
  const newUsers = users.filter((u) => u.username !== username);

  if (newUsers.length === users.length) {
    return res.status(404).json({ success: false, message: "User tidak ditemukan." });
  }

  writeJSON(USERS_FILE, newUsers);
  addLog("USER_DELETED", `User dihapus: ${username}`, ip);
  res.json({ success: true, message: `User '${username}' berhasil dihapus.` });
});

// =====================================================
// ROUTE 14: GANTI PASSWORD USER
// =====================================================
app.patch("/users/:username/password", (req, res) => {
  const { username } = req.params;
  const { newPassword } = req.body;
  const ip = req.ip;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: "Password baru minimal 6 karakter." });
  }

  const users = readJSON(USERS_FILE);
  const idx = users.findIndex((u) => u.username === username);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: "User tidak ditemukan." });
  }

  users[idx].password = newPassword;
  writeJSON(USERS_FILE, users);

  addLog("PASSWORD_CHANGED", `Password diubah untuk: ${username}`, ip);
  res.json({ success: true, message: `Password user '${username}' berhasil diubah.` });
});

// =====================================================
// ROUTE 15: ACTIVITY LOGS
// =====================================================
app.get("/logs", (req, res) => {
  const { limit = 50, action } = req.query;
  let logs = readJSON(LOGS_FILE);

  if (action) {
    logs = logs.filter((l) => l.action === action.toUpperCase());
  }

  logs = logs.slice(-parseInt(limit)).reverse(); // Terbaru duluan
  res.json({ total: logs.length, logs });
});

// =====================================================
// ROUTE 16: HAPUS SEMUA LOGS
// =====================================================
app.delete("/logs", (req, res) => {
  writeJSON(LOGS_FILE, []);
  res.json({ success: true, message: "Semua log berhasil dihapus." });
});

// =====================================================
// ROUTE 17: PING / HEALTH CHECK
// =====================================================
app.get("/ping", (req, res) => {
  res.json({ pong: true, time: new Date().toISOString() });
});

// =====================================================
// 404 HANDLER
// =====================================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route '${req.method} ${req.path}' tidak ditemukan.` });
});

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ success: false, message: "Internal Server Error.", error: err.message });
});

// =====================================================
// INIT & START SERVER
// =====================================================
initDB();
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("=========================================");
  console.log(" RBA Studio License Server");
  console.log(` Running on port ${PORT}`);
  console.log(` Started at: ${new Date().toISOString()}`);
  console.log("=========================================");
});
