const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const USERS_FILE = path.join(__dirname, "../users.json");

const initDB = () => {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultData = [
      { username: "admin", password: "admin123", role: "admin" }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultData, null, 2));
    console.log("users.json created.");
  }
};

const readUsers = () => {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {
    return [];
  }
};

initDB();

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    return res.json({ success: true, user: { username: user.username, role: user.role } });
  }
  res.json({ success: false, reason: "Username atau password salah." });
});

module.exports = router;
