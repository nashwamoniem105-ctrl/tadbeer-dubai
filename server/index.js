/**
 * Tadbeer Dubai - Backend API & Static Hosting
 * النظام الخلفي + API + قاعدة البيانات + استضافة واجهة Angular
 */
const express = require("express");
const path = require("path");
const cors = require("cors");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "tadbeer.db");

// ---------------- إعدادات عامة ----------------
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------------- قاعدة البيانات SQLite ----------------
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'customer',   -- customer | admin
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    service_type TEXT NOT NULL,      -- hourly | monthly
    description TEXT,
    status TEXT DEFAULT 'pending',   -- pending | in_progress | completed | cancelled
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---------------- API ----------------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Tadbeer Dubai API", timestamp: new Date().toISOString() });
});

// المستخدمين
app.post("/api/users", (req, res) => {
  const { name, email, phone } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: "name و email مطلوبان" });
  try {
    const stmt = db.prepare("INSERT INTO users (name, email, phone) VALUES (?, ?, ?)");
    const result = stmt.run(name, email, phone || null);
    res.status(201).json({ id: result.lastInsertRowid, name, email, phone });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(409).json({ error: "البريد مسجل مسبقًا" });
    throw e;
  }
});

app.get("/api/users", (req, res) => {
  res.json(db.prepare("SELECT id, name, email, phone, role, created_at FROM users ORDER BY id DESC").all());
});

// طلبات الخدمة
app.post("/api/requests", (req, res) => {
  const { user_id, service_type, description } = req.body || {};
  if (!service_type) return res.status(400).json({ error: "service_type مطلوب" });
  const stmt = db.prepare("INSERT INTO service_requests (user_id, service_type, description) VALUES (?, ?, ?)");
  const result = stmt.run(user_id || null, service_type, description || null);
  res.status(201).json({ id: result.lastInsertRowid, user_id, service_type, description, status: "pending" });
});

app.get("/api/requests", (req, res) => {
  res.json(db.prepare("SELECT * FROM service_requests ORDER BY id DESC").all());
});

app.patch("/api/requests/:id", (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: "status مطلوب" });
  const stmt = db.prepare("UPDATE service_requests SET status = ? WHERE id = ?");
  const info = stmt.run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "الطلب غير موجود" });
  res.json({ id: Number(req.params.id), status });
});

// نموذج التواصل
app.post("/api/contact", (req, res) => {
  const { name, email, phone, message } = req.body || {};
  if (!name || !message) return res.status(400).json({ error: "الاسم والرسالة مطلوبان" });
  const stmt = db.prepare("INSERT INTO contacts (name, email, phone, message) VALUES (?, ?, ?, ?)");
  const result = stmt.run(name, email || null, phone || null, message);
  res.status(201).json({ id: result.lastInsertRowid, name, message });
});

app.get("/api/contact", (req, res) => {
  res.json(db.prepare("SELECT * FROM contacts ORDER BY id DESC").all());
});

// صفحة ترحيب API
app.get("/api", (req, res) => {
  res.json({
    service: "Tadbeer Dubai API",
    version: "1.0.0",
    endpoints: {
      health: "GET /api/health",
      users: "POST /api/users | GET /api/users",
      requests: "POST /api/requests | GET /api/requests | PATCH /api/requests/:id",
      contact: "POST /api/contact | GET /api/contact",
    },
  });
});

// ---------------- استضافة الواجهة (Angular) ----------------
const clientDir = path.join(__dirname, "..", "client");
app.use(express.static(clientDir, { maxAge: "1d" }));

// SPA fallback: كل المسارات غير المطابقة تخدم index.html
app.get(/.*/, (req, res, next) => {
  // لا تعتراض مسارات API
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDir, "index.html"));
});

// ---------------- التشغيل ----------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Tadbeer Dubai server running on port ${PORT}`);
  console.log(`Client: http://localhost:${PORT}`);
  console.log(`API:    http://localhost:${PORT}/api`);
});
