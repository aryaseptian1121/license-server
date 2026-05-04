// =====================================================
// devices.js — Modul Device Monitoring RBA Studio
// Upgrade: persistent storage (tidak hilang saat restart)
// =====================================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const DEVICES_FILE = path.join(__dirname, "devices.json");
const TIMEOUT_MS = 30000; // 30 detik tidak heartbeat = offline

// ── HELPERS: Baca / Tulis JSON ──
const readDevices = () => {
  try { return JSON.parse(fs.readFileSync(DEVICES_FILE, "utf-8")); }
  catch { return {}; }
};

const writeDevices = (data) => {
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(data, null, 2));
};

const initDevicesDB = () => {
  if (!fs.existsSync(DEVICES_FILE)) {
    writeDevices({});
    console.log("[DEVICES] devices.json dibuat otomatis.");
  }
};

initDevicesDB();

// ── STATUS HELPER ──
const getStatus = (lastSeen) => {
  return Date.now() - new Date(lastSeen).getTime() < TIMEOUT_MS ? "online" : "offline";
};

// ── POST /online — Device kirim heartbeat ──
router.post("/online", (req, res) => {
  const { deviceId, username, licenseKey, name } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"] || "-";

  if (!deviceId) {
    return res.status(400).json({ success: false, message: "deviceId wajib diisi." });
  }

  const devices = readDevices();
  const isNew = !devices[deviceId];

  devices[deviceId] = {
    deviceId,
    name: name || deviceId,
    username: username || "unknown",
    licenseKey: licenseKey || "-",
    ip,
    lastSeen: new Date().toISOString(),
    firstSeen: devices[deviceId]?.firstSeen || new Date().toISOString(),
    pingCount: (devices[deviceId]?.pingCount || 0) + 1
  };

  writeDevices(devices);
  console.log(`[DEVICE ${isNew ? "NEW" : "PING"}] ${deviceId} | User: ${username || "-"} | IP: ${ip}`);
  res.json({ success: true, message: "Device tercatat online." });
});

// ── POST /offline — Device lapor offline (graceful) ──
router.post("/offline", (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ success: false, message: "deviceId wajib diisi." });

  const devices = readDevices();
  if (devices[deviceId]) {
    devices[deviceId].lastSeen = new Date(0).toISOString();
    writeDevices(devices);
  }
  res.json({ success: true, message: "Device tercatat offline." });
});

// ── GET /devices — Semua device dengan status ──
router.get("/devices", (req, res) => {
  const devices = readDevices();
  const now = Date.now();
  const result = {};
  let onlineCount = 0;

  for (const [id, data] of Object.entries(devices)) {
    const isOnline = now - new Date(data.lastSeen).getTime() < TIMEOUT_MS;
    if (isOnline) onlineCount++;
    result[id] = {
      ...data,
      status: isOnline ? "online" : "offline",
      lastSeenAgo: Math.floor((now - new Date(data.lastSeen).getTime()) / 1000)
    };
  }

  res.json({
    total: Object.keys(devices).length,
    online: onlineCount,
    offline: Object.keys(devices).length - onlineCount,
    devices: result
  });
});

// ── DELETE /devices/:deviceId — Hapus satu device ──
router.delete("/devices/:deviceId", (req, res) => {
  const { deviceId } = req.params;
  const devices = readDevices();

  if (!devices[deviceId]) {
    return res.status(404).json({ success: false, message: "Device tidak ditemukan." });
  }

  delete devices[deviceId];
  writeDevices(devices);
  res.json({ success: true, message: `Device '${deviceId}' berhasil dihapus.` });
});

// ── DELETE /devices — Reset semua device ──
router.delete("/devices", (req, res) => {
  writeDevices({});
  res.json({ success: true, message: "Semua device berhasil direset." });
});

// ── GET /devices/stats — Statistik untuk analytics ──
router.get("/devices/stats", (req, res) => {
  const devices = readDevices();
  const now = Date.now();
  const list = Object.values(devices);

  const online = list.filter(d => now - new Date(d.lastSeen).getTime() < TIMEOUT_MS).length;
  const offline = list.length - online;

  // Hitung device unik per license
  const licenseUsage = {};
  list.forEach(d => {
    if (d.licenseKey && d.licenseKey !== "-") {
      licenseUsage[d.licenseKey] = (licenseUsage[d.licenseKey] || 0) + 1;
    }
  });

  res.json({
    total: list.length,
    online,
    offline,
    licenseUsage
  });
});

module.exports = router;
