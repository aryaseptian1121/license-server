// =====================================================
// license.js — Modul License Management RBA Studio
// Upgrade: device binding, quota tracking, expiry check
// =====================================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const router = express.Router();

const LICENSES_FILE = path.join(__dirname, "licenses.json");
const DEVICES_FILE = path.join(__dirname, "devices.json");

// ── HELPERS ──
const readJSON = (filePath) => {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return []; }
};

const writeJSON = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const generateLicenseKey = (type = "free") => {
  const prefix = type === "pro" ? "PRO" : "FREE";
  const rand = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `RBA-${prefix}-${rand}`;
};

const initLicensesDB = () => {
  if (!fs.existsSync(LICENSES_FILE)) {
    const defaultLicenses = [
      {
        key: "ABC-123-FREE",
        type: "free",
        status: "active",
        maxDevices: 1,
        boundDevices: [],
        expiresAt: null,
        createdAt: new Date().toISOString()
      },
      {
        key: "RBA-PRO-2025",
        type: "pro",
        status: "active",
        maxDevices: 5,
        boundDevices: [],
        expiresAt: "2026-12-31T23:59:59.000Z",
        createdAt: new Date().toISOString()
      }
    ];
    writeJSON(LICENSES_FILE, defaultLicenses);
    console.log("[LICENSE] licenses.json dibuat otomatis.");
  }
};

initLicensesDB();

// ── POST /validate — Validasi license key dengan device binding ──
router.post("/validate", (req, res) => {
  const { license_key, deviceId } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"] || "-";

  if (!license_key) {
    return res.status(400).json({ valid: false, message: "license_key wajib diisi." });
  }

  const licenses = readJSON(LICENSES_FILE);
  const idx = licenses.findIndex(l => l.key === license_key);

  if (idx === -1) {
    return res.json({ valid: false, message: "License key tidak valid." });
  }

  const license = licenses[idx];

  if (license.status !== "active") {
    return res.json({ valid: false, message: `License berstatus '${license.status}'.` });
  }

  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    return res.json({ valid: false, message: "License sudah kadaluarsa." });
  }

  // ── Device Binding Logic ──
  if (deviceId) {
    if (!license.boundDevices) license.boundDevices = [];

    const alreadyBound = license.boundDevices.includes(deviceId);

    if (!alreadyBound) {
      // Cek kuota device
      if (license.boundDevices.length >= license.maxDevices) {
        return res.json({
          valid: false,
          message: `Kuota device penuh. License ini hanya untuk ${license.maxDevices} device.`
        });
      }
      // Tambahkan device baru
      license.boundDevices.push(deviceId);
      licenses[idx] = license;
      writeJSON(LICENSES_FILE, licenses);
      console.log(`[LICENSE] Device baru terikat: ${deviceId} → ${license_key}`);
    }
  }

  res.json({
    valid: true,
    message: "License aktif dan valid.",
    license: {
      key: license.key,
      type: license.type,
      maxDevices: license.maxDevices,
      usedDevices: license.boundDevices ? license.boundDevices.length : 0,
      expiresAt: license.expiresAt
    }
  });
});

// ── GET /licenses — Semua license ──
router.get("/licenses", (req, res) => {
  const licenses = readJSON(LICENSES_FILE);
  // Hitung usage dari devices.json
  const devices = fs.existsSync(DEVICES_FILE)
    ? JSON.parse(fs.readFileSync(DEVICES_FILE, "utf-8"))
    : {};

  const enriched = licenses.map(l => {
    const activeDevices = Object.values(devices).filter(d => d.licenseKey === l.key).length;
    return {
      ...l,
      activeDevices,
      usedSlots: l.boundDevices ? l.boundDevices.length : 0
    };
  });

  res.json({ total: licenses.length, licenses: enriched });
});

// ── POST /licenses — Buat license baru ──
router.post("/licenses", (req, res) => {
  const { type, maxDevices, expiresAt } = req.body;

  const newLicense = {
    key: generateLicenseKey(type || "free"),
    type: type || "free",
    status: "active",
    maxDevices: maxDevices || 1,
    boundDevices: [],
    expiresAt: expiresAt || null,
    createdAt: new Date().toISOString()
  };

  const licenses = readJSON(LICENSES_FILE);
  licenses.push(newLicense);
  writeJSON(LICENSES_FILE, licenses);

  console.log(`[LICENSE] Baru dibuat: ${newLicense.key}`);
  res.status(201).json({ success: true, message: "License berhasil dibuat.", license: newLicense });
});

// ── PATCH /licenses/:key/revoke ──
router.patch("/licenses/:key/revoke", (req, res) => {
  const { key } = req.params;
  const licenses = readJSON(LICENSES_FILE);
  const idx = licenses.findIndex(l => l.key === key);

  if (idx === -1) return res.status(404).json({ success: false, message: "License tidak ditemukan." });

  licenses[idx].status = "revoked";
  writeJSON(LICENSES_FILE, licenses);
  res.json({ success: true, message: `License '${key}' berhasil direvoke.` });
});

// ── PATCH /licenses/:key/activate ──
router.patch("/licenses/:key/activate", (req, res) => {
  const { key } = req.params;
  const licenses = readJSON(LICENSES_FILE);
  const idx = licenses.findIndex(l => l.key === key);

  if (idx === -1) return res.status(404).json({ success: false, message: "License tidak ditemukan." });

  licenses[idx].status = "active";
  writeJSON(LICENSES_FILE, licenses);
  res.json({ success: true, message: `License '${key}' berhasil diaktifkan.` });
});

// ── DELETE /licenses/:key/device/:deviceId — Lepas binding device dari license ──
router.delete("/licenses/:key/device/:deviceId", (req, res) => {
  const { key, deviceId } = req.params;
  const licenses = readJSON(LICENSES_FILE);
  const idx = licenses.findIndex(l => l.key === key);

  if (idx === -1) return res.status(404).json({ success: false, message: "License tidak ditemukan." });

  licenses[idx].boundDevices = (licenses[idx].boundDevices || []).filter(d => d !== deviceId);
  writeJSON(LICENSES_FILE, licenses);
  res.json({ success: true, message: `Device '${deviceId}' dilepas dari license '${key}'.` });
});

module.exports = router;
