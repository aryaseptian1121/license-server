// =====================================================
// index.js â€” RBA Studio License Server v2.0
// =====================================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const session = require("express-session");
const rateLimit = require("express-rate-limit");

const app = express();

// â”€â”€ IMPORT MODULES â”€â”€
const { router: authRouter, requireAuth } = require("./auth");
const deviceRouter = require("./devices");
const licenseRouter = require("./license");

// â”€â”€ MIDDLEWARE â”€â”€
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || "rba-studio-secret-2025-" + crypto.randomBytes(8).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set true jika pakai HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 jam
  }
}));

// Rate limiting untuk endpoint login (anti brute force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10,
  message: { success: false, message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." }
});

// Rate limiting untuk API publik (validate, online)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 60,
  message: { success: false, message: "Rate limit tercapai. Coba lagi sebentar." }
});

// =====================================================
// DATABASE FILES
// =====================================================
const USERS_FILE = path.join(__dirname, "users.json");
const LICENSES_FILE = path.join(__dirname, "licenses.json");
const LOGS_FILE = path.join(__dirname, "logs.json");

// â”€â”€ HELPERS â”€â”€
const readJSON = (filePath) => {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return []; }
};

const writeJSON = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const addLog = (action, detail, ip = "-") => {
  const logs = readJSON(LOGS_FILE);
  logs.push({ id: Date.now(), action, detail, ip, timestamp: new Date().toISOString() });
  if (logs.length > 1000) logs.splice(0, logs.length - 1000);
  writeJSON(LOGS_FILE, logs);
};

const initDB = () => {
  if (!fs.existsSync(LOGS_FILE)) {
    writeJSON(LOGS_FILE, []);
    console.log("[DB] logs.json dibuat otomatis.");
  }
};

initDB();

// =====================================================
// SSE: Server-Sent Events untuk realtime dashboard
// =====================================================
let sseClients = [];

app.get("/events", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const clientId = Date.now();
  sseClients.push({ id: clientId, res });

  req.on("close", () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

const broadcastSSE = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => {
    try { c.res.write(payload); } catch {}
  });
};

// Broadcast stats setiap 5 detik ke semua client SSE
setInterval(() => {
  try {
    const devicesRaw = fs.existsSync(path.join(__dirname, "devices.json"))
      ? JSON.parse(fs.readFileSync(path.join(__dirname, "devices.json"), "utf-8"))
      : {};
    const now = Date.now();
    const TIMEOUT = 30000;
    const total = Object.keys(devicesRaw).length;
    const online = Object.values(devicesRaw).filter(
      d => now - new Date(d.lastSeen).getTime() < TIMEOUT
    ).length;
    const licenses = readJSON(LICENSES_FILE);

    broadcastSSE("stats", { total, online, offline: total - online, totalLicense: licenses.length });
  } catch {}
}, 5000);

// =====================================================
// ROUTES: Auth (dengan rate limiter)
// =====================================================
app.use("/auth", loginLimiter, authRouter);

// Tambahkan logging ke route login
app.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    req.session.user = { id: user.id, username: user.username, role: user.role };
    addLog("LOGIN_SUCCESS", `User '${username}' login via dashboard`, ip);
    return res.json({ success: true, message: "Login berhasil.", user: { username: user.username, role: user.role } });
  }

  addLog("LOGIN_FAILED", `Login gagal untuk '${username}'`, ip);
  res.status(401).json({ success: false, message: "Username atau password salah." });
});

app.post("/logout", (req, res) => {
  const username = req.session?.user?.username || "-";
  addLog("LOGOUT", `User '${username}' logout`, req.ip);
  req.session.destroy(() => res.json({ success: true, message: "Logout berhasil." }));
});

app.get("/auth/me", (req, res) => {
  if (req.session?.user) return res.json({ loggedIn: true, user: req.session.user });
  res.json({ loggedIn: false });
});

// =====================================================
// ROUTES: Device & License (API publik â€” pakai rate limiter)
// =====================================================
app.use(apiLimiter, deviceRouter);
app.use(apiLimiter, licenseRouter);

// =====================================================
// ROUTES: Dashboard CRUD (butuh auth)
// =====================================================

// â”€â”€ USERS (Protected) â”€â”€
app.get("/users", requireAuth, (req, res) => {
  const users = readJSON(USERS_FILE).map(({ password, ...u }) => u);
  res.json({ total: users.length, users });
});

app.post("/users", requireAuth, (req, res) => {
  const { username, password, role } = req.body;
  const ip = req.ip;

  if (!username || !password)
    return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });

  const users = readJSON(USERS_FILE);
  if (users.find(u => u.username === username))
    return res.status(409).json({ success: false, message: "Username sudah digunakan." });

  const newUser = { id: Date.now(), username, password, role: role || "user", createdAt: new Date().toISOString() };
  users.push(newUser);
  writeJSON(USERS_FILE, users);
  addLog("USER_CREATED", `User baru: ${username} (${role || "user"})`, ip);

  const { password: _, ...safeUser } = newUser;
  res.status(201).json({ success: true, message: "User berhasil dibuat.", user: safeUser });
});

app.delete("/users/:username", requireAuth, (req, res) => {
  const { username } = req.params;
  const ip = req.ip;

  if (username === "admin")
    return res.status(403).json({ success: false, message: "User 'admin' tidak boleh dihapus." });

  const users = readJSON(USERS_FILE);
  const newUsers = users.filter(u => u.username !== username);
  if (newUsers.length === users.length)
    return res.status(404).json({ success: false, message: "User tidak ditemukan." });

  writeJSON(USERS_FILE, newUsers);
  addLog("USER_DELETED", `User dihapus: ${username}`, ip);
  res.json({ success: true, message: `User '${username}' berhasil dihapus.` });
});

app.patch("/users/:username/password", requireAuth, (req, res) => {
  const { username } = req.params;
  const { newPassword } = req.body;
  const ip = req.ip;

  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ success: false, message: "Password minimal 6 karakter." });

  const users = readJSON(USERS_FILE);
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) return res.status(404).json({ success: false, message: "User tidak ditemukan." });

  users[idx].password = newPassword;
  writeJSON(USERS_FILE, users);
  addLog("PASSWORD_CHANGED", `Password diubah: ${username}`, ip);
  res.json({ success: true, message: `Password '${username}' berhasil diubah.` });
});

// â”€â”€ LOGS (Protected) â”€â”€
app.get("/logs", requireAuth, (req, res) => {
  const { limit = 100, action } = req.query;
  let logs = readJSON(LOGS_FILE);
  if (action) logs = logs.filter(l => l.action === action.toUpperCase());
  logs = logs.slice(-parseInt(limit)).reverse();
  res.json({ total: logs.length, logs });
});

app.delete("/logs", requireAuth, (req, res) => {
  writeJSON(LOGS_FILE, []);
  res.json({ success: true, message: "Semua log berhasil dihapus." });
});

// â”€â”€ ANALYTICS (Protected) â”€â”€
app.get("/analytics", requireAuth, (req, res) => {
  const logs = readJSON(LOGS_FILE);
  const licenses = readJSON(LICENSES_FILE);
  const devicesRaw = fs.existsSync(path.join(__dirname, "devices.json"))
    ? JSON.parse(fs.readFileSync(path.join(__dirname, "devices.json"), "utf-8"))
    : {};

  const now = Date.now();
  const TIMEOUT = 30000;

  // Hitung aktivitas per hari (7 hari terakhir)
  const dailyActivity = {};
  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split("T")[0];
  }).reverse();

  last7Days.forEach(day => { dailyActivity[day] = { success: 0, failed: 0 }; });

  logs.forEach(log => {
    const day = log.timestamp?.split("T")[0];
    if (dailyActivity[day]) {
      if (log.action?.includes("SUCCESS") || log.action?.includes("CREATED")) dailyActivity[day].success++;
      if (log.action?.includes("FAILED") || log.action?.includes("REVOKED")) dailyActivity[day].failed++;
    }
  });

  // License stats
  const licenseStats = {
    total: licenses.length,
    active: licenses.filter(l => l.status === "active").length,
    revoked: licenses.filter(l => l.status === "revoked").length,
    pro: licenses.filter(l => l.type === "pro").length,
    free: licenses.filter(l => l.type === "free").length
  };

  // Device stats
  const deviceList = Object.values(devicesRaw);
  const deviceStats = {
    total: deviceList.length,
    online: deviceList.filter(d => now - new Date(d.lastSeen).getTime() < TIMEOUT).length
  };

  // Login stats
  const loginSuccess = logs.filter(l => l.action === "LOGIN_SUCCESS").length;
  const loginFailed = logs.filter(l => l.action === "LOGIN_FAILED").length;

  res.json({
    dailyActivity,
    licenseStats,
    deviceStats,
    loginStats: { success: loginSuccess, failed: loginFailed },
    totalLogs: logs.length
  });
});

// â”€â”€ STATUS API (Publik) â”€â”€
app.get("/api/status", (req, res) => {
  const devicesRaw = fs.existsSync(path.join(__dirname, "devices.json"))
    ? JSON.parse(fs.readFileSync(path.join(__dirname, "devices.json"), "utf-8"))
    : {};
  const now = Date.now();
  const onlineCount = Object.values(devicesRaw).filter(
    d => now - new Date(d.lastSeen).getTime() < 30000
  ).length;

  res.json({
    status: "online",
    message: "RBA Studio License Server is Online ðŸš€",
    serverTime: new Date().toISOString(),
    onlineDevices: onlineCount,
    totalDevices: Object.keys(devicesRaw).length
  });
});

app.get("/ping", (req, res) => {
  res.json({ pong: true, time: new Date().toISOString() });
});

// =====================================================
// ROUTE: Dashboard HTML (serve index.html)
// =====================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =====================================================
// 404 & ERROR HANDLER
// =====================================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route '${req.method} ${req.path}' tidak ditemukan.` });
});

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ success: false, message: "Internal Server Error.", error: err.message });
});

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("=========================================");
  console.log(" RBA Studio License Server v2.0");
  console.log(` Port    : ${PORT}`);
  console.log(` Started : ${new Date().toISOString()}`);
  console.log(" Features: Auth Session, Persistent DB,");
  console.log("           SSE Realtime, Analytics, Rate Limit");
  console.log("=========================================");
});
