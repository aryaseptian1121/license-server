const express = require("express");
const router = express.Router();

// In-memory device store
// Structure: { deviceId: { lastSeen, name, ip, status } }
let devices = {};

const TIMEOUT_MS = 15000; // 15 detik tidak heartbeat = offline

const getDeviceStatus = (lastSeen) => {
  return Date.now() - new Date(lastSeen).getTime() < TIMEOUT_MS ? "online" : "offline";
};

// Device kirim heartbeat
router.post("/online", (req, res) => {
  const { deviceId, name, ip } = req.body;
  if (!deviceId) {
    return res.status(400).json({ success: false, message: "deviceId wajib diisi" });
  }
  const isNew = !devices[deviceId];
  devices[deviceId] = {
    deviceId,
    name: name || deviceId,
    ip: ip || req.ip,
    lastSeen: new Date(),
    firstSeen: devices[deviceId]?.firstSeen || new Date(),
  };
  console.log(`[${isNew ? "NEW" : "HEARTBEAT"}] Device: ${deviceId}`);
  res.json({ success: true });
});

// Device lapor offline (graceful disconnect)
router.post("/offline", (req, res) => {
  const { deviceId } = req.body;
  if (deviceId && devices[deviceId]) {
    devices[deviceId].lastSeen = new Date(0); // set ke masa lalu
  }
  res.json({ success: true });
});

// Dashboard: semua device dengan status
router.get("/devices", (req, res) => {
  const list = Object.values(devices).map(d => ({
    ...d,
    status: getDeviceStatus(d.lastSeen),
    lastSeenAgo: Math.floor((Date.now() - new Date(d.lastSeen).getTime()) / 1000),
  }));

  const online = list.filter(d => d.status === "online").length;
  const offline = list.filter(d => d.status === "offline").length;

  res.json({
    summary: { total: list.length, online, offline },
    devices: list,
  });
});

// Reset semua device (admin only - tambahkan auth middleware nanti)
router.delete("/devices", (req, res) => {
  devices = {};
  res.json({ success: true, message: "Semua device direset." });
});

module.exports = router;
