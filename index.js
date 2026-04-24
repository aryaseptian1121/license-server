const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(express.json());

// Path ke file database sederhana
const USERS_FILE = path.join(__dirname, "users.json");

// Fungsi untuk memastikan file users.json ada
const initDB = () => {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultData = [
      { username: "admin", password: "admin123", role: "admin" }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultData, null, 2));
    console.log("Database users.json berhasil dibuat otomatis.");
  }
};

// Fungsi pembantu untuk membaca data user
const readUsers = () => {
  try {
    const data = fs.readFileSync(USERS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
};

// Panggil inisialisasi saat server nyala
initDB();

// 1. Cek status server
app.get("/", (req, res) => {
  res.send("RBA Development License Server is Online 🚀");
});

// 2. Endpoint LOGIN (Cek ke database users.json)
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  // Mencari user yang username dan password-nya cocok
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    return res.json({ 
      success: true, 
      user: { username: user.username, role: user.role } 
    });
  }

  res.json({ success: false, reason: "Akses Ditolak: Username atau Password salah!" });
});

// 3. Endpoint VALIDASI LICENSE
app.post("/validate", (req, res) => {
  const { license_key } = req.body;
  // Anda bisa mengembangkan ini nanti agar cek ke file license.json
  if (license_key === "ABC-123") {
    return res.json({ valid: true });
  }
  res.json({ valid: false });
});

// Jalankan Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server jalan di port " + PORT);
});
