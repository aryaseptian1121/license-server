// =====================================================
// auth.js — Modul Autentikasi Dashboard RBA Studio
// =====================================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const USERS_FILE = path.join(__dirname, "users.json");

// ── HELPERS ──
const readUsers = () => {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")); }
  catch { return []; }
};

const writeUsers = (data) => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
};

const initUsersDB = () => {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultData = [
      {
        id: 1,
        username: "admin",
        password: "admin123",
        role: "admin",
        createdAt: new Date().toISOString()
      }
    ];
    writeUsers(defaultData);
    console.log("[AUTH] users.json dibuat otomatis.");
  }
};

initUsersDB();

// ── MIDDLEWARE: Cek session login ──
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ success: false, message: "Unauthorized. Silakan login terlebih dahulu." });
};

// ── MIDDLEWARE: Cek role admin ──
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === "admin") return next();
  return res.status(403).json({ success: false, message: "Forbidden. Hanya admin yang diizinkan." });
};

// ── POST /auth/login ──
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
  }

  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ success: false, message: "Username atau password salah." });
  }

  // Simpan session
  req.session.user = { id: user.id, username: user.username, role: user.role };
  req.session.loginAt = new Date().toISOString();

  console.log(`[AUTH] Login: ${username} | IP: ${ip}`);
  return res.json({
    success: true,
    message: "Login berhasil.",
    user: { username: user.username, role: user.role }
  });
});

// ── POST /auth/logout ──
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: "Logout berhasil." });
  });
});

// ── GET /auth/me ── (cek status login)
router.get("/me", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.json({ loggedIn: false });
});

module.exports = { router, requireAuth, requireAdmin };
