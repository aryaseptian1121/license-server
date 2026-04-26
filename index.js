const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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
// ROUTE 1: DASHBOARD (served from public/index.html via static)
// =====================================================
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
