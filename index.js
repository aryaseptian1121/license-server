const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(express.json());

// =======================
// DATABASE USER (EXISTING)
// =======================
const USERS_FILE = path.join(__dirname, "users.json");

const initDB = () => {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultData = [
      { username: "admin", password: "admin123", role: "admin" }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultData, null, 2));
    console.log("Database users.json berhasil dibuat otomatis.");
  }
};

const readUsers = () => {
  try {
    const data = fs.readFileSync(USERS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
};

initDB();

// =======================
// DEVICE MONITORING SYSTEM (NEW)
// =======================
let devices = {};

// =======================
// ROUTES
// =======================

// 1. STATUS SERVER
app.get("/", (req, res) => {
  res.send("RBA Development License Server is Online 🚀");
});

// 2. LOGIN
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    return res.json({
      success: true,
      user: { username: user.username, role: user.role }
    });
  }

  res.json({ success: false, reason: "Akses Ditolak: Username atau Password salah!" });
});

// 3. VALIDASI LICENSE
app.post("/validate", (req, res) => {
  const { license_key } = req.body;

  if (license_key === "ABC-123") {
    return res.json({ valid: true });
  }

  res.json({ valid: false });
});

// =======================
// 4. DEVICE ONLINE (NEW)
// =======================
app.post("/online", (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({
      success: false,
      message: "deviceId wajib diisi"
    });
  }

  devices[deviceId] = {
    lastSeen: new Date()
  };

  console.log("Device online:", deviceId);

  res.json({ success: true });
});

// =======================
// 5. CEK DEVICE (NEW)
// =======================
app.get("/devices", (req, res) => {
  const now = Date.now();
  let online = 0;

  for (let id in devices) {
    const last = new Date(devices[id].lastSeen).getTime();

    if (now - last < 15000) { // 15 detik
      online++;
    }
  }

  res.json({
    total: Object.keys(devices).length,
    online: online,
    devices: devices
  });
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server jalan di port " + PORT);
});
