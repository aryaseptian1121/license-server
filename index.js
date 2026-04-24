const express = require("express");
const app = express();

app.use(express.json());

// 1. Cek status server (Muncul di browser)
app.get("/", (req, res) => {
  res.send("License Server Running 🚀");
});

// 2. Endpoint LOGIN (Dipanggil oleh RBA Studio auth.js)
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // Sesuaikan username & password di sini
  if (username === "admin" && password === "admin123") {
    return res.json({ 
      success: true, 
      user: { username: "admin", role: "admin" } 
    });
  }

  res.json({ success: false, reason: "Username atau Password salah!" });
});

// 3. Endpoint VALIDASI LICENSE (Untuk fitur lisensi Anda)
app.post("/validate", (req, res) => {
  const { license_key } = req.body;

  if (license_key === "ABC-123") {
    return res.json({ valid: true });
  }

  res.json({ valid: false });
});

// Gunakan PORT dari Railway atau default ke 8080
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server jalan di port " + PORT));
