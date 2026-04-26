const express = require("express");
const router = express.Router();

// Untuk production: simpan di environment variable atau database
const VALID_LICENSES = (process.env.LICENSE_KEYS || "ABC-123").split(",");

router.post("/validate", (req, res) => {
  const { license_key } = req.body;
  if (!license_key) {
    return res.status(400).json({ valid: false, reason: "License key wajib diisi." });
  }
  const valid = VALID_LICENSES.includes(license_key.trim());
  res.json({ valid, reason: valid ? "License valid." : "License tidak ditemukan." });
});

module.exports = router;
