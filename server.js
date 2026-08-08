const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// قاعدة بيانات PostgreSQL عند توفر DATABASE_URL (في Railway)، وإلا SQLite محليًا
let db = null;
if (process.env.DATABASE_URL) {
    try {
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
            max: 5,
            idleTimeoutMillis: 30000,
        });
        pool.on('connect', () => console.log('PostgreSQL connected'));
        pool.on('error', (err) => console.error('PostgreSQL error:', err.message));
        db = pool;
    } catch (e) {
        console.error('pg load failed:', e.message);
    }
} else {
    try {
        let Database;
        try {
            Database = require('better-sqlite3');
        } catch (loadErr) {
            console.log('better-sqlite3 غير متوفر، سيتم العمل بدون قاعدة بيانات محلية');
            Database = null;
        }
        if (Database) {
            db = new Database(path.join(__dirname, 'tadbeer.sqlite'));
            db.pragma('journal_mode = WAL');
            console.log('SQLite local database ready');
        }
    } catch (e) {
        console.error('sqlite load failed:', e.message);
    }
}

async function initDb() {
    if (!db) return;
    try {
        if (typeof db.prepare === 'function') {
            db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    full_name TEXT,
                    phone TEXT,
                    email TEXT,
                    message TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT, phone TEXT, email TEXT,
                    service TEXT, details TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT, phone TEXT, email TEXT,
                    subject TEXT, message TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                );
            `);
            console.log('DB tables ensured');
        } else {
            await db.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    full_name TEXT,
                    phone TEXT,
                    email TEXT,
                    message TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS requests (
                    id SERIAL PRIMARY KEY,
                    name TEXT, phone TEXT, email TEXT,
                    service TEXT, details TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS contacts (
                    id SERIAL PRIMARY KEY,
                    name TEXT, phone TEXT, email TEXT,
                    subject TEXT, message TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
            `);
            console.log('PostgreSQL tables ensured');
        }
    } catch (e) {
        console.error('initDb error:', e.message);
    }
}

initDb();

// ملفات ثابتة
app.use(express.static(__dirname, { maxAge: '1d' }));

// نقاط الحفظ في قاعدة البيانات
async function insertRecord(table, row) {
    if (!db) return { fallback: true, table, row };
    if (typeof db.prepare === 'function') {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
        return { success: true, table };
    } else {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        await db.query(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${vals.map((_, i) => '$' + (i + 1)).join(',')})`, vals);
        return { success: true, table };
    }
}

app.post('/api/db/:table', async (req, res) => {
    const { table } = req.params;
    if (!['users', 'requests', 'contacts'].includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    try {
        const result = await insertRecord(table, req.body);
        res.status(201).json(result);
    } catch (e) {
        console.error('insert error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/db/:table', async (req, res) => {
    const { table } = req.params;
    if (!['users', 'requests', 'contacts'].includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    try {
        let rows;
        if (typeof db.prepare === 'function') {
            rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 200`).all();
        } else {
            const r = await db.query(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 200`);
            rows = r.rows;
        }
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// fallback لتطبيق SPA: أي مسار لا يحتوي نقطة يُخدم بـ index.html
app.get(/^((?!\.).)*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    if (process.env.DATABASE_URL) console.log('Using PostgreSQL (DATABASE_URL)');
});
