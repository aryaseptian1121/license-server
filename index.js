const express = require("express");
const app = express();

app.use(express.json());

// test server
app.get("/", (req, res) => {
  res.send("License Server Running 🚀");
});

// validasi license
app.post("/validate", (req, res) => {
  const { license_key } = req.body;

  if (license_key === "ABC-123") {
    return res.json({ valid: true });
  }

  res.json({ valid: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server jalan di port " + PORT));