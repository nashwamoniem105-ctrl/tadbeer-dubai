const express = require('express');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const DB_PATH = path.join(__dirname, 'tadbeer.db');

// --- إعدادات قاعدة البيانات ---
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'customer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    service_type TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
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

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- API لخدمة الملفات المخزنة (Mock API) ---
app.get('/api/:port/*', (req, res) => {
    const { port } = req.params;
    const filePath = req.params[0];
    const fullPath = path.join(__dirname, 'api', port, 'api', filePath);
    
    // محاولة البحث عن الملف بملحق .html أو بدون
    const pathsToTry = [
        fullPath,
        fullPath + '.html',
        path.join(__dirname, 'api', port, filePath),
        path.join(__dirname, 'api', port, filePath + '.html')
    ];

    for (const p of pathsToTry) {
        if (fs.existsSync(p) && fs.lstatSync(p).isFile()) {
            return res.sendFile(p);
        }
    }
    
    res.status(404).json({ error: 'Not Found in cache', path: filePath });
});

// --- API ديناميكي لقاعدة البيانات ---
app.post('/api/users', (req, res) => {
    const { name, email, phone } = req.body;
    try {
        const stmt = db.prepare('INSERT INTO users (name, email, phone) VALUES (?, ?, ?)');
        const result = stmt.run(name, email, phone);
        res.status(201).json({ id: result.lastInsertRowid, name, email });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/requests', (req, res) => {
    const { user_id, service_type, description } = req.body;
    const stmt = db.prepare('INSERT INTO service_requests (user_id, service_type, description) VALUES (?, ?, ?)');
    const result = stmt.run(user_id, service_type, description);
    res.status(201).json({ id: result.lastInsertRowid });
});

// --- نظام الـ SPA Routing ---
app.get(/^((?!\.).)*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
